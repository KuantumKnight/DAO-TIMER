import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";

export const SESSION_COOKIE = "neuraldao-organizer";
function signature(value: string) {
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) throw new Error("Organizer access is not configured.");
  return createHmac("sha256", process.env.SESSION_SECRET).update(value).digest("base64url");
}
function constantEqual(a: string, b: string) {
  const left = Buffer.from(a); const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
export function validPassphrase(input: string) {
  const expected = process.env.ADMIN_PASSPHRASE;
  if (!expected || expected.length < 12) throw new Error("Organizer access is not configured.");
  const hash = (x: string) => createHmac("sha256", signature("passphrase")).update(x).digest("hex");
  return constantEqual(hash(input), hash(expected));
}
export function createSession() {
  const expires = String(Date.now() + 12 * 60 * 60_000);
  return `${expires}.${signature(expires)}`;
}
export async function authenticated() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return false;
  const [expires, sig] = token.split(".");
  if (!expires || !sig || !Number.isFinite(Number(expires)) || Number(expires) <= Date.now()) return false;
  try { return constantEqual(sig, signature(expires)); } catch { return false; }
}
export function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const parsed = new URL(origin);
    const host = request.headers.get("host");
    const protocol = request.headers.get("x-forwarded-proto")?.split(",")[0] ?? request.nextUrl.protocol.replace(":", "");
    return parsed.host === host && parsed.protocol === `${protocol}:`;
  } catch { return false; }
}
