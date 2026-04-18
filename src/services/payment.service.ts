import { createHash } from "crypto";
import { config } from "../config.js";

// ─── Custom Error ─────────────────────────────────────────────────────────────

export class PaymentError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "BAD_SIGNATURE"
      | "BAD_PARAMETER"
      | "CREATE_FAILED"
      | "INVALID_AMOUNT",
  ) {
    super(message);
    this.name = "PaymentError";
  }
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MIDTRANS_API_BASE =
  config.NODE_ENV === "production"
    ? "https://api.midtrans.com"
    : "https://api.sandbox.midtrans.com";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreateInvoiceInput {
  merchantOrderId: string;
  amount: number;
  itemName: string;
  customerName: string;
  customerEmail: string;
  paymentMethod: "QRIS";
}

export interface CreateInvoiceResult {
  paymentUrl: string;
  gatewayTransactionId: string;
  qrBuffer?: Buffer;
}

export interface MidtransWebhookPayload {
  transaction_time: string;
  transaction_status: string;
  transaction_id: string;
  status_message: string;
  status_code: string;
  signature_key: string;
  order_id: string;
  merchant_id: string;
  gross_amount: string;
  currency: string;
  payment_type: string;
  fraud_status?: string;
  settlement_time?: string;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

function authHeader(): string {
  const encoded = Buffer.from(`${config.MIDTRANS_SERVER_KEY}:`).toString("base64");
  return `Basic ${encoded}`;
}

// ─── Create Invoice ───────────────────────────────────────────────────────────

export async function createInvoice(
  input: CreateInvoiceInput,
): Promise<CreateInvoiceResult> {
  if (input.amount <= 0) {
    throw new PaymentError("Amount harus lebih dari 0", "INVALID_AMOUNT");
  }

  const payload = {
    payment_type: "qris",
    transaction_details: {
      order_id: input.merchantOrderId,
      gross_amount: input.amount,
    },
    item_details: [
      {
        id: input.merchantOrderId,
        price: input.amount,
        quantity: 1,
        name: input.itemName.slice(0, 50), // Midtrans max 50 chars
      },
    ],
    customer_details: {
      first_name: input.customerName.slice(0, 50),
      email: input.customerEmail,
    },
    qris: {},
  };

  const response = await fetch(`${MIDTRANS_API_BASE}/v2/charge`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: authHeader(),
    },
    body: JSON.stringify(payload),
  });

  const data = (await response.json()) as {
    status_code?: string;
    status_message?: string;
    transaction_id?: string;
    actions?: Array<{ name: string; method: string; url: string }>;
  };

  if (!response.ok || data.status_code !== "201") {
    throw new PaymentError(
      `Midtrans error: ${data.status_message ?? `HTTP ${response.status}`}`,
      "CREATE_FAILED",
    );
  }

  const qrAction = data.actions?.find((a) => a.name === "generate-qr-code");

  if (qrAction === undefined || data.transaction_id === undefined) {
    throw new PaymentError("QR code tidak tersedia dari Midtrans", "CREATE_FAILED");
  }

  // Fetch QR image sebagai buffer
  const qrResponse = await fetch(qrAction.url, {
    headers: { Authorization: authHeader() },
  });

  if (!qrResponse.ok) {
    throw new PaymentError("Gagal fetch QR image dari Midtrans", "CREATE_FAILED");
  }

  const qrBuffer = Buffer.from(await qrResponse.arrayBuffer());

  return {
    paymentUrl: qrAction.url,
    gatewayTransactionId: data.transaction_id,
    qrBuffer,
  };
}

// ─── Webhook Validation ───────────────────────────────────────────────────────

/**
 * Validasi signature webhook Midtrans.
 * Formula: SHA512(order_id + status_code + gross_amount + server_key)
 * Return true jika pembayaran sukses.
 */
export function validateWebhook(payload: MidtransWebhookPayload): boolean {
  const { order_id, status_code, gross_amount, signature_key } = payload;

  if (
    order_id === undefined ||
    status_code === undefined ||
    gross_amount === undefined ||
    signature_key === undefined
  ) {
    throw new PaymentError("Parameter webhook tidak lengkap", "BAD_PARAMETER");
  }

  const raw = `${order_id}${status_code}${gross_amount}${config.MIDTRANS_SERVER_KEY}`;
  const expected = createHash("sha512").update(raw).digest("hex");

  if (expected !== signature_key) {
    throw new PaymentError("Signature webhook tidak valid", "BAD_SIGNATURE");
  }

  const isSuccess =
    status_code === "200" &&
    ["settlement", "capture"].includes(payload.transaction_status) &&
    (payload.fraud_status === undefined || payload.fraud_status === "accept");

  return isSuccess;
}
