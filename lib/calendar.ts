import { EventState } from "./clock";
function icsDate(at: number) { return new Date(at).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z"; }
function escape(value: string) { return value.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;"); }
export function calendar(event: EventState) {
  const raw = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//NeuralDAO//Hackathon Timer//EN", "CALSCALE:GREGORIAN", "BEGIN:VEVENT", "UID:neuraldao-2026@dao-timer", `DTSTAMP:${icsDate(Date.now())}`, `DTSTART:${icsDate(event.clock.startAt)}`, `DTEND:${icsDate(event.clock.endAt)}`, `SUMMARY:${escape(event.config.name)}`, `LOCATION:${escape(event.config.venue)}`, `DESCRIPTION:${escape("Hackathon schedule. Check the live timer for organizer updates.")}`, "END:VEVENT", "END:VCALENDAR"];
  return raw.map(line => { let out = ""; let length = 0; for (const ch of line) { const bytes = new TextEncoder().encode(ch).length; if (length + bytes > 73) { out += "\r\n "; length = 1; } out += ch; length += bytes; } return out; }).join("\r\n") + "\r\n";
}
