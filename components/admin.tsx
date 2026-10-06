"use client";
import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeftIcon, ArrowUpRightIcon, CheckIcon, ClockIcon, LockSimpleIcon, PauseIcon, PlayIcon, PlusIcon, SignOutIcon, TrashIcon } from "@phosphor-icons/react";
import { ClockCommand, deriveClock, EventConfig, formatRemaining, formatTime, parseZonedInput, zonedInput } from "@/lib/clock";
import { useEvent } from "./use-event";
import { Panel } from "./panel";

type Pending = { title: string; description: string; payload: Record<string, unknown> };
export function Admin() {
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  useEffect(() => { document.documentElement.dataset.theme = "dark"; void fetch("/api/admin/session", { cache: "no-store" }).then(r => r.json()).then(r => setAuthorized(r.authenticated)).catch(() => { setAuthorized(false); setLoginError("Could not connect. Please try again."); }); }, []);
  async function login(e: FormEvent) {
    e.preventDefault(); setLoggingIn(true); setLoginError("");
    try {
      const response = await fetch("/api/admin/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ passphrase }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      setPassphrase(""); setAuthorized(true);
    } catch (e) { setLoginError(e instanceof Error ? e.message : "Could not sign in."); } finally { setLoggingIn(false); }
  }
  async function logout() { const response = await fetch("/api/admin/session", { method: "DELETE" }); if (response.ok) setAuthorized(false); }
  if (authorized) return <Organizer onLogout={logout} onExpired={() => setAuthorized(false)}/>;
  return <main className="login-page"><Link href="/" className="back-link"><ArrowLeftIcon size={18}/> Back to timer</Link><div className="login-card"><div className="login-symbol"><LockSimpleIcon size={30}/></div><span className="section-label">NEURALDAO 2.0</span><h1>Behind the clock.</h1><p>Organizer access for the shared hackathon timer.</p>{authorized === null ? <p role="status">Checking your session…</p> : <form onSubmit={login}><label htmlFor="passphrase">Organizer passphrase</label><input id="passphrase" type="password" value={passphrase} onChange={e => setPassphrase(e.target.value)} required autoComplete="current-password" maxLength={200}/>{loginError && <p className="form-error" role="alert">{loginError}</p>}<button className="primary-button full" disabled={loggingIn}>{loggingIn ? "Signing in…" : "Open controls"}<ArrowUpRightIcon size={18}/></button></form>}<span className="login-note">Participants can use the timer without signing in.</span></div></main>;
}

function Organizer({ onLogout, onExpired }: { onLogout: () => Promise<void>; onExpired: () => void }) {
  const { event, setEvent, now, connected, error, refresh } = useEvent(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failure, setFailure] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [draft, setDraft] = useState<EventConfig | null>(null);
  const [draftStart, setDraftStart] = useState("");
  const [draftEnd, setDraftEnd] = useState("");
  const [dirty, setDirty] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [announcementDirty, setAnnouncementDirty] = useState(false);
  const [extendMinutes, setExtendMinutes] = useState(15);
  const clock = event && now ? deriveClock(event, now) : null;
  useEffect(() => {
    if (!event) return;
    if (!dirty) { setDraft(event.config); setDraftStart(zonedInput(event.config.startAt, event.config.timezone)); setDraftEnd(zonedInput(event.config.endAt, event.config.timezone)); }
    if (!announcementDirty) setAnnouncement(event.announcement ?? "");
  }, [event, dirty, announcementDirty]);
  useEffect(() => { if (error === "Organizer access required.") onExpired(); }, [error, onExpired]);
  async function mutate(payload: Record<string, unknown>) {
    if (!event || !connected || busy) return;
    setBusy(true); setFailure(""); setMessage("");
    try {
      const response = await fetch("/api/admin/event", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, revision: event.revision }) });
      const data = await response.json();
      if (response.status === 401) { onExpired(); return; }
      if (!response.ok) { if (response.status === 409) await refresh(true); throw new Error(data.error); }
      setEvent(data); setPending(null);
      if (payload.kind === "config") setDirty(false);
      if (payload.kind === "announcement") setAnnouncementDirty(false);
      setMessage("Saved. Shared screens will update within a few seconds.");
    } catch (e) { setFailure(e instanceof Error ? e.message : "Could not save changes."); } finally { setBusy(false); }
  }
  function command(cmd: ClockCommand) {
    const descriptions: Record<ClockCommand, string> = {
      start: `Start now with the full configured ${event ? (event.config.endAt - event.config.startAt) / 3600000 : 8}-hour duration. The deadline and milestones move with the new kickoff.`,
      pause: "Freeze the remaining time on every screen. Resuming will move the deadline and upcoming milestones forward by the pause duration.",
      resume: "Continue from the frozen time. The deadline and upcoming milestones move forward by the pause duration.",
      extend: `Add ${extendMinutes} minutes to the deadline on every screen. Custom milestones retain their elapsed-time positions.`,
      end: "Stop the event immediately. All shared screens will show Time’s up.",
      reset: "Restore the configured start and end times and remove pause or early-finish overrides. History and the current announcement are preserved. A schedule in the past will show as finished."
    };
    setPending({ title: { start: "Start the hackathon?", pause: "Pause the clock?", resume: "Resume the clock?", extend: "Extend the deadline?", end: "Finish the event?", reset: "Reset to the schedule?" }[cmd], description: descriptions[cmd], payload: { kind: "command", command: cmd, ...(cmd === "extend" ? { minutes: extendMinutes } : {}) } });
  }
  function saveConfig(e: FormEvent) {
    e.preventDefault(); if (!draft || !event) return;
    setFailure("");
    try {
      const startAt = parseZonedInput(draftStart, draft.timezone); const endAt = parseZonedInput(draftEnd, draft.timezone);
      if (endAt <= startAt) throw new Error("End time must be after start time.");
      if (draft.milestones.some(m => m.offsetMs <= 0 || m.offsetMs >= endAt - startAt)) throw new Error("Each milestone must fall between kickoff and finish.");
      const config = { ...draft, startAt, endAt };
      const timingChanged = startAt !== event.config.startAt || endAt !== event.config.endAt;
      if (timingChanged || clock?.phase === "running" || clock?.phase === "paused") setPending({ title: "Apply these event changes?", description: timingChanged ? `New schedule: ${draftStart.replace("T", " ")} to ${draftEnd.replace("T", " ")} (${draft.timezone}), ${(endAt - startAt) / 3600000} hours. All screens will follow these absolute times. This clears any pause, early-start, extension, or early-finish override.` : "Event details and milestones update on every screen. The running clock keeps its current timing.", payload: { kind: "config", config } });
      else void mutate({ kind: "config", config });
    } catch (e) { setFailure(e instanceof Error ? e.message : "Check the schedule."); }
  }
  const disabled = busy || !connected;
  const field = (key: keyof EventConfig, value: unknown) => { setDirty(true); setDraft(d => d ? { ...d, [key]: value } : d); };
  return <main className="admin-page"><header className="admin-header"><Link className="back-link" href="/"><ArrowLeftIcon size={18}/> Live timer</Link><div><Link href="/display" target="_blank" className="text-button">Open display <ArrowUpRightIcon size={17}/></Link><button className="icon-button" onClick={() => void onLogout()} aria-label="Sign out"><SignOutIcon size={20}/></button></div></header><div className="admin-title"><div><span className="section-label">ORGANIZER CONTROLS</span><h1>Run the room.</h1></div><span className={`admin-connection ${connected ? "" : "offline"}`}><span className="connection-dot"/>{connected ? "Connected" : "Disconnected"}</span></div>
      {(failure || error) && <div className="admin-notice form-error" role="alert">{failure || error}<button className="text-button" onClick={() => void refresh(true)}>Refresh</button></div>}
      {message && <div className="admin-notice success" role="status"><CheckIcon size={18}/>{message}</div>}
      {!event ? <div className="admin-loading">Loading the shared event…</div> : <>
      <section className="admin-clock"><div><span>{clock?.phase === "scheduled" ? "Until kickoff" : clock?.phase === "paused" ? "Paused" : clock?.phase === "ended" ? "Finished" : "Time remaining"}</span><strong>{clock ? formatRemaining(clock.remaining).join(":") : "--:--:--"}</strong><p>Current deadline: {new Intl.DateTimeFormat("en-GB", { timeZone: event.config.timezone, dateStyle: "medium", timeStyle: "short" }).format(event.clock.endAt + (event.clock.pausedAt !== null ? now - event.clock.pausedAt : 0))} ({event.config.timezone}){clock?.phase === "paused" ? " · estimated while paused" : ""}</p></div><div className="live-actions">{clock?.phase === "scheduled" && <button className="primary-button" disabled={disabled} onClick={() => command("start")}><PlayIcon size={18}/> Start now</button>}{clock?.phase === "running" && <button className="primary-button" disabled={disabled} onClick={() => command("pause")}><PauseIcon size={18}/> Pause clock</button>}{clock?.phase === "paused" && <button className="primary-button" disabled={disabled} onClick={() => command("resume")}><PlayIcon size={18}/> Resume clock</button>}<div className="extend-controls"><label htmlFor="extension">Minutes to add</label><div><input id="extension" type="number" min={1} max={1440} value={extendMinutes} onChange={e => setExtendMinutes(Number(e.target.value))}/><button className="secondary-button" disabled={disabled || clock?.phase === "ended" || extendMinutes < 1 || extendMinutes > 1440} onClick={() => command("extend")}><PlusIcon size={17}/> Extend</button></div></div><div className="danger-actions"><button className="text-button" disabled={disabled || clock?.phase === "ended"} onClick={() => command("end")}>End event</button><button className="text-button" disabled={disabled} onClick={() => command("reset")}>Reset schedule</button></div></div></section>
      <div className="admin-grid"><section className="admin-section"><div className="section-heading"><h2>Event & schedule</h2>{dirty && <span className="unsaved">Unsaved edits</span>}</div>{draft && <form onSubmit={saveConfig}><div className="form-field"><label htmlFor="event-name">Event name</label><input id="event-name" value={draft.name} onChange={e => field("name", e.target.value)} maxLength={80} required/></div><div className="form-field"><label htmlFor="venue">Venue</label><input id="venue" value={draft.venue} onChange={e => field("venue", e.target.value)} maxLength={100}/></div><div className="form-field"><label htmlFor="timezone">Timezone</label><input id="timezone" list="timezones" value={draft.timezone} onChange={e => field("timezone", e.target.value)} required/><datalist id="timezones">{["Asia/Kolkata", "UTC", "Europe/London", "America/New_York", "Asia/Singapore", "Asia/Dubai"].map(z => <option value={z} key={z}/>)}</datalist><p className="help-text">Times below are interpreted in this timezone.</p></div><div className="form-two"><div className="form-field"><label htmlFor="start-time">Start</label><input id="start-time" type="datetime-local" value={draftStart} onChange={e => { setDirty(true); setDraftStart(e.target.value); }} required/></div><div className="form-field"><label htmlFor="end-time">End</label><input id="end-time" type="datetime-local" value={draftEnd} onChange={e => { setDirty(true); setDraftEnd(e.target.value); }} required/></div></div><div className="milestones-editor"><div className="section-heading"><h3>Milestones</h3><button type="button" className="text-button" disabled={draft.milestones.length >= 20} onClick={() => field("milestones", [...draft.milestones, { id: crypto.randomUUID(), label: "", offsetMs: 60 * 60_000 }])}><PlusIcon size={17}/> Add</button></div><p className="help-text">Minutes after kickoff. Pauses move upcoming milestones forward.</p><div className="built-in-milestone"><ClockIcon size={17}/> Kickoff and finish are included automatically.</div>{draft.milestones.map((m, index) => <div className="milestone-editor-row" key={m.id}><div><label htmlFor={`milestone-label-${m.id}`}>Milestone {index + 1}</label><input id={`milestone-label-${m.id}`} value={m.label} maxLength={60} required onChange={e => field("milestones", draft.milestones.map(x => x.id === m.id ? { ...x, label: e.target.value } : x))}/></div><div><label htmlFor={`milestone-time-${m.id}`}>After (min)</label><input id={`milestone-time-${m.id}`} type="number" min={1} step={1} value={m.offsetMs / 60_000} required onChange={e => field("milestones", draft.milestones.map(x => x.id === m.id ? { ...x, offsetMs: Number(e.target.value) * 60_000 } : x))}/></div><button className="icon-button" type="button" aria-label={`Remove milestone ${index + 1}`} onClick={() => field("milestones", draft.milestones.filter(x => x.id !== m.id))}><TrashIcon size={18}/></button></div>)}</div><div className="form-actions"><button className="primary-button" disabled={disabled || !dirty}>Save event</button>{dirty && <button type="button" className="text-button" onClick={() => setDirty(false)}>Discard edits</button>}</div></form>}</section>
      <div><section className="admin-section"><h2>Announcement</h2><p className="help-text">A single message shown on every shared screen.</p><form onSubmit={e => { e.preventDefault(); void mutate({ kind: "announcement", text: announcement }); }}><label htmlFor="announcement">Message</label><textarea id="announcement" rows={4} maxLength={500} value={announcement} onChange={e => { setAnnouncementDirty(true); setAnnouncement(e.target.value); }}/><div className="announcement-counter">{announcement.length}/500</div><div className="form-actions"><button className="primary-button" disabled={disabled || !announcement.trim()}>Publish</button><button type="button" className="secondary-button" disabled={disabled || !event.announcement} onClick={() => void mutate({ kind: "announcement", text: null })}>Dismiss</button></div></form></section><section className="admin-section history-section"><h2>Control history</h2><p className="help-text">Latest organizer actions. Shared access records actions, not individual identities.</p>{event.history.length === 0 ? <div className="history-empty">No changes yet. The configured schedule is ready.</div> : <ol className="history-list">{event.history.map((item, i) => <li key={`${item.at}-${i}`}><span className="mono">{formatTime(item.at, event.config.timezone)}</span><div><strong>{item.action === "configure" ? "Event updated" : item.action === "announcement" ? "Announcement updated" : `${item.action.charAt(0).toUpperCase()}${item.action.slice(1)}`}</strong><p>{item.detail}</p><time dateTime={new Date(item.at).toISOString()}>{new Intl.DateTimeFormat("en-GB", { timeZone: event.config.timezone, day: "2-digit", month: "short" }).format(item.at)}</time></div></li>)}</ol>}</section></div></div>
      </>}
      <Panel open={!!pending} onOpenChange={open => { if (!open && !busy) setPending(null); }} title={pending?.title ?? "Confirm change"} description={pending?.description ?? "Review the event change."}><div className="confirmation-actions"><button className="secondary-button" disabled={busy} onClick={() => setPending(null)}>Cancel</button><button className="primary-button" disabled={disabled} onClick={() => pending && void mutate(pending.payload)}>{busy ? "Applying…" : "Confirm change"}</button></div>{failure && <p className="form-error" role="alert">{failure}</p>}</Panel>
    </main>;
}
