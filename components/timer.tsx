"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { ArrowDownIcon, ArrowLeftIcon, ArrowUpRightIcon, CalendarBlankIcon, CheckIcon, CopyIcon, CornersOutIcon, GearSixIcon, LockSimpleIcon, MoonIcon, QrCodeIcon, SpeakerHighIcon, SpeakerSlashIcon, SunIcon, WifiSlashIcon } from "@phosphor-icons/react";
import { QRCodeSVG } from "qrcode.react";
import { deriveClock, formatRemaining, formatTime, milestoneTime } from "@/lib/clock";
import { calendar } from "@/lib/calendar";
import { useEvent } from "./use-event";
import { Panel } from "./panel";

type WakeLockHandle = { release: () => Promise<void>; addEventListener: (type: string, listener: () => void) => void };
type WakeNavigator = Navigator & { wakeLock?: { request: (type: "screen") => Promise<WakeLockHandle> } };
function downloadFile(content: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function Timer({ projector = false }: { projector?: boolean }) {
  const { event, now, connected, error, refresh } = useEvent();
  const clock = event && now ? deriveClock(event, now) : null;
  const [settings, setSettings] = useState(false);
  const [share, setShare] = useState(false);
  const [schedule, setSchedule] = useState(false);
  const [theme, setTheme] = useState("dark");
  const [sound, setSound] = useState(false);
  const [awake, setAwake] = useState(false);
  const [wakeSupported, setWakeSupported] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [copied, setCopied] = useState(false);
  const [url, setUrl] = useState("");
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showProgress, setShowProgress] = useState(true);
  const wake = useRef<WakeLockHandle | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const previous = useRef<{ remaining: number; phase: string } | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    setUrl(window.location.origin);
    setWakeSupported(!!(navigator as WakeNavigator).wakeLock);
    setShowProgress(localStorage.getItem("neuraldao-progress") !== "hidden");
    const preference = projector ? "dark" : localStorage.getItem("neuraldao-theme") ?? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    setTheme(preference); document.documentElement.dataset.theme = preference;
    return () => { void wake.current?.release(); void audio.current?.close(); };
  }, [projector]);

  useEffect(() => {
    const change = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", change);
    return () => document.removeEventListener("fullscreenchange", change);
  }, []);
  function toggleProgress() {
    setShowProgress(current => {
      localStorage.setItem("neuraldao-progress", current ? "hidden" : "visible");
      return !current;
    });
  }

  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
      else setFeedback("Fullscreen is unavailable here. Open display mode for a clean view.");
    } catch { setFeedback("Fullscreen could not open. Try your browser’s fullscreen control."); }
  }
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input,textarea,select,[contenteditable=true]") || e.ctrlKey || e.metaKey || e.altKey || settings || share || schedule) return;
      if (e.key.toLowerCase() === "f") { e.preventDefault(); void fullscreen(); }
      if (e.key.toLowerCase() === "s") { e.preventDefault(); setSettings(true); }
      if (e.key.toLowerCase() === "p") { e.preventDefault(); toggleProgress(); }
      if (e.key === "?") setSettings(true);
    };
    window.addEventListener("keydown", listener); return () => window.removeEventListener("keydown", listener);
  }, [settings, share, schedule]);

  useEffect(() => {
    if (!projector) return;
    const show = () => { setControlsVisible(true); if (hideTimer.current) clearTimeout(hideTimer.current); hideTimer.current = setTimeout(() => setControlsVisible(false), 3500); };
    show(); window.addEventListener("pointermove", show); window.addEventListener("pointerdown", show); window.addEventListener("keydown", show);
    return () => { if (hideTimer.current) clearTimeout(hideTimer.current); window.removeEventListener("pointermove", show); window.removeEventListener("pointerdown", show); window.removeEventListener("keydown", show); };
  }, [projector]);

  useEffect(() => {
    const reacquire = async () => { if (awake && document.visibilityState === "visible" && !wake.current) { try { wake.current = await (navigator as WakeNavigator).wakeLock!.request("screen"); wake.current.addEventListener("release", () => { wake.current = null; }); } catch { setAwake(false); setFeedback("Keep-awake is unavailable. Check your device settings."); } } };
    document.addEventListener("visibilitychange", reacquire); return () => document.removeEventListener("visibilitychange", reacquire);
  }, [awake]);

  useEffect(() => {
    if (!clock || !event) return;
    const prev = previous.current;
    previous.current = { remaining: clock.remaining, phase: clock.phase };
    if (!sound || !connected || !prev || !audio.current) return;
    const thresholds = clock.phase === "ended" ? [0] : [3600, 1800, 600, 300, 60];
    for (const threshold of thresholds) {
      const crossed = prev.phase === "running" && prev.remaining > threshold * 1000 && clock.remaining <= threshold * 1000 && ["running", "ended"].includes(clock.phase);
      const key = `neuraldao-alert:${event.config.startAt}:${threshold}`;
      if (crossed && !sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, "1");
        const ctx = audio.current;
        for (let i = 0; i < (threshold === 0 ? 3 : 2); i++) {
          const oscillator = ctx.createOscillator(); const gain = ctx.createGain();
          oscillator.connect(gain); gain.connect(ctx.destination); oscillator.frequency.value = threshold === 0 ? 660 : 880;
          const at = ctx.currentTime + i * 0.23;
          gain.gain.setValueAtTime(0, at); gain.gain.linearRampToValueAtTime(0.14, at + 0.015); gain.gain.exponentialRampToValueAtTime(0.001, at + 0.18);
          oscillator.start(at); oscillator.stop(at + 0.2);
        }
        break;
      }
    }
  }, [clock, connected, event, sound]);

  async function toggleSound() {
    if (sound) { setSound(false); return; }
    try { audio.current ??= new AudioContext(); await audio.current.resume(); setSound(true); } catch { setFeedback("Sound is unavailable in this browser."); }
  }
  async function toggleAwake() {
    if (awake) { await wake.current?.release(); wake.current = null; setAwake(false); return; }
    try { wake.current = await (navigator as WakeNavigator).wakeLock!.request("screen"); wake.current.addEventListener("release", () => { wake.current = null; }); setAwake(true); } catch { setFeedback("Keep-awake is unavailable. Check your device settings."); }
  }
  function toggleTheme() { const next = theme === "dark" ? "light" : "dark"; setTheme(next); localStorage.setItem("neuraldao-theme", next); document.documentElement.dataset.theme = next; }
  async function copy() {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { setFeedback("Copy the address shown below."); }
  }
  const digits = clock ? formatRemaining(clock.remaining) : ["--", "--", "--"];
  const phase = clock?.phase ?? "loading";
  const date = event ? new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: event.config.timezone }).format(milestoneTime(event, 0, now)) : "08 Oct 2026";
  const zone = event?.config.timezone === "Asia/Kolkata" ? "IST" : event?.config.timezone ?? "IST";
  const label = phase === "scheduled" ? "Kickoff in" : phase === "paused" ? "Clock paused" : phase === "ended" ? "Time’s up" : phase === "running" ? "Time remaining" : "Connecting";
  const urgent = phase === "running" && !!clock && clock.remaining <= 600000;
  const status = phase === "scheduled" ? "Standing by" : phase === "running" ? (urgent ? "● Final 10 min" : "● Live") : phase === "paused" ? "Paused" : phase === "ended" ? "Finished" : "Syncing";
  const at = (offsetMs: number) => event ? formatTime(milestoneTime(event, offsetMs, now), event.config.timezone) : "--:--";
  const finish = event ? formatTime(event.clock.endedAt ?? event.clock.endAt + (event.clock.pausedAt !== null ? Math.max(0, now - event.clock.pausedAt) : 0), event.config.timezone) : "--:--";
  const segments = clock ? clock.milestones.slice(0, -1).map((m, i) => {
    const end = clock.milestones[i + 1].offsetMs;
    const span = end - m.offsetMs;
    return { id: m.id, label: clock.milestones.length === 2 ? "Hacking" : m.label, start: m.offsetMs, span, progress: span > 0 ? Math.min(1, Math.max(0, (clock.elapsed - m.offsetMs) / span)) : 1 };
  }).filter(segment => segment.span > 0) : [];
  // Long pre-event countdowns can have 3+ hour digits; shrink so HH:MM still fits one line.
  const fit = 5 / (digits[0].length + 3);

  return <main className={`timer-app ${projector ? "projector" : ""} ${projector || isFullscreen ? "clean-display" : ""} ${urgent ? "urgent" : ""} ${phase}`}>
    <header className="site-header">
      <Link href="/" className="brand" aria-label="NeuralDAO 2.0 timer"><Image src="/neuraldao-logo.png" width={210} height={35} alt="NeuralDAO" priority/><span className="chip">2.0</span></Link>
      <div className="header-event"><b>{date}</b><span className="header-venue"> · {event?.config.venue ?? "Netaji Auditorium"}</span></div>
      <button className="icon-button header-settings" aria-label="Display settings" onClick={() => setSettings(true)}><GearSixIcon size={22}/></button>
    </header>

    <section className="clock-frame" aria-label={label}>
      <span className="frame-node top" aria-hidden/><span className="frame-node bottom" aria-hidden/>
      <div className="frame-top"><h1>{label}</h1><span className={`chip ${phase === "running" ? "" : "outline"}`}>{status}</span></div>
      <div className="digits" role="timer" style={{ "--fit": fit } as React.CSSProperties} aria-label={clock ? `${digits[0]} hours, ${digits[1]} minutes, ${digits[2]} seconds` : "Loading timer"}>
        <span className="digits-main">{digits[0]}<span className="digits-colon">:</span>{digits[1]}</span><span className="digits-seconds">{digits[2]}</span>
      </div>
      <div className="clock-subline">
        <span>{phase === "scheduled" ? <>Starts at <b>{at(0)}</b> {zone}</> : phase === "ended" ? <>Finished at <b>{finish}</b> {zone}</> : clock?.next ? <>Next: <b>{clock.next.label}</b> at <b>{at(clock.next.offsetMs)}</b></> : null}</span>
        <span>{phase !== "ended" && <>Ends <b>{phase === "paused" ? "~" : ""}{finish}</b> {zone}{phase === "paused" ? " · moves while paused" : ""}</>}<button className="text-button" onClick={() => setSchedule(true)}>View schedule <ArrowUpRightIcon size={17}/></button></span>
      </div>
    </section>

    {event?.announcement && <motion.aside initial={reduced ? false : { opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="announcement" aria-live="polite"><span className="announcement-tag" aria-hidden>!?</span><div><span className="visually-hidden">From the organizers: </span><p>{event.announcement}</p></div></motion.aside>}

    <section className="event-timeline" aria-label="Event schedule" hidden={!showProgress}>
      <div className="schedule-track" role="progressbar" aria-label="Hackathon elapsed" aria-valuenow={clock ? Math.round(clock.progress * 100) : 0} aria-valuemin={0} aria-valuemax={100}>
        {segments.map(s => <div key={s.id} className={`segment ${s.progress >= 1 ? "done" : s.progress > 0 ? "now" : ""}`} style={{ flex: s.span }}><div className="segment-bar"><i style={{ transform: `scaleX(${s.progress})` }}/></div><span className="segment-time">{at(s.start)}</span><span className="segment-label">{s.label}</span></div>)}
      </div>
      <div className="schedule-end">{finish} · {phase === "paused" ? "Estimated finish" : "Time’s up"}</div>
    </section>

    <footer className={`display-controls ${projector && !controlsVisible && !settings && !share && !schedule ? "controls-hidden" : ""}`}>
      <div className="connection">{connected ? <><span className="connection-dot"/> Shared clock</> : <><WifiSlashIcon size={16}/><span>{event ? "Connection lost; showing last sync" : "Connecting"}</span><button className="inline-button" onClick={() => void refresh(true)}>Retry</button></>}</div>
      <nav aria-label="Timer tools"><button className="tool-button" onClick={() => void toggleSound()} aria-label={sound ? "Mute alerts" : "Enable sound alerts"} title={sound ? "Mute alerts" : "Enable sound alerts"}>{sound ? <SpeakerHighIcon size={20}/> : <SpeakerSlashIcon size={20}/>}</button><button className="tool-button" aria-label="Share" onClick={() => setShare(true)}><QrCodeIcon size={20}/><span>Share</span></button>{projector ? <Link className="tool-button" aria-label="Exit display" href="/"><ArrowLeftIcon size={20}/><span>Exit display</span></Link> : <Link className="tool-button" aria-label="Display" href="/display"><CornersOutIcon size={20}/><span>Display</span></Link>}<button className="tool-button" onClick={() => void fullscreen()} aria-label="Toggle fullscreen" title="Fullscreen (F)"><CornersOutIcon size={20}/></button><button className="tool-button" onClick={() => setSettings(true)} aria-label="Display settings"><GearSixIcon size={20}/></button></nav>
    </footer>
    {!event && error && <div className="service-error" role="alert">{error} <button onClick={() => void refresh(true)} className="text-button">Try again</button></div>}
    {feedback && <div className="toast" role="status" onClick={() => setFeedback("")}>{feedback}<button aria-label="Dismiss message" onClick={() => setFeedback("")}>×</button></div>}

    <Panel open={settings} onOpenChange={setSettings} title="Settings" description="Saved on this device only.">
      <div className="setting-row"><div><strong>Event progress</strong><p>Show the schedule beneath the clock. Shortcut: P.</p></div><button className="secondary-button" aria-label="Show event progress" aria-pressed={showProgress} onClick={toggleProgress}>{showProgress ? "On" : "Off"}</button></div>
      <div className="setting-row"><div><strong>Appearance</strong><p>{theme === "dark" ? "Dark" : "Light"} display</p></div><button className="secondary-button" onClick={toggleTheme}>{theme === "dark" ? <SunIcon size={18}/> : <MoonIcon size={18}/>} Switch theme</button></div>
      <div className="setting-row"><div><strong>Sound alerts</strong><p>1h, 30m, 10m, 5m, 1m, and finish.</p></div><button className="secondary-button" onClick={() => void toggleSound()} aria-pressed={sound}>{sound ? <SpeakerHighIcon size={18}/> : <SpeakerSlashIcon size={18}/>} {sound ? "On" : "Off"}</button></div>
      <div className="setting-row"><div><strong>Keep screen awake</strong><p>{wakeSupported ? "Keep this screen on while visible." : "Not supported in this browser."}</p></div><button className="secondary-button" disabled={!wakeSupported} onClick={() => void toggleAwake()} aria-pressed={awake}>{awake ? "On" : "Off"}</button></div>
      <div className="keyboard-help"><span>Keyboard</span><div><kbd>F</kbd> Fullscreen <kbd>P</kbd> Progress <kbd>S</kbd> Settings <kbd>Esc</kbd> Close</div></div>
      {projector && <Link href="/" className="organizer-link"><ArrowLeftIcon size={18}/> Exit display</Link>}
      <Link href="/admin" className="organizer-link"><LockSimpleIcon size={18}/> Organizer controls <ArrowUpRightIcon size={18}/></Link>
    </Panel>
    <Panel open={share} onOpenChange={setShare} title="Share this timer" description="Scan to open the live clock on your phone."><div className="qr-container">{url && <QRCodeSVG value={url} size={208} level="M" marginSize={2} title="Open NeuralDAO timer"/>}</div><div className="share-url">{url}</div><button className="primary-button full" onClick={() => void copy()}>{copied ? <CheckIcon size={18}/> : <CopyIcon size={18}/>} {copied ? "Copied" : "Copy link"}</button></Panel>
    <Panel open={schedule} onOpenChange={setSchedule} title={event?.config.name ?? "Event schedule"} description={`${date} · ${zone}`}>
      <div className="schedule-location"><CalendarBlankIcon size={18}/>{event?.config.venue}</div><div className="schedule-list">{clock?.milestones.map(m => { const milestoneNow = m.offsetMs <= clock.elapsed && phase !== "scheduled"; const at = milestoneTime(event!, m.offsetMs, now); return <div key={m.id} className={`schedule-item ${milestoneNow ? "passed" : ""}`}><span className="mono">{formatTime(at, event!.config.timezone)}</span><strong>{m.label}</strong>{milestoneNow && <CheckIcon size={17}/>}</div>; })}</div><p className="help-text">{phase === "paused" ? "Upcoming times are estimates while the clock is paused." : "Times update when organizers change the clock."}</p><button className="secondary-button full" disabled={!event} onClick={() => event && downloadFile(calendar(event, now), "neuraldao.ics", "text/calendar")}><ArrowDownIcon size={18}/> Add to calendar</button>
    </Panel>
  </main>;
}
