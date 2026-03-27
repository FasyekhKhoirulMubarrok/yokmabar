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

const DUITKU_BASE_URL =
  config.NODE_ENV === "production"
    ? "https://passport.duitku.com/webapi/api/merchant/v2/inquiry"
    : "https://sandbox.duitku.com/webapi/api/merchant/v2/inquiry";

const EXPIRY_MINUTES = 15;

// Payment method codes
export const PAYMENT_METHODS = {
  QRIS: "SP",
  GOPAY: "GP",
  OVO: "OV",
  DANA: "DA",
} as const;

export type PaymentMethod = keyof typeof PAYMENT_METHODS;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreateInvoiceInput {
  merchantOrderId: string;
  amount: number;
  itemName: string;
  customerName: string;
  customerEmail: string;
  paymentMethod: PaymentMethod;
}

export interface CreateInvoiceResult {
  paymentUrl: string;
  duitkuOrderId: string;
  qrString?: string;
}

export interface DuitkuWebhookPayload {
  merchantCode: string;
  amount: string;
  merchantOrderId: string;
  productDetail?: string;
  additionalParam?: string;
  paymentCode?: string;
  resultCode: string;
  merchantUserId?: string;
  reference?: string;
  signature: string;
  publisherOrderId?: string;
  settlementDate?: string;
  issuerCode?: string;
}

// ─── Signature ────────────────────────────────────────────────────────────────

/**
 * Signature untuk create invoice:
 * MD5(merchantCode + merchantOrderId + paymentAmount + apiKey)
 */
function createRequestSignature(
  merchantOrderId: string,
  paymentAmount: number,
): string {
  const raw = `${config.DUITKU_MERCHANT_CODE}${merchantOrderId}${paymentAmount}${config.DUITKU_API_KEY}`;
  return createHash("md5").update(raw).digest("hex");
}

/**
 * Signature untuk validasi webhook callback:
 * MD5(merchantCode + amount + merchantOrderId + apiKey)
 */
function createCallbackSignature(
  amount: string,
  merchantOrderId: string,
): string {
  const raw = `${config.DUITKU_MERCHANT_CODE}${amount}${merchantOrderId}${config.DUITKU_API_KEY}`;
  return createHash("md5").update(raw).digest("hex");
}

// ─── Create Invoice ───────────────────────────────────────────────────────────

export async function createInvoice(
  input: CreateInvoiceInput,
): Promise<CreateInvoiceResult> {
  if (input.amount <= 0) {
    throw new PaymentError("Amount harus lebih dari 0", "INVALID_AMOUNT");
  }

  const signature = createRequestSignature(
    input.merchantOrderId,
    input.amount,
  );

  const payload = {
    merchantCode: config.DUITKU_MERCHANT_CODE,
    paymentAmount: input.amount,
    paymentMethod: PAYMENT_METHODS[input.paymentMethod],
    merchantOrderId: input.merchantOrderId,
    productDetails: input.itemName,
    customerVaName: input.customerName,
    email: input.customerEmail,
    callbackUrl: config.DUITKU_CALLBACK_URL,
    returnUrl: `${config.APP_URL}/order/${input.merchantOrderId}`,
    signature,
    expiryPeriod: EXPIRY_MINUTES,
    itemDetails: [
      {
        name: input.itemName,
        price: input.amount,
        quantity: 1,
      },
    ],
  };

  const response = await fetch(DUITKU_BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new PaymentError(
      `Duitku API error: HTTP ${response.status}`,
      "CREATE_FAILED",
    );
  }

  const data = (await response.json()) as {
    statusCode?: string;
    paymentUrl?: string;
    duitkuOrderId?: string;
    message?: string;
    qrString?: string;
    qrisUrl?: string;
  };

  if (data.statusCode !== "00" || data.paymentUrl === undefined) {
    throw new PaymentError(
      `Gagal buat invoice: ${data.message ?? "unknown error"}`,
      "CREATE_FAILED",
    );
  }

  return {
    paymentUrl: data.paymentUrl,
    duitkuOrderId: data.duitkuOrderId ?? "",
    ...(data.qrString !== undefined && { qrString: data.qrString }),
  };
}

// ─── Webhook Validation ───────────────────────────────────────────────────────

/**
 * Validasi signature webhook Duitku.
 * Lempar PaymentError jika tidak valid.
 * Return true jika pembayaran sukses (resultCode === "00").
 */
export function validateWebhook(payload: DuitkuWebhookPayload): boolean {
  const { merchantCode, amount, merchantOrderId, signature, resultCode } =
    payload;

  if (
    merchantCode === undefined ||
    amount === undefined ||
    merchantOrderId === undefined ||
    signature === undefined
  ) {
    throw new PaymentError("Parameter webhook tidak lengkap", "BAD_PARAMETER");
  }

  if (merchantCode !== config.DUITKU_MERCHANT_CODE) {
    throw new PaymentError("Merchant code tidak cocok", "BAD_SIGNATURE");
  }

  const expected = createCallbackSignature(amount, merchantOrderId);
  if (expected !== signature) {
    throw new PaymentError("Signature webhook tidak valid", "BAD_SIGNATURE");
  }

  return resultCode === "00";
}
