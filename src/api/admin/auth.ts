import { Hono } from "hono";
import { setCookie, deleteCookie } from "hono/cookie";
import { sign } from "hono/jwt";
import bcrypt from "bcryptjs";
import { config } from "../../config.js";
import { COOKIE_NAME } from "./middleware.js";

const auth = new Hono();

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: config.NODE_ENV === "production",
  sameSite: "Strict" as const,
  maxAge: 60 * 60 * 24 * 7, // 7 hari
  path: "/",
};

// POST /api/admin/login
auth.post("/login", async (c) => {
  const { username, password } = await c.req.json<{ username: string; password: string }>();

  if (
    username !== config.ADMIN_USERNAME ||
    !(await bcrypt.compare(password, config.ADMIN_PASSWORD_HASH))
  ) {
    return c.json({ message: "Username atau password salah." }, 401);
  }

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
