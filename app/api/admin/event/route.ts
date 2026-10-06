import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticated, sameOrigin } from "@/lib/auth";
import { applyAnnouncement, applyCommand, applyConfig } from "@/lib/clock";
import { readEvent, updateEvent } from "@/lib/store";
import { apiError, uncached } from "@/lib/http";
const configSchema = z.object({
  name: z.string().trim().min(1).max(80), venue: z.string().trim().max(100),
  timezone: z.string().refine(v => { try { new Intl.DateTimeFormat("en", { timeZone: v }); return true; } catch { return false; } }, "Select a valid timezone."),
  startAt: z.number().int().min(0).max(8640000000000000), endAt: z.number().int().min(0).max(8640000000000000),
  milestones: z.array(z.object({ id: z.string().min(1).max(80), label: z.string().trim().min(1).max(60), offsetMs: z.number().int().positive() })).max(20)
}).refine(c => c.endAt > c.startAt && c.endAt - c.startAt <= 7 * 86400000, "Duration must be positive and no more than seven days.").refine(c => c.milestones.every(m => m.offsetMs < c.endAt - c.startAt) && new Set(c.milestones.map(m => m.id)).size === c.milestones.length && c.milestones.every(m => !["kickoff", "finish"].includes(m.id)), "Milestones must be unique and fall between kickoff and finish.");
const schema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("command"), revision: z.number().int().nonnegative(), command: z.enum(["start", "pause", "resume", "extend", "end", "reset"]), minutes: z.number().int().min(1).max(1440).optional() }),
  z.object({ kind: z.literal("config"), revision: z.number().int().nonnegative(), config: configSchema }),
  z.object({ kind: z.literal("announcement"), revision: z.number().int().nonnegative(), text: z.string().trim().max(500).nullable() })
]);
export async function GET() {
  if (!await authenticated()) return NextResponse.json({ error: "Organizer access required." }, { status: 401, headers: uncached });
  try { return NextResponse.json(await readEvent(), { headers: uncached }); } catch (e) { return apiError(e); }
}
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403, headers: uncached });
  if (!await authenticated()) return NextResponse.json({ error: "Organizer access required." }, { status: 401, headers: uncached });
  try {
    const data = schema.parse(await request.json());
    const result = await updateEvent(data.revision, event => {
      const now = Date.now();
      try {
        if (data.kind === "command") return applyCommand(event, data.command, now, data.minutes);
        if (data.kind === "config") return applyConfig(event, data.config, now);
        return applyAnnouncement(event, data.text || null, now);
      } catch (e) { throw new z.ZodError([{ code: "custom", path: [], message: e instanceof Error ? e.message : "Invalid event change." }]); }
    });
    return NextResponse.json(result, { headers: uncached });
  } catch (e) { return apiError(e); }
}
