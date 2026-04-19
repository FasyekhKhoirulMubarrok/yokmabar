import { createHash } from "crypto";
import { config } from "../config.js";

// ─── Custom Error ─────────────────────────────────────────────────────────────

export class SupplierError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "REQUEST_FAILED"
      | "TRANSACTION_FAILED"
      | "BAD_SIGNATURE"
      | "BAD_PARAMETER",
    public readonly rc?: string,
  ) {
    super(message);
    this.name = "SupplierError";
  }
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DIGIFLAZZ_BASE_URL = "https://api.digiflazz.com/v1";

// ─── Types ────────────────────────────────────────────────────────────────────

export type DigiflazzStatus = "Sukses" | "Gagal" | "Pending";

export interface DigiflazzTransactionData {
  ref_id: string;
  customer_no: string;
  customer_name?: string;
  buyer_sku_code: string;
  message: string;
  status: DigiflazzStatus;
  rc: string;
  sn?: string;
  buyer_last_saldo?: number;
  price?: number;
  selling_price?: number;
}

export interface TopUpInput {
  refId: string;        // Order ID kita — dipakai sebagai idempotency key
  buyerSkuCode: string; // itemCode dari produk
  customerNo: string;   // Game User ID
}

export interface TopUpResult {
  refId: string;
  status: DigiflazzStatus;
  rc: string;
  sn: string;
  message: string;
}

export interface DigiflazzWebhookPayload {
  data: DigiflazzTransactionData & { sign?: string };
}

// ─── Signature ────────────────────────────────────────────────────────────────

/**
 * Signature untuk transaksi top-up:
 * MD5(username + apiKey + ref_id)
 */
function createTransactionSign(refId: string): string {
  const raw = `${config.DIGIFLAZZ_USERNAME}${config.DIGIFLAZZ_API_KEY}${refId}`;
  return createHash("md5").update(raw).digest("hex");
}

/**
 * Signature untuk cek saldo:
 * MD5(username + apiKey + "depo")
 */
function createBalanceSign(): string {
  const raw = `${config.DIGIFLAZZ_USERNAME}${config.DIGIFLAZZ_API_KEY}depo`;
  return createHash("md5").update(raw).digest("hex");
}

// ─── Internal fetch helper ────────────────────────────────────────────────────

async function digiflazzPost<T>(
  endpoint: string,
  body: Record<string, unknown>,
): Promise<T> {
  console.log("[digiflazz] POST", endpoint, JSON.stringify(body));
  const response = await fetch(`${DIGIFLAZZ_BASE_URL}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const responseText = await response.text();
  console.log("[digiflazz] response", response.status, responseText);

  if (!response.ok) {
    throw new SupplierError(
      `Digiflazz API error: HTTP ${response.status}`,
      "REQUEST_FAILED",
    );
  }

  return JSON.parse(responseText) as T;
}

// ─── Top Up ───────────────────────────────────────────────────────────────────

/**
 * Kirim request top-up ke Digiflazz.
 *
 * Status response:
 * - "Sukses"  → langsung mark SUCCESS
 * - "Pending" → tetap PROCESSING, tunggu webhook
 * - "Gagal"   → mark FAILED, notif admin
 */
export async function topUp(input: TopUpInput): Promise<TopUpResult> {
  const sign = createTransactionSign(input.refId);

  const response = await digiflazzPost<{ data: DigiflazzTransactionData }>(
    "/transaction",
    {
      username: config.DIGIFLAZZ_USERNAME,
      buyer_sku_code: input.buyerSkuCode,
      customer_no: input.customerNo,
      ref_id: input.refId,
      sign,
      testing: config.NODE_ENV !== "production",
    },
  );

  const data = response.data;

  if (data === undefined || data === null) {
    throw new SupplierError(
      "Response Digiflazz tidak valid",
      "REQUEST_FAILED",
    );
  }

  // Status "Gagal" langsung lempar error supaya worker bisa mark FAILED
  if (data.status === "Gagal") {
    throw new SupplierError(
      data.message ?? "Transaksi gagal di Digiflazz",
      "TRANSACTION_FAILED",
      data.rc,
    );
  }

  return {
    refId: data.ref_id,
    status: data.status,
    rc: data.rc,
    sn: data.sn ?? "",
    message: data.message,
  };
}

// ─── Webhook Validation ───────────────────────────────────────────────────────

/**
 * Validasi signature webhook Digiflazz.
 * Formula: MD5(username + apiKey + ref_id)
 *
 * Return parsed data jika valid.
 * Lempar SupplierError jika signature tidak cocok.
 */
export function validateWebhook(
  payload: DigiflazzWebhookPayload,
): DigiflazzTransactionData {
  const data = payload.data;

  if (data === undefined || data === null || data.ref_id === undefined) {
    throw new SupplierError(
      "Payload webhook Digiflazz tidak valid",
      "BAD_PARAMETER",
    );
  }

  const expectedSign = createTransactionSign(data.ref_id);
  const receivedSign = data.sign;

  if (receivedSign === undefined || receivedSign !== expectedSign) {
    throw new SupplierError(
      "Signature webhook Digiflazz tidak valid",
      "BAD_SIGNATURE",
    );
  }

  return data;
}

/**
 * Parse status webhook menjadi aksi state machine:
 * - "Sukses"  → SUCCESS
 * - "Gagal"   → FAILED
 * - "Pending" → tetap PROCESSING (tidak ada aksi)
 */
export function parseWebhookStatus(
  data: DigiflazzTransactionData,
): "SUCCESS" | "FAILED" | "PENDING" {
  switch (data.status) {
    case "Sukses":
      return "SUCCESS";
    case "Gagal":
      return "FAILED";
    case "Pending":
      return "PENDING";
  }
}

// ─── Game ID Inquiry ──────────────────────────────────────────────────────────

export type InquiryResult =
  | { found: true; username: string }
  | { found: false }
  | null;

export async function checkGameId(
  skuCode: string | null,
  gameUserId: string,
  gameServerId: string | null,
): Promise<InquiryResult> {
  console.log("[checkGameId] skuCode:", skuCode, "userId:", gameUserId, "serverId:", gameServerId);
  if (skuCode === null) return null;

  const customerNo = gameServerId !== null ? `${gameUserId}.${gameServerId}` : gameUserId;
  const refId = `inq-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const sign = createTransactionSign(refId);
  console.log("[checkGameId] customerNo:", customerNo, "refId:", refId, "sign:", sign);

  try {
    const response = await digiflazzPost<{ data: DigiflazzTransactionData }>(
      "/transaction",
      {
        username: config.DIGIFLAZZ_USERNAME,
        buyer_sku_code: skuCode,
        customer_no: customerNo,
        ref_id: refId,
        sign,
        testing: config.NODE_ENV !== "production",
      },
    );

    const data = response.data;
    console.log("[checkGameId] response:", JSON.stringify(response));
    if (data?.customer_name !== undefined && data.customer_name !== null && data.status === "Sukses") {
      return { found: true, username: data.customer_name };
    }
    return { found: false };
  } catch (err) {
    console.error("[checkGameId] error:", err);
    return null;
  }
}

// checkBalance dipindah ke balance.service.ts
