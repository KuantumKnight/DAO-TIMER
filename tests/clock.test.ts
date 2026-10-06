import { test } from "node:test";
import assert from "node:assert/strict";
import { applyAnnouncement, applyCommand, applyConfig, deriveClock, formatRemaining, initialEvent, milestoneTime, parseZonedInput, zonedInput } from "../lib/clock";
import { calendar } from "../lib/calendar";

test("default schedule is 8 October 2026, 08:30 to 16:30 IST", () => {
  const e = initialEvent();
  assert.equal(zonedInput(e.clock.startAt, e.config.timezone), "2026-10-08T08:30");
  assert.equal(zonedInput(e.clock.endAt, e.config.timezone), "2026-10-08T16:30");
  assert.equal(e.clock.endAt - e.clock.startAt, 8 * 3600_000);
});
test("scheduled, exact start, and exact finish use absolute time", () => {
  const e = initialEvent();
  assert.equal(deriveClock(e, e.clock.startAt - 1000).remaining, 1000);
  assert.equal(deriveClock(e, e.clock.startAt).phase, "running");
  assert.equal(deriveClock(e, e.clock.endAt).phase, "ended");
  assert.equal(deriveClock(e, e.clock.endAt + 86400_000).remaining, 0);
});
test("early start keeps full configured duration", () => {
  const e = initialEvent(); const now = e.clock.startAt - 900_000;
  const started = applyCommand(e, "start", now);
  assert.equal(started.clock.startAt, now);
  assert.equal(started.clock.endAt, now + 8 * 3600_000);
  assert.equal(started.revision, 1);
});
test("pause freezes time; resume preserves elapsed and shifts milestones", () => {
  const e = initialEvent(); e.config.milestones = [{ id: "review", label: "Review", offsetMs: 2 * 3600_000 }];
  const now = e.clock.startAt + 3600_000;
  const paused = applyCommand(e, "pause", now);
  assert.equal(deriveClock(paused, now + 300_000).remaining, 7 * 3600_000);
  assert.equal(deriveClock(paused, now + 300_000).elapsed, 3600_000);
  const resumed = applyCommand(paused, "resume", now + 300_000);
  assert.equal(deriveClock(resumed, now + 300_000).elapsed, 3600_000);
  assert.equal(resumed.clock.endAt, e.clock.endAt + 300_000);
  assert.equal(resumed.clock.startAt + resumed.config.milestones[0].offsetMs, e.clock.startAt + 2 * 3600_000 + 300_000);
});
test("extension, early finish, and reset retain history", () => {
  const e = initialEvent(); const now = e.clock.startAt + 1000;
  const extended = applyCommand(e, "extend", now, 15);
  assert.equal(extended.clock.endAt, e.clock.endAt + 900_000);
  const ended = applyCommand(extended, "end", now + 1000);
  assert.equal(deriveClock(ended, now + 1000).remaining, 0);
  const reset = applyCommand(ended, "reset", now + 2000);
  assert.equal(reset.clock.endAt, e.clock.endAt);
  assert.equal(reset.clock.endedAt, null);
  assert.equal(reset.history.length, 3);
});
test("pauses move future milestones without rewriting kickoff or completed milestones", () => {
  const e = initialEvent();
  const paused = applyCommand(e, "pause", e.clock.startAt + 3600_000);
  const resumed = applyCommand(paused, "resume", e.clock.startAt + 3900_000);
  assert.equal(milestoneTime(resumed, 0, e.clock.startAt + 3900_000), e.clock.startAt);
  assert.equal(milestoneTime(resumed, 1800_000, e.clock.startAt + 3900_000), e.clock.startAt + 1800_000);
  assert.equal(milestoneTime(resumed, 7200_000, e.clock.startAt + 3900_000), e.clock.startAt + 7500_000);
  assert.ok(calendar(resumed).includes("DTSTART:20261008T030000Z"));
});
test("invalid state commands cannot silently rewrite a clock", () => {
  const e = initialEvent();
  assert.throws(() => applyCommand(e, "pause", e.clock.startAt - 1000));
  assert.throws(() => applyCommand(e, "start", e.clock.startAt));
  assert.throws(() => applyCommand(e, "resume", e.clock.startAt));
  assert.throws(() => applyCommand(e, "extend", e.clock.endAt, 15));
  assert.throws(() => applyCommand(e, "extend", e.clock.startAt, -1));
  assert.throws(() => applyCommand(e, "end", e.clock.startAt - 1000));
});
test("ending while paused records the real finish without including paused build time", () => {
  const e = initialEvent();
  const paused = applyCommand(e, "pause", e.clock.startAt + 3600_000);
  const ended = applyCommand(paused, "end", e.clock.startAt + 3900_000);
  assert.equal(deriveClock(ended, e.clock.startAt + 3900_000).duration, 3600_000);
  assert.equal(milestoneTime(ended, 0, e.clock.startAt + 3900_000), e.clock.startAt);
  assert.equal(milestoneTime(ended, 3600_000, e.clock.startAt + 3900_000), e.clock.startAt + 3900_000);
  assert.ok(calendar(ended).includes("DTEND:20261008T040500Z"));
});
test("metadata edits preserve live timing; schedule edits replace overrides", () => {
  const e = initialEvent(); const extended = applyCommand(e, "extend", e.clock.startAt, 15);
  const metadata = applyConfig(extended, { ...e.config, venue: "New room" }, e.clock.startAt);
  assert.equal(metadata.clock.endAt, extended.clock.endAt);
  const scheduled = applyConfig(metadata, { ...metadata.config, endAt: e.config.endAt + 3600_000 }, e.clock.startAt);
  assert.equal(scheduled.clock.endAt, e.clock.endAt + 3600_000);
  assert.throws(() => applyConfig(e, { ...e.config, endAt: e.config.startAt }, e.clock.startAt));
});
test("announcement publishing and dismissal are recorded", () => {
  const e = initialEvent(); const published = applyAnnouncement(e, "Please submit.", 1);
  assert.equal(published.announcement, "Please submit.");
  assert.equal(applyAnnouncement(published, null, 2).announcement, null);
});
test("timezone conversion handles fractional offsets and DST", () => {
  assert.equal(parseZonedInput("2026-10-08T08:30", "Asia/Kolkata"), Date.parse("2026-10-08T03:00:00Z"));
  assert.equal(parseZonedInput("2026-07-01T08:30", "America/New_York"), Date.parse("2026-07-01T12:30:00Z"));
  assert.equal(parseZonedInput("2026-01-01T08:30", "America/New_York"), Date.parse("2026-01-01T13:30:00Z"));
  assert.throws(() => parseZonedInput("2026-03-08T02:30", "America/New_York"));
});
test("countdown rounds up, supports long waits, and never turns negative", () => {
  assert.deepEqual(formatRemaining(1), ["00", "00", "01"]);
  assert.deepEqual(formatRemaining(-1), ["00", "00", "00"]);
  assert.deepEqual(formatRemaining(123 * 3600_000), ["123", "00", "00"]);
});
test("calendar exports current deadline and safely escapes text", () => {
  const e = initialEvent(); e.config.name = "Build, ship; repeat\nNow";
  const output = calendar(e);
  assert.ok(output.includes("DTSTART:20261008T030000Z"));
  assert.ok(output.includes("DTEND:20261008T110000Z"));
  assert.ok(output.includes("SUMMARY:Build\\, ship\\; repeat\\nNow"));
  assert.ok(output.endsWith("END:VCALENDAR\r\n"));
});
