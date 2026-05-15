import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// 1. HEALTH CHECK ALIVE IMMEDIATELY
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString(), boot: "fast" });
});

// 2. LISTEN IMMEDIATELY
app.listen(PORT, "0.0.0.0", () => {
  console.log(`[BOOT] Server listening on port ${PORT}`);
});

// 3. BACKGROUND INITIALIZE
async function init() {
  try {
    console.log("[BOOT] Loading heavy services...");
    const { admin, adminDb } = await import("./src/services/firebaseAdmin");
    const { handleWhatsAppMessage } = await import("./src/services/botLogic");
    const { sendWhatsAppMessage } = await import("./src/services/whatsappService");
    const { HARDCODED_ADMIN_EMAILS } = await import("./src/lib/adminEmails");

    app.use(express.json());

    // Staff creation — only callable by an admin. Creates a Firebase Auth user
    // (email + password) and the staff/{uid} doc in one shot.
    app.post("/api/staff", async (req, res) => {
      try {
        const authHeader = req.headers.authorization || "";
        const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
        if (!idToken) return res.status(401).json({ error: "Missing token" });

        let decoded;
        try {
          decoded = await admin.auth().verifyIdToken(idToken);
        } catch {
          return res.status(401).json({ error: "Invalid token" });
        }

        const callerEmail = decoded.email || "";
        let isAdmin = HARDCODED_ADMIN_EMAILS.has(callerEmail);
        if (!isAdmin) {
          const callerStaff = await adminDb.collection("staff").doc(decoded.uid).get();
          const data = callerStaff.exists ? callerStaff.data() : null;
          isAdmin = !!(data && data.role === "admin" && data.active === true);
        }
        if (!isAdmin) return res.status(403).json({ error: "Admins only" });

        const { email, name, phone, role, defaultSchedule } = req.body || {};
        if (!email || !name || !role) return res.status(400).json({ error: "Missing fields" });
        if (role !== "admin" && role !== "phlebotomist") {
          return res.status(400).json({ error: "Invalid role" });
        }
        if (role === "phlebotomist" && (!phone || String(phone).length < 6)) {
          return res.status(400).json({ error: "Phone (>=6 digits) required for phlebotomists" });
        }

        // Password = phone without country code. Firebase requires >= 6 chars.
        const password = String(phone || "");

        let newUid: string;
        try {
          const userRecord = await admin.auth().createUser({
            email: String(email).trim(),
            password,
            displayName: String(name).trim(),
          });
          newUid = userRecord.uid;
        } catch (e: any) {
          return res.status(400).json({ error: e.message || String(e), code: e.code });
        }

        try {
          const payload: any = {
            uid: newUid,
            email: String(email).trim(),
            name: String(name).trim(),
            phone: phone ? String(phone).trim() : null,
            role,
            active: true,
            createdAt: new Date().toISOString(),
            createdBy: decoded.uid,
          };
          if (role === "phlebotomist" && defaultSchedule) {
            payload.defaultSchedule = defaultSchedule;
          }
          await adminDb.collection("staff").doc(newUid).set(payload, { merge: true });
        } catch (e: any) {
          await admin.auth().deleteUser(newUid).catch(() => { /* best-effort rollback */ });
          return res.status(500).json({ error: "Failed to save staff record: " + (e.message || String(e)) });
        }

        return res.json({ uid: newUid });
      } catch (err: any) {
        console.error("[POST /api/staff]", err);
        return res.status(500).json({ error: err.message || String(err) });
      }
    });

    // Routing
    app.get("/api/whatsapp/webhook", (req, res) => {
      const mode = req.query["hub.mode"];
      const token = req.query["hub.verify_token"];
      const challenge = req.query["hub.challenge"];
      if (mode === "subscribe" && token === (process.env.VERIFY_TOKEN || "caremol_verify_token")) {
        return res.status(200).send(challenge);
      }
      res.status(403).send("Verification failed");
    });

    app.post("/api/whatsapp/webhook", async (req, res) => {
      try {
        const body = req.body;
        if (body.object === "whatsapp_business_account") {
          const messages = body.entry?.[0]?.changes?.[0]?.value?.messages;
          if (messages?.[0]) {
            const msg = messages[0];
            const from = msg.from;
            const text = msg.type === "text" ? msg.text.body : 
                        (msg.type === "interactive" ? (msg.interactive.button_reply?.title || msg.interactive.list_reply?.title) : "");
            
            if (text) {
              const responses = await handleWhatsAppMessage(from, text);
              for (const r of responses) {
                await sendWhatsAppMessage(from, r.text, r.buttons);
              }
            }
          }
          return res.sendStatus(200);
        }
        res.sendStatus(404);
      } catch (err) {
        console.error("[Webhook Error]", err);
        res.sendStatus(500);
      }
    });

    // Frontend Serving
    if (process.env.NODE_ENV !== "production") {
      console.log("[BOOT] Enabling Vite middleware (Development)");
      const { createServer: createViteServer } = await import("vite");
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } else {
      console.log("[BOOT] Serving static files (Production)");
      const distPath = path.join(process.cwd(), "dist");
      app.use(express.static(distPath));
      app.get("*", (req, res) => {
        res.sendFile(path.join(distPath, "index.html"));
      });
    }

    console.log("[BOOT] Services ready.");
  } catch (err) {
    console.error("[BOOT] Initialization error:", err);
  }
}

init();
