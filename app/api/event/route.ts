import { NextResponse } from "next/server";
import { publicEvent, readEvent } from "@/lib/store";
import { apiError } from "@/lib/http";
export async function GET() {
  try { return NextResponse.json(publicEvent(await readEvent()), { headers: { "Cache-Control": "public, max-age=0, s-maxage=1, must-revalidate", "Vercel-CDN-Cache-Control": "public, s-maxage=1" } }); }
  catch (e) { return apiError(e); }
}
