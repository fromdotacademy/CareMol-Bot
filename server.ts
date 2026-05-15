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
    const adminModule = await import("./src/services/firebaseAdmin");
    const admin = adminModule.default;
    const { handleWhatsAppMessage } = await import("./src/services/botLogic");
    const { sendWhatsAppMessage } = await import("./src/services/whatsappService");

    app.use(express.json());

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

    // Dev-only: generate a Firebase custom token for the hardcoded admin.
    // Used by Playwright auth setup so tests never need Google OAuth.
    if (process.env.NODE_ENV !== "production") {
      app.get("/api/dev-token", async (req, res) => {
        try {
          const adminEmails = ["tubejaf@gmail.com", "fromdotacademy@gmail.com"];
          let uid: string | null = null;
          for (const email of adminEmails) {
            try {
              const user = await admin.auth().getUserByEmail(email);
              uid = user.uid;
              break;
            } catch { /* try next */ }
          }
          if (!uid) return res.status(404).json({ error: "No hardcoded admin user found in Firebase Auth" });
          const token = await admin.auth().createCustomToken(uid);
          res.json({ token, uid });
        } catch (err) {
          res.status(500).json({ error: String(err) });
        }
      });
    }

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
