import { Hono } from "hono";
import { db } from "../../db/client.js";

const products = new Hono();

// GET /api/admin/products/brands — daftar semua brand unik
products.get("/brands", async (c) => {
  const brands = await db.product.findMany({
    where: { isActive: true },
    select: { brand: true },
    distinct: ["brand"],
    orderBy: { brand: "asc" },
  });
  return c.json(brands.map((b) => b.brand));
});

// GET /api/admin/products?brand=xxx — produk per brand
products.get("/", async (c) => {
  const brand = c.req.query("brand");
  if (brand === undefined || brand === "") {
    return c.json({ message: "brand query param wajib diisi" }, 400);
  }

  const list = await db.product.findMany({
    where: { brand, isActive: true },
    select: { itemCode: true, itemName: true, basePrice: true, price: true, category: true },
    orderBy: [{ category: "asc" }, { itemName: "asc" }],
  });

  return c.json(list);
});

export default products;
