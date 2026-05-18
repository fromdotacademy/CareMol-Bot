import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { admin, adminDb } from "./src/services/firebaseAdmin.js";
import { handleWhatsAppMessage } from "./src/services/botLogic.js";
import { sendWhatsAppMessage } from "./src/services/whatsappService.js";
import { HARDCODED_ADMIN_EMAILS } from "./src/lib/adminEmails.js";
import { buildBookingConfirmation } from "./src/services/confirmationMessage.js";
import { TRANSLATIONS } from "./src/constants.js";
import { formatDateLabel } from "./src/services/slotService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// 1. HEALTH CHECK ALIVE IMMEDIATELY
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString(), boot: "fast" });
});

// 3. BACKGROUND INITIALIZE
async function init() {
  try {
    console.log("[BOOT] Loading heavy services...");
    const isStaff = async (decoded: { uid: string; email?: string }): Promise<{ ok: boolean; role?: "admin" | "phlebotomist" }> => {
      if (decoded.email && HARDCODED_ADMIN_EMAILS.has(decoded.email)) {
        return { ok: true, role: "admin" };
      }
      const snap = await adminDb.collection("staff").doc(decoded.uid).get();
      const data = snap.exists ? snap.data() : null;
      if (data && data.active === true && (data.role === "admin" || data.role === "phlebotomist")) {
        return { ok: true, role: data.role };
      }
      return { ok: false };
    };

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

    // Manual-booking confirmation: send the WhatsApp receipt for a booking
    // that was just written by admin/phleb from the dashboard. Idempotent —
    // the customer simply gets another receipt if it's called twice.
    app.post("/api/bookings/:id/notify", async (req, res) => {
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

        const staffCheck = await isStaff({ uid: decoded.uid, email: decoded.email });
        if (!staffCheck.ok) return res.status(403).json({ error: "Staff only" });

        const bookingId = String(req.params.id || "").trim();
        if (!bookingId) return res.status(400).json({ error: "Missing booking id" });

        const snap = await adminDb.collection("bookings").doc(bookingId).get();
        if (!snap.exists) return res.status(404).json({ error: "Booking not found" });
        const booking = snap.data() as any;

        const recipient = booking.patientPhone || booking.userId;
        if (!recipient) return res.status(400).json({ error: "Booking has no phone to notify" });

        // Touch users/{phone} so the customer's WhatsApp number is registered for
        // downstream reads (returning-customer detection, etc.). Admin SDK bypasses
        // rules — clients can't do this for arbitrary userIds.
        try {
          await adminDb.collection("users").doc(String(recipient)).set(
            {
              userId: String(recipient),
              phoneNumber: String(recipient),
              name: booking.patientName,
              language: booking.language || "en",
              lastActive: new Date().toISOString(),
            },
            { merge: true }
          );
        } catch (e) {
          console.warn("[notify] users/{phone} touch failed (continuing)", e);
        }

        if (!process.env.WHATSAPP_TOKEN || !process.env.WHATSAPP_PHONE_ID) {
          return res.json({ ok: true, sent: false, reason: "no-whatsapp-creds" });
        }

        const language = booking.language === "ml" ? "ml" : "en";
        const message = buildBookingConfirmation(booking, language);

        try {
          await sendWhatsAppMessage(String(recipient), message);
          return res.json({ ok: true, sent: true });
        } catch (e: any) {
          return res.status(502).json({ ok: false, sent: false, error: e.message || String(e) });
        }
      } catch (err: any) {
        console.error("[POST /api/bookings/:id/notify]", err);
        return res.status(500).json({ error: err.message || String(err) });
      }
    });

    // Bot notify — admin-only endpoint to send a WhatsApp message to the customer
    // when their booking is cancelled or rescheduled. The dashboard writes the
    // cancel/reschedule audit fields to Firestore FIRST, then POSTs here. This
    // endpoint reads all message-formatting data from the booking doc itself.
    app.post("/api/bot/notify", async (req, res) => {
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

        // Admin-only (NOT isStaff — phlebs cannot call this).
        const callerEmail = decoded.email || "";
        let isAdmin = HARDCODED_ADMIN_EMAILS.has(callerEmail);
        if (!isAdmin) {
          const callerStaff = await adminDb.collection("staff").doc(decoded.uid).get();
          const data = callerStaff.exists ? callerStaff.data() : null;
          isAdmin = !!(data && data.role === "admin" && data.active === true);
        }
        if (!isAdmin) return res.status(403).json({ error: "Admins only" });

        const { bookingId, kind } = (req.body || {}) as { bookingId?: string; kind?: string };
        if (!bookingId) return res.status(400).json({ error: "Missing booking id" });
        if (!kind) return res.status(400).json({ error: "Missing kind" });
        if (kind !== "cancelled" && kind !== "rescheduled") {
          return res.status(400).json({ error: "Invalid kind" });
        }

        const snap = await adminDb.collection("bookings").doc(String(bookingId)).get();
        if (!snap.exists) return res.status(404).json({ error: "Booking not found" });
        const booking = snap.data() as any;

        const recipient = booking.userId || booking.patientPhone;
        if (!recipient) return res.status(400).json({ error: "Booking has no phone to notify" });

        const lang: "en" | "ml" = booking.language === "ml" ? "ml" : "en";
        const t = TRANSLATIONS[lang];

        // Fallback strings keep us from crashing on legacy bookings without
        // bookingDate / timeSlot. Kept literal here rather than introducing new
        // translation keys mid-task; the message still flows cleanly.
        const fallbackDate = lang === "ml" ? "നിശ്ചയിച്ച തീയതി" : "the scheduled date";
        const fallbackSlot = lang === "ml" ? "നിശ്ചയിച്ച സ്ലോട്ട്" : "the scheduled slot";
        const fallbackOldDate = lang === "ml" ? "മുൻ തീയതി" : "the previous date";
        const fallbackOldSlot = lang === "ml" ? "മുൻ സ്ലോട്ട്" : "the previous slot";

        let message: string;
        if (kind === "cancelled") {
          const tpl = booking.cancelledByRole === "phlebotomist"
            ? t.notifyCancelledByPhleb
            : t.notifyCancelledByAdmin;
          const date = booking.bookingDate ? formatDateLabel(String(booking.bookingDate), lang) : fallbackDate;
          const slot = booking.timeSlot || fallbackSlot;
          const reason = typeof booking.cancellationReason === "string" ? booking.cancellationReason.trim() : "";
          const reasonClause = reason ? t.reasonClausePrefix.replace("{reason}", reason) : "";
          message = tpl
            .replace("{date}", date)
            .replace("{slot}", slot)
            .replace("{reasonClause}", reasonClause);
        } else {
          const tpl = t.notifyRescheduledByAdmin;
          const oldDate = booking.previousBookingDate ? formatDateLabel(String(booking.previousBookingDate), lang) : fallbackOldDate;
          const oldSlot = booking.previousTimeSlot || fallbackOldSlot;
          const newDate = booking.bookingDate ? formatDateLabel(String(booking.bookingDate), lang) : fallbackDate;
          const newSlot = booking.timeSlot || fallbackSlot;
          message = tpl
            .replace("{oldDate}", oldDate)
            .replace("{oldSlot}", oldSlot)
            .replace("{newDate}", newDate)
            .replace("{newSlot}", newSlot);
        }

        if (!process.env.WHATSAPP_TOKEN || !process.env.WHATSAPP_PHONE_ID) {
          return res.json({ ok: true, sent: false, reason: "no-whatsapp-creds" });
        }

        try {
          await sendWhatsAppMessage(String(recipient), message);
          return res.json({ ok: true, sent: true });
        } catch (e: any) {
          return res.status(502).json({ ok: false, sent: false, error: e.message || String(e) });
        }
      } catch (err: any) {
        console.error("[POST /api/bot/notify]", err);
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

            // WhatsApp "location" messages carry { latitude, longitude } (and optional
            // name/address). Coords are sometimes delivered as strings — coerce defensively.
            let location: { latitude: number; longitude: number } | null = null;
            if (msg.type === "location" && msg.location) {
              const lat = Number(msg.location.latitude);
              const lng = Number(msg.location.longitude);
              if (Number.isFinite(lat) && Number.isFinite(lng)) {
                location = { latitude: lat, longitude: lng };
              }
            }

            if (text || location) {
              const responses = await handleWhatsAppMessage(from, text, location);
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

export { app, init };

if (!process.env.VERCEL) {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[BOOT] Server listening on port ${PORT}`);
  });
  init();
}
