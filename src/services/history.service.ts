import { type Order, type OrderStatus } from "@prisma/client";
import { db } from "../db/client.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OrderHistory {
  id: string;
  paymentRef: string | null;
  game: string;
  itemName: string;
  amount: number;
  status: OrderStatus;
  createdAt: Date;
}

// ─── History ──────────────────────────────────────────────────────────────────

/**
 * Ambil 5 transaksi terakhir user, semua status.
 * Dipakai oleh command /riwayat di ketiga bot.
 */
export async function getRecentOrders(
  userId: string,
  limit = 5,
): Promise<OrderHistory[]> {
  const orders = await db.order.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      paymentRef: true,
      game: true,
      itemName: true,
      amount: true,
      status: true,
      createdAt: true,
    },
  });

  return orders;
}

/**
 * Format riwayat order menjadi teks untuk bot.
 * Dipakai langsung oleh handler ketiga platform.
 */
export function formatOrderHistory(orders: OrderHistory[]): string {
  if (orders.length === 0) {
    return "😊 Kamu belum punya transaksi. Yok mulai top up!";
  }

  const STATUS_LABEL: Record<OrderStatus, string> = {
    PENDING: "⏳ Menunggu",
    PAID: "💳 Dibayar",
    PROCESSING: "⚙️ Diproses",
    SUCCESS: "✅ Sukses",
    FAILED: "❌ Gagal",
    EXPIRED: "⏰ Kadaluarsa",
  };

  const lines = orders.map((order, i) => {
    const date = order.createdAt.toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "Asia/Jakarta",
    });
    const amount = `Rp ${order.amount.toLocaleString("id-ID")}`;
    const ref = `#${order.paymentRef ?? order.id.slice(0, 8).toUpperCase()}`;
    const status = STATUS_LABEL[order.status];

    return (
      `${i + 1}. ${ref}\n` +
      `   ${order.game} — ${order.itemName}\n` +
      `   ${amount} · ${status} · ${date}`
    );
  });

  return `📋 <b>5 Transaksi Terakhir</b>\n\n${lines.join("\n\n")}`;
}
