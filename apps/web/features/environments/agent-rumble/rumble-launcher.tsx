"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AgentPicker } from "@/components/agent-picker";
import { arenaApi } from "@/lib/arena-api";

type MatchPreset = "royal_rumble" | "team_battle" | "duel";

const contestants = [
  { id: "ember", name: "EMBER KNIGHT", archetype: "balanced", agentId: "rumble-tactician", crest: "♜" },
  { id: "tide", name: "TIDE RANGER", archetype: "agile", agentId: "rumble-skirmisher", crest: "➹" },
  { id: "stone", name: "STONE WARDEN", archetype: "heavy", agentId: "rumble-guardian", crest: "◆" },
  { id: "thorn", name: "THORN RAIDER", archetype: "balanced", agentId: "rumble-vanguard", crest: "⚔" }
] as const;

const baselineIds = ["rumble-tactician", "rumble-vanguard", "rumble-guardian", "rumble-skirmisher"];

export function RumbleLauncher() {
  const router = useRouter();
  const [preset, setPreset] = useState<MatchPreset>("royal_rumble");
  const [agents, setAgents] = useState<Record<string, string>>(
    Object.fromEntries(contestants.map((fighter) => [fighter.id, fighter.agentId]))
  );
  const [rounds, setRounds] = useState(28);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string>();
  const roster = preset === "duel" ? contestants.slice(0, 2) : contestants;

  async function launch() {
    setStarting(true);
    setError(undefined);
    try {
      const response = await arenaApi.startRun({
        name: preset === "royal_rumble" ? "Crownfall Grand Melee" : preset === "team_battle" ? "Ember Alliance vs Tide Pact" : "Crownfall Champions Duel",
        environmentId: "agent-rumble-v1",
        agentId: agents[roster[0]!.id],
        participants: roster.map((fighter) => ({
          id: fighter.id,
          kind: "agent" as const,
          agentId: agents[fighter.id],
          displayName: fighter.name,
          role: fighter.archetype
        })),
        evaluatorIds: ["rumble-match-score"],
        seed: 404,
        scenario: {
          id: preset,
          name: preset.replaceAll("_", " ").toUpperCase(),
          environmentId: "agent-rumble-v1",
          parameters: {
            mode: preset,
            participantIds: roster.map((fighter) => fighter.id),
            maxRounds: rounds,
            displayNames: Object.fromEntries(roster.map((fighter) => [fighter.id, fighter.name])),
            archetypes: Object.fromEntries(roster.map((fighter) => [fighter.id, fighter.archetype]))
          }
        },
        episodeLimits: {
          maxSteps: rounds * roster.length + roster.length,
          maxDurationMs: 900_000,
          maxTokens: 180_000,
          maxCostUsd: 8
        }
      });
      router.push(`/runs/${response.runId}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      setStarting(false);
    }
  }

  return (
    <div className="rumble-launcher">
      <header>
        <span>WAR TABLE</span>
        <b><i /> CROWNFALL READY</b>
      </header>
      <div className="rumble-mode-grid">
        {([
          ["royal_rumble", "4 CHAMPIONS", "GRAND MELEE"],
          ["team_battle", "2 VS 2", "ALLIANCE WAR"],
          ["duel", "1 VS 1", "CHAMPIONS DUEL"]
        ] as Array<[MatchPreset, string, string]>).map(([id, kicker, label]) => (
          <button type="button" className={preset === id ? "active" : ""} onClick={() => setPreset(id)} key={id}>
            <small>{kicker}</small><b>{label}</b>
          </button>
        ))}
      </div>
      <div className="rumble-roster rumble-agent-roster">
        {roster.map((fighter, index) => (
          <article className={`rumble-roster-row ${fighter.id}`} key={fighter.id}>
            <div className="rumble-fighter-identity">
              <i>{fighter.crest}</i>
              <span><b>{fighter.name}</b><small>{fighter.archetype} · SLOT {index + 1}</small></span>
            </div>
            <AgentPicker
              value={agents[fighter.id] ?? fighter.agentId}
              onChange={(agentId) => setAgents((current) => ({ ...current, [fighter.id]: agentId }))}
              label="CONTROLLER"
              baselineIds={baselineIds}
            />
          </article>
        ))}
      </div>
      <label className="rumble-range">
        <span>ROUND LIMIT <b>{rounds}</b></span>
        <input type="range" min="8" max="48" step="4" value={rounds} onChange={(event) => setRounds(Number(event.target.value))} />
      </label>
      <div className="rumble-integrity">
        <span>✓ INDEPENDENT AGENTS</span><span>✓ TYPED ACTIONS</span><span>✓ SERVER AUTHORITY</span>
      </div>
      {error && <p className="form-error">{error}</p>}
      <button className="rumble-launch-button" onClick={launch} disabled={starting}>
        <span>{starting ? "SUMMONING CHAMPIONS…" : "SOUND THE BATTLE HORN"}</span><b>→</b>
      </button>
    </div>
  );
}
