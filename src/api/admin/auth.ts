import { Hono } from "hono";
import { setCookie, deleteCookie } from "hono/cookie";
import { sign } from "hono/jwt";
import bcrypt from "bcryptjs";
import { config } from "../../config.js";
import { redis } from "../../db/redis.js";
import { COOKIE_NAME } from "./middleware.js";

const auth = new Hono();

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: config.NODE_ENV === "production",
  sameSite: "Strict" as const,
  maxAge: 60 * 60 * 24 * 7, // 7 hari
  path: "/",
};

const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_WINDOW = 60 * 15; // 15 menit

// POST /api/admin/login
auth.post("/login", async (c) => {
  const ip =
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
    c.req.header("x-real-ip") ??
    "unknown";

  const rateLimitKey = `admin_login:${ip}`;
  const attempts = await redis.incr(rateLimitKey);
  if (attempts === 1) await redis.expire(rateLimitKey, LOGIN_WINDOW);

  if (attempts > LOGIN_MAX_ATTEMPTS) {
    const ttl = await redis.ttl(rateLimitKey);
    return c.json(
      { message: `Terlalu banyak percobaan login. Coba lagi dalam ${Math.ceil(ttl / 60)} menit.` },
      429,
    );
  }

  const { username, password } = await c.req.json<{ username: string; password: string }>();

  if (
    username !== config.ADMIN_USERNAME ||
    !(await bcrypt.compare(password, config.ADMIN_PASSWORD_HASH))
  ) {
    return c.json({ message: "Username atau password salah." }, 401);
  }

  // Reset counter setelah login sukses
  await redis.del(rateLimitKey);

  const token = await sign(
    { sub: username, iat: Math.floor(Date.now() / 1000) },
    config.ADMIN_JWT_SECRET,
  );

  setCookie(c, COOKIE_NAME, token, COOKIE_OPTIONS);
  return c.json({ ok: true });
});

// POST /api/admin/logout
auth.post("/logout", (c) => {
  deleteCookie(c, COOKIE_NAME, { path: "/" });
  return c.json({ ok: true });
});

export default auth;
