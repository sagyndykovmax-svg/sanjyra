// Vercel's Upstash marketplace integration provisions env vars under the
// legacy "Vercel KV" names (KV_REST_API_URL / KV_REST_API_TOKEN), not the
// UPSTASH_REDIS_REST_* names @upstash/redis's Redis.fromEnv() looks for by
// default — so build the client explicitly and accept either naming.
import { Redis } from "@upstash/redis";

const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

export const redis = new Redis({ url, token });
