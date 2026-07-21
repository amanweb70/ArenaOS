"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PersonaCraftState } from "@/lib/types";

const STORAGE_KEY = "arenaos.personacraft.voice.v1";

type PersonaSpeech = {
  key: string;
  speakerId?: string;
  text: string;
  voiceIndex: number;
  rate: number;
  pitch: number;
};

export function usePersonaSpeech(state?: PersonaCraftState) {
  const [enabled, setEnabled] = useState(true);
  const [supported, setSupported] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const [completedKey, setCompletedKey] = useState<string>();
  const voices = useRef<SpeechSynthesisVoice[]>([]);
  const generation = useRef(0);
  const speech = useMemo(() => selectPersonaSpeech(state), [state]);

  useEffect(() => {
    if (!("speechSynthesis" in window)) {
      setSupported(false);
      setEnabled(false);
      return;
    }
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored !== null) setEnabled(stored === "on");
    const loadVoices = () => {
      voices.current = window.speechSynthesis
        .getVoices()
        .filter((voice) => voice.lang.toLowerCase().startsWith("en"));
    };
    loadVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
      window.speechSynthesis.cancel();
    };
  }, []);

  useEffect(() => {
    const currentGeneration = ++generation.current;
    window.speechSynthesis.cancel();
    setSpeaking(false);

    if (!speech || !enabled || !supported) {
      setCompletedKey(speech?.key);
      return;
    }

    setCompletedKey(undefined);
    const utterance = new SpeechSynthesisUtterance(speech.text);
    const availableVoices = voices.current.length
      ? voices.current
      : window.speechSynthesis.getVoices();
    utterance.voice = availableVoices[speech.voiceIndex % Math.max(1, availableVoices.length)] ?? null;
    utterance.rate = speech.rate;
    utterance.pitch = speech.pitch;
    utterance.volume = 0.92;

    let finished = false;
    const finish = () => {
      if (finished || generation.current !== currentGeneration) return;
      finished = true;
      setSpeaking(false);
      setCompletedKey(speech.key);
    };
    utterance.onstart = () => {
      if (generation.current === currentGeneration) setSpeaking(true);
    };
    utterance.onend = finish;
    utterance.onerror = finish;

    // onend is authoritative. This guard only prevents a browser speech engine
    // that never fires callbacks from freezing the broadcast forever.
    const words = speech.text.trim().split(/\s+/).length;
    const watchdog = window.setTimeout(finish, Math.min(45_000, Math.max(10_000, words * 650 + 5_000)));
    window.speechSynthesis.speak(utterance);

    return () => {
      window.clearTimeout(watchdog);
      utterance.onstart = null;
      utterance.onend = null;
      utterance.onerror = null;
      window.speechSynthesis.cancel();
    };
  }, [enabled, speech, supported]);

  const toggle = useCallback(() => {
    setEnabled((current) => {
      const next = !current;
      window.localStorage.setItem(STORAGE_KEY, next ? "on" : "off");
      if (!next) {
        generation.current += 1;
        window.speechSynthesis.cancel();
        setSpeaking(false);
      }
      return next;
    });
  }, []);

  return {
    enabled,
    supported,
    speaking,
    toggle,
    hasSpeech: Boolean(speech),
    speechKey: speech?.key,
    speakerId: speech?.speakerId,
    turnComplete: !enabled || !supported || !speech || completedKey === speech.key
  };
}

export function selectPersonaSpeech(state?: PersonaCraftState): PersonaSpeech | undefined {
  if (!state) return undefined;
  if (state.status === "completed" && state.winner) {
    const winner = state.personas.find((persona) => persona.id === state.winner?.participantId);
    const finalSpeaker = state.transcript.at(-1)?.speakerId;
    const choice = state.scenario.decisionChoices.find((item) => item.id === state.world.decision);
    return {
      key: `${state.sessionId}:result`,
      speakerId: finalSpeaker ?? winner?.id,
      text: `The council has decided. ${winner?.displayName ?? "The leading delegate"} wins with ${Math.round(state.winner.finalScore)} points. The final decision is ${choice?.label ?? state.world.decision ?? "recorded"}.`,
      voiceIndex: winner?.seat ?? 0,
      rate: 1,
      pitch: 1
    };
  }

  const statement = state.transcript.at(-1);
  const recentActorEvent = state.recentEvents.find(
    (event) => event.actorId && !["phase", "world", "alliance_formed", "alliance_broken"].includes(event.type)
  );
  if (statement && (!recentActorEvent || recentActorEvent.actorId === statement.speakerId)) {
    const speaker = state.personas.find((persona) => persona.id === statement.speakerId);
    return {
      key: `${state.sessionId}:statement:${statement.id}`,
      speakerId: statement.speakerId,
      text: `${speaker?.displayName ?? "Council delegate"}. ${statement.message}`,
      voiceIndex: speaker?.seat ?? 0,
      rate: [1.04, 0.96, 1, 0.92][speaker?.seat ?? 0] ?? 1,
      pitch: [1.08, 0.82, 1.02, 0.9][speaker?.seat ?? 0] ?? 1
    };
  }
  if (recentActorEvent?.actorId) {
    const speaker = state.personas.find((persona) => persona.id === recentActorEvent.actorId);
    return {
      key: `${state.sessionId}:event:${recentActorEvent.id}`,
      speakerId: recentActorEvent.actorId,
      text: `${speaker?.displayName ?? "Council delegate"}. ${recentActorEvent.description}`,
      voiceIndex: speaker?.seat ?? 0,
      rate: 1,
      pitch: [1.08, 0.82, 1.02, 0.9][speaker?.seat ?? 0] ?? 1
    };
  }
  return undefined;
}
