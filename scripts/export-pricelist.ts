import { createHash } from "crypto";
import * as XLSX from "xlsx";
import { config as dotenvConfig } from "dotenv";
import { join } from "path";

dotenvConfig();

const USERNAME = process.env.DIGIFLAZZ_USERNAME ?? "";
const API_KEY = process.env.DIGIFLAZZ_API_KEY ?? "";

if (!USERNAME || !API_KEY) {
  console.error("Set DIGIFLAZZ_USERNAME dan DIGIFLAZZ_API_KEY di .env dulu!");
  process.exit(1);
}

interface DigiflazzProduct {
  product_name: string;
  category: string;
  brand: string;
  type: string;
  seller_name: string;
  price: number;
  buyer_sku_code: string;
  buyer_product_status: boolean;
  seller_product_status: boolean;
  unlimited_stock: boolean;
  stock: number;
  multi: boolean;
  start_cut_off: string;
  end_cut_off: string;
  desc: string;
}

interface DigiflazzPriceListResponse {
  data: DigiflazzProduct[];
}

function formatRupiah(amount: number): string {
  return `Rp ${amount.toLocaleString("id-ID")}`;
}

async function fetchPriceList(): Promise<DigiflazzProduct[]> {
  const sign = createHash("md5")
    .update(`${USERNAME}${API_KEY}pricelist`)
    .digest("hex");

  console.log("Fetching price list dari Digiflazz...");

  const response = await fetch("https://api.digiflazz.com/v1/price-list", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cmd: "prepaid", username: USERNAME, sign }),
  });

  if (!response.ok) {
    throw new Error(`HTTP error: ${response.status}`);
  }

  const json = (await response.json()) as DigiflazzPriceListResponse;
  return json.data ?? [];
}

async function main() {
  const products = await fetchPriceList();
  console.log(`Total produk: ${products.length}`);

  // Filter hanya produk aktif
  const active = products.filter((p) => p.buyer_product_status && p.seller_product_status);
  console.log(`Produk aktif: ${active.length}`);

  // Kelompokkan per brand/game
  const grouped = new Map<string, DigiflazzProduct[]>();
  for (const p of active) {
    const key = p.brand;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(p);
  }

  const wb = XLSX.utils.book_new();

  // Sheet 1 — Semua produk aktif
  const allRows = [
    ["No", "Game/Brand", "Nama Produk", "Kode SKU", "Harga Modal", "Harga Jual (+5%)", "Kategori", "Stok"],
    ...active.map((p, i) => [
      i + 1,
      p.brand,
      p.product_name,
      p.buyer_sku_code,
      formatRupiah(p.price),
      formatRupiah(Math.ceil(p.price * 1.05)),
      p.category,
      p.unlimited_stock ? "Unlimited" : p.stock,
    ]),
  ];
  const wsAll = XLSX.utils.aoa_to_sheet(allRows);
  wsAll["!cols"] = [
    { wch: 5 }, { wch: 20 }, { wch: 45 }, { wch: 25 },
    { wch: 15 }, { wch: 18 }, { wch: 20 }, { wch: 10 },
  ];
  XLSX.utils.book_append_sheet(wb, wsAll, "Semua Produk");

  // Sheet per game populer (ML, FF, PUBG, Genshin, Valorant)
  const POPULAR = ["Mobile Legends", "Free Fire", "PUBG", "Genshin Impact", "Valorant"];
  for (const game of POPULAR) {
    const items = active.filter((p) =>
      p.brand.toLowerCase().includes(game.toLowerCase()) ||
      p.product_name.toLowerCase().includes(game.toLowerCase())
    );
    if (items.length === 0) continue;

    const rows = [
      ["No", "Nama Produk", "Kode SKU", "Harga Modal", "Harga Jual (+5%)", "Stok"],
      ...items.map((p, i) => [
        i + 1,
        p.product_name,
        p.buyer_sku_code,
        formatRupiah(p.price),
        formatRupiah(Math.ceil(p.price * 1.05)),
        p.unlimited_stock ? "Unlimited" : p.stock,
      ]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [
      { wch: 5 }, { wch: 45 }, { wch: 25 },
      { wch: 15 }, { wch: 18 }, { wch: 10 },
    ];
    const sheetName = game.slice(0, 31); // Excel max 31 chars
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }

  // Sheet per kategori
  const categories = [...new Set(active.map((p) => p.category))].sort();
  for (const cat of categories) {
    const items = active.filter((p) => p.category === cat);
    const rows = [
      ["No", "Game/Brand", "Nama Produk", "Kode SKU", "Harga Modal", "Harga Jual (+5%)", "Stok"],
      ...items.map((p, i) => [
        i + 1,
        p.brand,
        p.product_name,
        p.buyer_sku_code,
        formatRupiah(p.price),
        formatRupiah(Math.ceil(p.price * 1.05)),
        p.unlimited_stock ? "Unlimited" : p.stock,
      ]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [
      { wch: 5 }, { wch: 20 }, { wch: 45 }, { wch: 25 },
      { wch: 15 }, { wch: 18 }, { wch: 10 },
    ];
    const sheetName = cat.slice(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }

  const filename = join(process.cwd(), `pricelist-yokmabar-${new Date().toISOString().slice(0, 10)}.xlsx`);
  XLSX.writeFile(wb, filename);
  console.log(`\nFile berhasil dibuat: ${filename}`);
  console.log(`Total sheet: ${wb.SheetNames.length} (1 semua produk + ${POPULAR.length} game populer + ${categories.length} kategori)`);
}

main().catch(console.error);
