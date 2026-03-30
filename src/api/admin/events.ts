import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  listEvents, getEventByShortId, createEvent,
  startEvent, stopEvent, deleteEvent,
} from "../../services/event.service.js";
import { config } from "../../config.js";

const events = new Hono();

// GET /api/admin/events
events.get("/", async (c) => {
  const list = await listEvents();
  return c.json(list);
});

// POST /api/admin/events
const createSchema = z.object({
  name:              z.string().min(2),
  displayMarkupRate: z.number().min(0.0001).max(1),
  scope:             z.enum(["ALL", "BRAND", "ITEMS"]),
  scopeValue:        z.string().optional(),
  scopeItemCodes:    z.array(z.string()).optional(),
  endAt:             z.string().optional(), // ISO date string
});

events.post("/", zValidator("json", createSchema), async (c) => {
  const body = c.req.valid("json");

  if (body.scope === "BRAND" && !body.scopeValue) {
    return c.json({ message: "scopeValue wajib diisi jika scope = BRAND" }, 400);
  }
  if (body.scope === "ITEMS" && (!body.scopeItemCodes || body.scopeItemCodes.length === 0)) {
    return c.json({ message: "scopeItemCodes wajib diisi jika scope = ITEMS" }, 400);
  }

  const event = await createEvent({
    name:              body.name,
    displayMarkupRate: body.displayMarkupRate,
    actualMarkupRate:  config.PRICE_EVENT_RATE,
    scope:             body.scope,
    ...(body.scopeValue !== undefined && { scopeValue: body.scopeValue }),
    ...(body.scopeItemCodes !== undefined && { scopeItemCodes: body.scopeItemCodes }),
    ...(body.endAt !== undefined && { endAt: new Date(body.endAt) }),
  });

  return c.json(event, 201);
});

// PATCH /api/admin/events/:id/start
events.patch("/:id/start", async (c) => {
  const shortId = c.req.param("id");
  const event = await getEventByShortId(shortId);
  if (event === null) return c.json({ message: "Event tidak ditemukan" }, 404);
  const updated = await startEvent(event.id);
  return c.json(updated);
});

// PATCH /api/admin/events/:id/stop
events.patch("/:id/stop", async (c) => {
  const shortId = c.req.param("id");
  const event = await getEventByShortId(shortId);
  if (event === null) return c.json({ message: "Event tidak ditemukan" }, 404);
  const updated = await stopEvent(event.id);
  return c.json(updated);
});

// DELETE /api/admin/events/:id
events.delete("/:id", async (c) => {
  const shortId = c.req.param("id");
  const event = await getEventByShortId(shortId);
  if (event === null) return c.json({ message: "Event tidak ditemukan" }, 404);
  await deleteEvent(event.id);
  return c.json({ ok: true });
});

export default events;
