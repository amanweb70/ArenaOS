"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RumbleCombatEvent, RumbleState } from "@/lib/types";

const preferenceKey = "arenaos.agent-rumble.audio.v2";
const musicUrl = "/audio/agent-rumble/crownfall-battle.ogg";

type AudioPreferences = {
  enabled: boolean;
  musicVolume: number;
  sfxVolume: number;
};

const defaults: AudioPreferences = { enabled: true, musicVolume: 0.24, sfxVolume: 0.72 };

export function useRumbleAudio(state?: RumbleState) {
  const [preferences, setPreferences] = useState(defaults);
  const contextRef = useRef<AudioContext | null>(null);
  const musicRef = useRef<HTMLAudioElement | null>(null);
  const lastEventId = useRef<string | undefined>(undefined);
  const lastCompletedMatch = useRef<string | undefined>(undefined);

  const persist = useCallback((next: AudioPreferences) => {
    setPreferences(next);
    window.localStorage.setItem(preferenceKey, JSON.stringify(next));
  }, []);

  const ensureAudio = useCallback(async () => {
    contextRef.current ??= new AudioContext();
    musicRef.current ??= createMusic();
    musicRef.current.volume = preferences.musicVolume;
    if (contextRef.current.state === "suspended") await contextRef.current.resume();
    if (musicRef.current.paused) await musicRef.current.play();
  }, [preferences.musicVolume]);

  const toggle = useCallback(async () => {
    const enabled = !preferences.enabled;
    persist({ ...preferences, enabled });
    if (!enabled) {
      musicRef.current?.pause();
      return;
    }
    try {
      await ensureAudio();
      if (contextRef.current) playRumbleCue(contextRef.current, "horn", preferences.sfxVolume);
    } catch {
      persist({ ...preferences, enabled: false });
    }
  }, [ensureAudio, persist, preferences]);

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(preferenceKey) ?? "null") as Partial<AudioPreferences> | null;
      if (saved) setPreferences({
        enabled: Boolean(saved.enabled),
        musicVolume: clampVolume(saved.musicVolume, defaults.musicVolume),
        sfxVolume: clampVolume(saved.sfxVolume, defaults.sfxVolume)
      });
    } catch {
      window.localStorage.removeItem(preferenceKey);
    }
  }, []);

  useEffect(() => {
    if (!preferences.enabled) return;
    const unlock = () => { void ensureAudio().catch(() => undefined); };
    document.addEventListener("pointerdown", unlock, { once: true });
    document.addEventListener("keydown", unlock, { once: true });
    void ensureAudio().catch(() => undefined);
    return () => {
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("keydown", unlock);
    };
  }, [ensureAudio, preferences.enabled]);

  useEffect(() => {
    if (musicRef.current) musicRef.current.volume = preferences.musicVolume;
  }, [preferences.musicVolume]);

  useEffect(() => {
    if (!preferences.enabled || !state || !contextRef.current) return;
    const event = state.recentEvents.at(-1);
    if (event && event.id !== lastEventId.current) {
      lastEventId.current = event.id;
      playRumbleCue(contextRef.current, cueFor(event), preferences.sfxVolume);
    }
    if (state.status === "completed" && lastCompletedMatch.current !== state.matchId) {
      lastCompletedMatch.current = state.matchId;
      window.setTimeout(() => {
        if (contextRef.current) playRumbleCue(contextRef.current, "victory", preferences.sfxVolume);
      }, 260);
    }
  }, [preferences.enabled, preferences.sfxVolume, state]);

  useEffect(() => () => {
    musicRef.current?.pause();
    void contextRef.current?.close();
  }, []);

  return {
    ...preferences,
    toggle,
    setMusicVolume(value: number) { persist({ ...preferences, musicVolume: clampVolume(value, defaults.musicVolume) }); },
    setSfxVolume(value: number) { persist({ ...preferences, sfxVolume: clampVolume(value, defaults.sfxVolume) }); }
  };
}

type Cue = "step" | "hit" | "miss" | "guard" | "dodge" | "grapple" | "ability" | "elimination" | "horn" | "victory";

function cueFor(event: RumbleCombatEvent): Cue {
  if (event.type === "move") return "step";
  if (event.type === "hit" || event.type === "hazard") return "hit";
  if (event.type === "miss") return "miss";
  if (event.type === "guard") return "guard";
  if (event.type === "dodge") return "dodge";
  if (event.type === "grapple") return "grapple";
  if (event.type === "ability") return "ability";
  if (event.type === "ring_out" || event.type === "knockout") return "elimination";
  return "hit";
}

function createMusic() {
  const audio = new Audio(musicUrl);
  audio.loop = true;
  audio.preload = "auto";
  return audio;
}

function playRumbleCue(context: AudioContext, cue: Cue, volume: number) {
  const now = context.currentTime;
  const master = context.createGain();
  master.gain.setValueAtTime(Math.max(0.0001, volume * 0.28), now);
  master.connect(context.destination);
  const tone = (frequency: number, duration: number, type: OscillatorType = "sine", endFrequency = frequency) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, endFrequency), now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.7, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain).connect(master);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
  };
  const noise = (duration: number, highpass: number) => {
    const buffer = context.createBuffer(1, Math.max(1, Math.floor(context.sampleRate * duration)), context.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < channel.length; index += 1) channel[index] = Math.random() * 2 - 1;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = buffer;
    filter.type = "highpass";
    filter.frequency.value = highpass;
    gain.gain.setValueAtTime(0.45, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(filter).connect(gain).connect(master);
    source.start(now);
  };

  if (cue === "step") { tone(95, 0.08, "triangle", 58); return; }
  if (cue === "hit") { noise(0.13, 90); tone(110, 0.16, "square", 54); return; }
  if (cue === "miss" || cue === "dodge") { noise(0.18, cue === "dodge" ? 900 : 600); tone(330, 0.12, "sine", 190); return; }
  if (cue === "guard") { tone(880, 0.32, "triangle", 430); tone(1320, 0.2, "sine", 780); return; }
  if (cue === "grapple") { noise(0.2, 70); tone(82, 0.28, "sawtooth", 42); return; }
  if (cue === "ability") { tone(180, 0.55, "sawtooth", 720); tone(360, 0.48, "sine", 960); noise(0.24, 350); return; }
  if (cue === "elimination") { tone(260, 0.65, "sawtooth", 48); noise(0.32, 70); return; }
  if (cue === "horn") { tone(196, 0.8, "sawtooth", 174); tone(294, 0.8, "triangle", 261); return; }
  tone(392, 0.45, "triangle", 523); window.setTimeout(() => tone(523, 0.62, "triangle", 784), 180);
}

function clampVolume(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
}
