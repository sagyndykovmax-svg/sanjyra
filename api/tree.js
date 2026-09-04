// POST /api/tree — creates a new stored tree, returns {code, editToken}.
//
// `code` is the short public identifier (goes in the view/edit links).
// `editToken` is a separate, longer secret that only the creator's browser
// keeps (in localStorage) — it's what proves write access on later PUTs.
// Anyone with just `code` can read; only whoever also holds `editToken`
// can write. This is intentionally not a login system, just a
// possession-based secret, same spirit as the URL-only sharing the rest
// of the app already uses.
import { Ratelimit } from "@upstash/ratelimit";
import { randomBytes } from "node:crypto";
import { redis } from "./_redis.js";
import { isValidTreeState } from "./_validate.js";

const createLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(20, "1 m"),
  prefix: "ratelimit:create",
});

const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"; // no 0/O/1/l/I
const MAX_STATE_BYTES = 400 * 1024; // generous for text + a handful of small photos

function randomString(len, alphabet) {
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  const ip = (req.headers["x-forwarded-for"] || "unknown").split(",")[0].trim();
  const { success } = await createLimit.limit(ip);
  if (!success) {
    res.status(429).json({ error: "rate_limited" });
    return;
  }

  const body = req.body;
  if (!body || typeof body !== "object" || !body.state || typeof body.state !== "object") {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  if (!isValidTreeState(body.state)) {
    res.status(400).json({ error: "invalid_state_shape" });
    return;
  }
  const stateJson = JSON.stringify(body.state);
  if (stateJson.length > MAX_STATE_BYTES) {
    res.status(413).json({ error: "too_large" });
    return;
  }

  let code;
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = randomString(8, CODE_ALPHABET);
    const exists = await redis.exists(`tree:${candidate}`);
    if (!exists) { code = candidate; break; }
  }
  if (!code) {
    res.status(500).json({ error: "code_generation_failed" });
    return;
  }

  const editToken = randomString(28, CODE_ALPHABET);
  await redis.set(`tree:${code}`, {
    state: body.state,
    editToken,
    updatedAt: Date.now(),
  });

  res.status(200).json({ code, editToken });
}
