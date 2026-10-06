export type Milestone = { id: string; label: string; offsetMs: number };
export type EventConfig = {
  name: string; venue: string; timezone: string; startAt: number; endAt: number;
  milestones: Milestone[];
};
export type EventState = {
  config: EventConfig; revision: number;
  clock: { startAt: number; endAt: number; pausedAt: number | null; endedAt: number | null; pauses: { elapsedMs: number; durationMs: number }[] };
  announcement: string | null;
  history: { at: number; action: string; detail: string }[];
};
export type ClockCommand = "start" | "pause" | "resume" | "extend" | "end" | "reset";
export type Phase = "scheduled" | "running" | "paused" | "ended";

export function initialEvent(): EventState {
  const startAt = Date.parse("2026-10-08T08:30:00+05:30");
  const endAt = Date.parse("2026-10-08T16:30:00+05:30");
  return {
    config: { name: "NeuralDAO 2.0", venue: "Netaji Auditorium", timezone: "Asia/Kolkata", startAt, endAt, milestones: [] },
    revision: 0, clock: { startAt, endAt, pausedAt: null, endedAt: null, pauses: [] }, announcement: null, history: []
  };
}

export function deriveClock(event: EventState, now: number) {
  const { startAt, endAt, pausedAt, endedAt } = event.clock;
  const effectiveNow = pausedAt ?? now;
  const phase: Phase = endedAt !== null ? "ended" : pausedAt !== null ? "paused" : now < startAt ? "scheduled" : now >= endAt ? "ended" : "running";
  const duration = endAt - startAt;
  const elapsed = phase === "ended" ? duration : Math.max(0, Math.min(duration, effectiveNow - startAt));
  const remaining = phase === "scheduled" ? Math.max(0, startAt - now) : phase === "ended" ? 0 : Math.max(0, endAt - effectiveNow);
  const milestones: Milestone[] = [{ id: "kickoff", label: "Kickoff", offsetMs: 0 }, ...event.config.milestones.filter(m => m.offsetMs > 0 && m.offsetMs < duration), { id: "finish", label: "Time’s up", offsetMs: duration }].sort((a, b) => a.offsetMs - b.offsetMs);
  const next = phase === "scheduled" ? milestones[0] : phase === "ended" ? null : milestones.find(m => m.offsetMs > elapsed) ?? null;
  return { phase, duration, elapsed, remaining, progress: duration > 0 ? elapsed / duration : 0, milestones, next };
}

// Completed milestones keep their actual time; only future milestones move.
export function milestoneTime(event: EventState, offsetMs: number, now: number) {
  if (event.clock.endedAt !== null && offsetMs === event.clock.endAt - event.clock.startAt) return event.clock.endedAt;
  const pauses = event.clock.pauses ?? [];
  const originalStart = event.clock.startAt - pauses.reduce((sum, pause) => sum + pause.durationMs, 0);
  const completedPause = pauses.filter(pause => pause.elapsedMs < offsetMs).reduce((sum, pause) => sum + pause.durationMs, 0);
  const currentlyPaused = event.clock.pausedAt !== null && offsetMs > deriveClock(event, now).elapsed ? Math.max(0, now - event.clock.pausedAt) : 0;
  return originalStart + offsetMs + completedPause + currentlyPaused;
}

function record(event: EventState, now: number, action: string, detail: string): EventState {
  return { ...event, revision: event.revision + 1, history: [{ at: now, action, detail }, ...event.history].slice(0, 200) };
}

export function applyCommand(event: EventState, command: ClockCommand, now: number, minutes = 0): EventState {
  const phase = deriveClock(event, now).phase;
  const clock = { ...event.clock };
  let detail = "";
  if (command === "start") {
    if (phase !== "scheduled") throw new Error("The event has already started.");
    clock.startAt = now; clock.endAt = now + (event.config.endAt - event.config.startAt); clock.pauses = [];
    detail = "Started early with the full configured duration.";
  } else if (command === "pause") {
    if (phase !== "running") throw new Error("Only a running event can be paused.");
    clock.pausedAt = now; detail = "Remaining time frozen.";
  } else if (command === "resume") {
    if (phase !== "paused" || clock.pausedAt === null) throw new Error("The event is not paused.");
    const shift = now - clock.pausedAt;
    clock.pauses = [...(clock.pauses ?? []), { elapsedMs: clock.pausedAt - clock.startAt, durationMs: shift }];
    clock.startAt += shift; clock.endAt += shift; clock.pausedAt = null;
    detail = `Resumed; deadline moved by ${Math.round(shift / 1000)} seconds.`;
  } else if (command === "extend") {
    if (phase === "ended") throw new Error("Reset the event before changing a finished clock.");
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 1440) throw new Error("Enter between 1 and 1440 minutes.");
    clock.endAt += minutes * 60_000; detail = `Added ${minutes} minutes.`;
  } else if (command === "end") {
    if (phase !== "running" && phase !== "paused") throw new Error("Only a running or paused event can be ended.");
    if (clock.pausedAt !== null) {
      const shift = now - clock.pausedAt;
      clock.pauses = [...(clock.pauses ?? []), { elapsedMs: clock.pausedAt - clock.startAt, durationMs: shift }];
      clock.startAt += shift;
    }
    clock.endAt = now; clock.endedAt = now; clock.pausedAt = null; detail = "Organizer ended the event.";
  } else if (command === "reset") {
    Object.assign(clock, { startAt: event.config.startAt, endAt: event.config.endAt, pausedAt: null, endedAt: null, pauses: [] });
    detail = "Restored the configured schedule.";
  }
  return record({ ...event, clock }, now, command, detail);
}

export function applyConfig(event: EventState, config: EventConfig, now: number): EventState {
  if (config.endAt <= config.startAt) throw new Error("End time must be after start time.");
  const timingChanged = config.startAt !== event.config.startAt || config.endAt !== event.config.endAt;
  return record({ ...event, config, clock: timingChanged ? { startAt: config.startAt, endAt: config.endAt, pausedAt: null, endedAt: null, pauses: [] } : event.clock }, now, "configure", timingChanged ? "Updated schedule; clock follows the new start and end times." : "Updated event details and milestones.");
}

export function applyAnnouncement(event: EventState, text: string | null, now: number): EventState {
  return record({ ...event, announcement: text }, now, "announcement", text ? "Published an announcement." : "Dismissed the announcement.");
}

export function formatRemaining(ms: number): [string, string, string] {
  const seconds = Math.ceil(Math.max(0, ms) / 1000);
  return [String(Math.floor(seconds / 3600)).padStart(2, "0"), String(Math.floor(seconds / 60) % 60).padStart(2, "0"), String(seconds % 60).padStart(2, "0")];
}

export function formatTime(at: number, timezone: string) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hour12: false }).format(at);
}

export function zonedInput(at: number, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(at);
  const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

export function parseZonedInput(value: string, timezone: string) {
  const naive = Date.parse(value + "Z");
  if (!Number.isFinite(naive)) throw new Error("Enter a valid date and time.");
  let result = naive;
  for (let i = 0; i < 3; i++) result += naive - Date.parse(zonedInput(result, timezone) + "Z");
  if (zonedInput(result, timezone) !== value) throw new Error("This local time does not exist in the selected timezone.");
  return result;
}
