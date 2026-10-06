import { Redis } from "@upstash/redis";
import { EventState, initialEvent } from "./clock";

const namespace = process.env.EVENT_NAMESPACE ?? (process.env.VERCEL_ENV === "production" ? "production" : process.env.VERCEL_ENV === "preview" ? `preview:${process.env.VERCEL_GIT_COMMIT_REF ?? "preview"}` : "development");
const key = `neuraldao:${namespace}:event:v1`;
const localAllowed = process.env.LOCAL_DEV_STORE === "1" && !process.env.VERCEL && process.env.NODE_ENV !== "production";
const globalStore = globalThis as typeof globalThis & { neuralDaoEvent?: EventState; neuralDaoAttempts?: Map<string, { count: number; expires: number }> };
let client: Redis | null = null;
function redis() {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) throw new Error("Shared storage is not configured.");
  return client ??= Redis.fromEnv();
}

export async function readEvent(): Promise<EventState> {
  if (localAllowed) return structuredClone(globalStore.neuralDaoEvent ??= initialEvent());
  const db = redis();
  const existing = await db.get<EventState>(key);
  if (existing) return existing;
  await db.set(key, initialEvent(), { nx: true });
  const seeded = await db.get<EventState>(key);
  if (!seeded) throw new Error("Could not initialize shared storage.");
  return seeded;
}

export class ConflictError extends Error {}
export async function updateEvent(revision: number, transform: (event: EventState) => EventState): Promise<EventState> {
  const current = await readEvent();
  if (current.revision !== revision) throw new ConflictError("Another organizer changed the event. Refresh and try again.");
  const next = transform(current);
  if (localAllowed) {
    if (globalStore.neuralDaoEvent?.revision !== revision) throw new ConflictError("The event changed. Try again.");
    globalStore.neuralDaoEvent = next;
  } else {
    const result = await redis().eval(`local raw=redis.call('GET',KEYS[1]); if not raw then return 0 end; local current=cjson.decode(raw); if current.revision~=tonumber(ARGV[1]) then return 0 end; redis.call('SET',KEYS[1],ARGV[2]); return 1`, [key], [revision, JSON.stringify(next)]);
    if (result !== 1) throw new ConflictError("Another organizer changed the event. Refresh and try again.");
  }
  return next;
}

export async function loginAllowed(ip: string): Promise<boolean> {
  if (localAllowed) {
    const attempts = globalStore.neuralDaoAttempts ??= new Map();
    let entry = attempts.get(ip);
    if (!entry || entry.expires < Date.now()) { entry = { count: 0, expires: Date.now() + 15 * 60_000 }; attempts.set(ip, entry); }
    return ++entry.count <= 10;
  }
  const rateKey = `neuraldao:${namespace}:login:${ip}`;
  const count = await redis().incr(rateKey);
  if (count === 1) await redis().expire(rateKey, 15 * 60);
  return count <= 10;
}

export function publicEvent(event: EventState) {
  return { ...event, history: [] };
}
