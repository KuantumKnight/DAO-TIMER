import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ConflictError } from "./store";
export const uncached = { "Cache-Control": "no-store" };
export function apiError(error: unknown) {
  if (error instanceof ConflictError) return NextResponse.json({ error: error.message }, { status: 409, headers: uncached });
  if (error instanceof ZodError) return NextResponse.json({ error: error.issues[0]?.message ?? "Check the supplied values." }, { status: 400, headers: uncached });
  if (error instanceof SyntaxError) return NextResponse.json({ error: "Invalid request." }, { status: 400, headers: uncached });
  console.error("Event request failed", error instanceof Error ? error.message : "Unknown error");
  return NextResponse.json({ error: "Shared service is unavailable. Please try again." }, { status: 503, headers: uncached });
}
