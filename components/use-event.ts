"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { EventState } from "@/lib/clock";

export function useEvent(admin = false) {
  const [event, setEvent] = useState<EventState | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(0);
  const base = useRef<{ server: number; local: number } | null>(null);
  const lastSync = useRef(0);
  const active = useRef(true);
  const inFlight = useRef(false);
  const refresh = useCallback(async (forceSync = false) => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const needTime = forceSync || !base.current || performance.now() - lastSync.current > 60_000;
      const started = performance.now();
      const timePromise = needTime ? fetch("/api/time", { cache: "no-store", signal: AbortSignal.timeout(8000) }).then(async res => { if (!res.ok) throw new Error("Time synchronization unavailable."); return res.json() as Promise<{ serverTime: number }>; }).then(data => { const ended = performance.now(); return { server: data.serverTime + (ended - started) / 2, local: ended }; }) : Promise.resolve(null);
      const [response, time] = await Promise.all([fetch(admin ? "/api/admin/event" : "/api/event", { cache: "no-store", signal: AbortSignal.timeout(8000) }), timePromise]);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not load the shared clock.");
      if (!active.current) return;
      if (time) { base.current = time; lastSync.current = performance.now(); }
      setEvent(previous => !previous || data.revision >= previous.revision ? data : previous);
      setConnected(true); setError("");
      if (base.current) setNow(base.current.server + performance.now() - base.current.local);
    } catch (e) {
      if (active.current) { setConnected(false); setError(e instanceof Error ? e.message : "Connection lost."); }
    } finally { inFlight.current = false; }
  }, [admin]);
  useEffect(() => {
    active.current = true;
    void refresh(true);
    const polling = setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 3000);
    const ticking = setInterval(() => { if (base.current) setNow(base.current.server + performance.now() - base.current.local); }, 200);
    const resync = () => { if (document.visibilityState === "visible") void refresh(true); };
    const offline = () => setConnected(false);
    document.addEventListener("visibilitychange", resync); window.addEventListener("online", resync); window.addEventListener("offline", offline);
    return () => { active.current = false; clearInterval(polling); clearInterval(ticking); document.removeEventListener("visibilitychange", resync); window.removeEventListener("online", resync); window.removeEventListener("offline", offline); };
  }, [refresh]);
  return { event, setEvent, now, connected, error, refresh };
}
