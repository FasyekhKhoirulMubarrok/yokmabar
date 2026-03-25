import { Hono } from "hono";
import { handleWhatsAppMessage } from "./handler.js";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FonnteWebhookPayload {
  sender?: string;
  message?: string;
  member?: string;  // terisi jika pesan dari group
  name?: string;
  device?: string;
}

// ─── Webhook Receiver ─────────────────────────────────────────────────────────

const whatsappRouter = new Hono();

whatsappRouter.post("/", async (c) => {
  let payload: FonnteWebhookPayload;

  const contentType = c.req.header("content-type") ?? "";

  if (contentType.includes("application/json")) {
    payload = await c.req.json<FonnteWebhookPayload>();
  } else {
    // Fonnte kadang kirim form-urlencoded
    const body = await c.req.parseBody();
    payload = {
      ...(body["sender"]  !== undefined && { sender:  String(body["sender"])  }),
      ...(body["message"] !== undefined && { message: String(body["message"]) }),
      ...(body["member"]  !== undefined && { member:  String(body["member"])  }),
      ...(body["name"]    !== undefined && { name:    String(body["name"])    }),
      ...(body["device"]  !== undefined && { device:  String(body["device"])  }),
    };
  }

  const phone   = payload.sender;
  const message = payload.message;

  // Abaikan pesan dari group
  if (payload.member !== undefined && payload.member !== "") {
    return c.json({ message: "ok" }, 200);
  }

  if (phone === undefined || message === undefined || message.trim() === "") {
    return c.json({ message: "ok" }, 200);
  }

  // Proses async — balas Fonnte segera agar tidak timeout
  void handleWhatsAppMessage(phone, message).catch((err: unknown) => {
    console.error(`[whatsapp] Error handling message from ${phone}:`, err);
  });

  return c.json({ message: "ok" }, 200);
});

export default whatsappRouter;
