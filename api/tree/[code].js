// GET  /api/tree/:code — read-only fetch, anyone with the code can call this.
// PUT  /api/tree/:code — update; requires {state, editToken} and the token
//                        must match what POST /api/tree returned at creation.
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

const redis = Redis.fromEnv();
const readLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(120, "1 m"),
  prefix: "ratelimit:read",
});
const writeLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(60, "1 m"),
  prefix: "ratelimit:write",
});

const CODE_RE = /^[A-Za-z0-9]{4,32}$/;
const MAX_STATE_BYTES = 400 * 1024;

export default async function handler(req, res) {
  const code = req.query.code;
  if (typeof code !== "string" || !CODE_RE.test(code)) {
    res.status(400).json({ error: "invalid_code" });
    return;
  }
  const ip = (req.headers["x-forwarded-for"] || "unknown").split(",")[0].trim();
  const key = `tree:${code}`;

  if (req.method === "GET") {
    const { success } = await readLimit.limit(ip);
    if (!success) { res.status(429).json({ error: "rate_limited" }); return; }

    const record = await redis.get(key);
    if (!record) { res.status(404).json({ error: "not_found" }); return; }
    // editToken deliberately never leaves the server on a GET — a view-only
    // visitor has no way to extract write access from the response.
    res.status(200).json({ state: record.state, updatedAt: record.updatedAt });
    return;
  }

  if (req.method === "PUT") {
    const { success } = await writeLimit.limit(ip);
    if (!success) { res.status(429).json({ error: "rate_limited" }); return; }

    const body = req.body;
    if (!body || typeof body !== "object" || !body.state || !body.editToken) {
      res.status(400).json({ error: "invalid_body" });
      return;
    }
    const stateJson = JSON.stringify(body.state);
    if (stateJson.length > MAX_STATE_BYTES) {
      res.status(413).json({ error: "too_large" });
      return;
    }

    const existing = await redis.get(key);
    if (!existing) { res.status(404).json({ error: "not_found" }); return; }
    if (existing.editToken !== body.editToken) {
      res.status(403).json({ error: "forbidden" });
      return;
    }

    const updatedAt = Date.now();
    await redis.set(key, {
      state: body.state,
      editToken: existing.editToken,
      updatedAt,
    });
    res.status(200).json({ ok: true, updatedAt });
    return;
  }

  res.status(405).json({ error: "method_not_allowed" });
}
