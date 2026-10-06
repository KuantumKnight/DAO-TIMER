import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticated, createSession, sameOrigin, SESSION_COOKIE, validPassphrase } from "@/lib/auth";
import { loginAllowed } from "@/lib/store";
import { apiError, uncached } from "@/lib/http";
export async function GET() { return NextResponse.json({ authenticated: await authenticated() }, { headers: uncached }); }
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  try {
    const ip = request.headers.get("x-vercel-forwarded-for")?.split(",")[0] ?? request.headers.get("x-forwarded-for")?.split(",")[0] ?? "local";
    if (!await loginAllowed(ip)) return NextResponse.json({ error: "Too many attempts. Try again in 15 minutes." }, { status: 429, headers: uncached });
    const { passphrase } = z.object({ passphrase: z.string().min(1).max(200) }).parse(await request.json());
    if (!validPassphrase(passphrase)) return NextResponse.json({ error: "Incorrect organizer passphrase." }, { status: 401, headers: uncached });
    const response = NextResponse.json({ authenticated: true }, { headers: uncached });
    response.cookies.set(SESSION_COOKIE, createSession(), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 12 * 3600 });
    return response;
  } catch (e) { return apiError(e); }
}
export async function DELETE(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const response = NextResponse.json({ authenticated: false }, { headers: uncached });
  response.cookies.delete(SESSION_COOKIE); return response;
}
