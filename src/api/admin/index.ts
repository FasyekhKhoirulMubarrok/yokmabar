import { Hono } from "hono";
import { adminApiMiddleware, adminPageMiddleware } from "./middleware.js";
import auth from "./auth.js";
import stats from "./stats.js";
import events from "./events.js";
import feedback from "./feedback.js";
import { loginPage, dashboardPage, eventsPage, feedbackPage } from "./pages.js";

const admin = new Hono();

// ─── Auth endpoints (no middleware) ──────────────────────────────────────────
// POST /api/admin/login, POST /api/admin/logout

admin.route("/api/admin", auth);

// ─── API endpoints (JWT required) ────────────────────────────────────────────
// stats mounts at /api/admin → handles GET /, POST /sync, GET /sync/status
// events mounts at /api/admin/events
// feedback mounts at /api/admin/feedback

// Match /api/admin, /api/admin/, /api/admin/anything
admin.use("/api/admin", adminApiMiddleware);
admin.use("/api/admin/*", adminApiMiddleware);

admin.route("/api/admin", stats);
admin.route("/api/admin/events", events);
admin.route("/api/admin/feedback", feedback);

// ─── HTML pages ───────────────────────────────────────────────────────────────

admin.get("/admin/login", (c) => c.html(loginPage()));

admin.use("/admin/*", adminPageMiddleware);

admin.get("/admin", (c) => c.html(dashboardPage()));
admin.get("/admin/", (c) => c.redirect("/admin"));
admin.get("/admin/events", (c) => c.html(eventsPage()));
admin.get("/admin/feedback", (c) => c.html(feedbackPage()));

export default admin;
