import { deriveClock, EventState, milestoneTime } from "./clock";
function icsDate(at: number) { return new Date(at).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z"; }
function escape(value: string) { return value.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;"); }
export function calendar(event: EventState, now = Date.now()) {
  const raw = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//NeuralDAO//Hackathon Timer//EN", "CALSCALE:GREGORIAN", "BEGIN:VEVENT", "UID:neuraldao-2026@dao-timer", `DTSTAMP:${icsDate(now)}`, `DTSTART:${icsDate(milestoneTime(event, 0, now))}`, `DTEND:${icsDate(milestoneTime(event, deriveClock(event, now).duration, now))}`, `SUMMARY:${escape(event.config.name)}`, `LOCATION:${escape(event.config.venue)}`, `DESCRIPTION:${escape(event.clock.pausedAt !== null ? "The clock is paused. Finish time is an estimate. Check the live timer for updates." : "Hackathon schedule. Check the live timer for organizer updates.")}`, "END:VEVENT", "END:VCALENDAR"];
  return raw.map(line => { let out = ""; let length = 0; for (const ch of line) { const bytes = new TextEncoder().encode(ch).length; if (length + bytes > 73) { out += "\r\n "; length = 1; } out += ch; length += bytes; } return out; }).join("\r\n") + "\r\n";
}
