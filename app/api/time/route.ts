import { NextResponse } from "next/server";
import { uncached } from "@/lib/http";
export function GET() { return NextResponse.json({ serverTime: Date.now() }, { headers: uncached }); }
