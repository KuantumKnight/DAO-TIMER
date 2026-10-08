"use client";
import { useEffect, useRef, useState } from "react";

const volumeKey = "neuraldao-music-volume";

export function useMusic() {
  const player = useRef<HTMLAudioElement | null>(null);
  const request = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [volume, setVolume] = useState(0.35);
  const [error, setError] = useState("");

  useEffect(() => {
    const audio = player.current;
    if (!audio) return;
    let initialVolume = 0.35;
    try {
      const stored = localStorage.getItem(volumeKey);
      if (stored !== null && Number.isFinite(Number(stored))) initialVolume = Math.min(1, Math.max(0, Number(stored)));
    } catch { /* Playback still works when storage is unavailable. */ }
    audio.volume = initialVolume;
    setVolume(initialVolume);

    const play = () => setPlaying(true);
    const ready = () => { setPlaying(true); setLoading(false); };
    const pause = () => { setPlaying(false); setLoading(false); };
    const waiting = () => { if (!audio.paused) setLoading(true); };
    const failed = () => {
      request.current++;
      setPlaying(false); setLoading(false);
      setError("Music could not load. Check your connection and try Play again.");
    };
    audio.addEventListener("play", play);
    audio.addEventListener("playing", ready);
    audio.addEventListener("pause", pause);
    audio.addEventListener("waiting", waiting);
    audio.addEventListener("error", failed);
    return () => {
      request.current++;
      audio.removeEventListener("play", play);
      audio.removeEventListener("playing", ready);
      audio.removeEventListener("pause", pause);
      audio.removeEventListener("waiting", waiting);
      audio.removeEventListener("error", failed);
      audio.pause();
    };
  }, []);

  async function toggle() {
    const audio = player.current;
    if (!audio) return;
    const id = ++request.current;
    if (!audio.paused || loading) {
      audio.pause(); setPlaying(false); setLoading(false);
      return;
    }
    setError(""); setLoading(true);
    try {
      if (audio.error) audio.load();
      await audio.play();
      if (id === request.current) { setPlaying(true); setLoading(false); }
    } catch (cause) {
      if (id !== request.current) return;
      setPlaying(false); setLoading(false);
      setError(cause instanceof DOMException && cause.name === "NotAllowedError"
        ? "Your browser blocked playback. Allow audio for this site, then try Play again."
        : "Music could not play. Try Play again.");
    }
  }

  function changeVolume(value: number) {
    const next = Math.min(1, Math.max(0, value));
    setVolume(next);
    if (player.current) player.current.volume = next;
    try { localStorage.setItem(volumeKey, String(next)); } catch { /* Keep the current session volume. */ }
  }

  return { player, playing, loading, volume, error, toggle, changeVolume };
}
