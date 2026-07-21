"use client";

import type { RumbleState } from "@/lib/types";
import { RumbleArena } from "./rumble-arena";

export function RumblePreview() {
  return (
    <div className="rumble-preview">
      <RumbleArena state={previewState} compact reducedMotion />
      <div className="rumble-preview-badge"><b>4</b><span>FIGHTERS</span></div>
      <strong>THE NEON COLISEUM</strong>
    </div>
  );
}

export const previewState: RumbleState = {
  matchId: "preview",
  mode: "royal_rumble",
  timingMode: "lockstep",
  status: "ready",
  seed: 404,
  round: 1,
  maxRounds: 28,
  elapsedMs: 0,
  decisionIntervalMs: 650,
  arena: {
    id: "crownfall-coliseum",
    name: "Crownfall Coliseum",
    radius: 10,
    center: { x: 0, z: 0 },
    hazardPulseEveryRounds: 6,
    currentPulse: 0
  },
  fighters: [
    fighter("ember", "EMBER KNIGHT", "#ef6a45", -3.2, -2.9, "balanced"),
    fighter("tide", "TIDE RANGER", "#43a5ba", 3.2, -2.9, "agile"),
    fighter("stone", "STONE WARDEN", "#d2a64a", 3.2, 2.9, "heavy"),
    fighter("thorn", "THORN RAIDER", "#6fa85a", -3.2, 2.9, "balanced")
  ],
  activeParticipantId: "ember",
  recentEvents: [],
  eventHistory: [],
  teamScores: {},
  eliminationOrder: []
};

function fighter(
  id: string,
  displayName: string,
  color: string,
  x: number,
  z: number,
  archetype: "balanced" | "heavy" | "agile"
) {
  return {
    id,
    displayName,
    color,
    archetype,
    position: { x, y: 0, z },
    facing: { x: -Math.sign(x), z: -Math.sign(z) },
    health: archetype === "heavy" ? 125 : archetype === "agile" ? 90 : 105,
    maxHealth: archetype === "heavy" ? 125 : archetype === "agile" ? 90 : 105,
    stamina: 100,
    abilityCharge: 35,
    knockback: 0,
    state: "idle" as const,
    statusEffects: [],
    stats: {
      damageDealt: 0,
      damageTaken: 0,
      hitsLanded: 0,
      attacksAttempted: 0,
      guards: 0,
      dodges: 0,
      grapples: 0,
      ringOuts: 0,
      distanceMoved: 0
    }
  };
}
