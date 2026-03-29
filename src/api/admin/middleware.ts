import { type MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import { verify } from "hono/jwt";
import { config } from "../../config.js";

const COOKIE_NAME = "ym_admin";

export const adminApiMiddleware: MiddlewareHandler = async (c, next) => {
  const token = getCookie(c, COOKIE_NAME);
  if (token === undefined) {
    return c.json({ message: "Unauthorized" }, 401, {});
  }
  try {
    await verify(token, config.ADMIN_JWT_SECRET, "HS256");
    await next();
  } catch {
    return c.json({ message: "Unauthorized" }, 401, {});
  }
};

export const adminPageMiddleware: MiddlewareHandler = async (c, next) => {
  const token = getCookie(c, COOKIE_NAME);
  if (token === undefined) {
    return c.redirect("/admin/login");
  }
  try {
    await verify(token, config.ADMIN_JWT_SECRET, "HS256");
    await next();
  } catch {
    return c.redirect("/admin/login");
  }
};

export { COOKIE_NAME };
