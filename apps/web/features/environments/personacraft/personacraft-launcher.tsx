"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { arenaApi } from "@/lib/arena-api";
import { AgentPicker } from "@/components/agent-picker";

type PersonaMode = "debate" | "negotiation" | "crisis" | "trial" | "social_deduction";

const modes: Array<[PersonaMode, string, string]> = [
  ["debate", "AI ACCORD 2040", "Public policy debate"],
  ["negotiation", "WINTER GRAIN", "Resource negotiation"],
  ["crisis", "HELIOS CRISIS", "Emergency council"],
  ["trial", "ORACLE TRIAL", "Evidence and verdict"],
  ["social_deduction", "PHANTOM PROTOCOL", "Hidden-role deduction"]
];

const roster = [
  ["pink", "ADA LOVELACE", "analytical", "council-visionary"],
  ["cyan", "SUN TZU", "strategic", "council-strategist"],
  ["gold", "CLEOPATRA", "diplomatic", "council-diplomat"],
  ["violet", "ALAN TURING", "precise", "council-skeptic"]
] as const;

const baselineIds = ["council-strategist", "council-visionary", "council-diplomat", "council-skeptic"];

export function PersonaCraftLauncher() {
  const router = useRouter();
  const [mode, setMode] = useState<PersonaMode>("debate");
  const [agents, setAgents] = useState<Record<string, string>>(
    Object.fromEntries(roster.map(([id, , , agentId]) => [id, agentId]))
  );
  const [humanSeat, setHumanSeat] = useState(false);
  const [rounds, setRounds] = useState(2);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string>();

  async function launch() {
    const selected = modes.find(([id]) => id === mode)!;
    setStarting(true);
    setError(undefined);
    try {
      const response = await arenaApi.startRun({
        name: `PersonaCraft — ${selected[1]}`,
        environmentId: "personacraft-v1",
        agentId: agents.pink,
        participants: roster.map(([id, name, role, defaultAgentId], index) => ({
          id,
          kind: humanSeat && index === 0 ? "human" : "agent",
          agentId: humanSeat && index === 0 ? undefined : (agents[id] ?? defaultAgentId),
          displayName: humanSeat && index === 0 ? "HUMAN DELEGATE" : name,
          role
        })),
        evaluatorIds: ["personacraft-council-score"],
        seed: 505,
        scenario: {
          id: mode,
          name: selected[1],
          environmentId: "personacraft-v1",
          parameters: {
            mode,
            maxRounds: rounds,
            participantIds: roster.map(([id]) => id),
            displayNames: Object.fromEntries(
              roster.map(([id, name], index) => [
                id,
                humanSeat && index === 0 ? "HUMAN DELEGATE" : name
              ])
            )
          }
        },
        episodeLimits: {
          maxSteps: rounds * roster.length * 4 + 4,
          maxDurationMs: 900_000,
          maxTokens: 160_000,
          maxCostUsd: 8
        }
      });
      router.push(`/runs/${response.runId}?broadcast=1`, { scroll: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      setStarting(false);
    }
  }

  return (
    <div className="persona-launcher">
      <header><span>COUNCIL CONFIGURATION</span><b><i /> CHAMBER READY</b></header>
      <div className="persona-mode-grid">
        {modes.map(([id, label, description], index) => (
          <button key={id} className={mode === id ? "active" : ""} onClick={() => setMode(id)}>
            <i>0{index + 1}</i><span><b>{label}</b><small>{description}</small></span>
          </button>
        ))}
      </div>
      <section className="persona-seat-control">
        <div><span>SEAT 01</span><strong>{humanSeat ? "HUMAN DELEGATE" : "ADA LOVELACE"}</strong></div>
        <button onClick={() => setHumanSeat((value) => !value)}>{humanSeat ? "USE AI PERSONA" : "TAKE THIS SEAT"}</button>
      </section>
      <div className="persona-agent-roster">
        {roster.map(([id, name, role, defaultAgentId], index) => (
          <article key={id}>
            <div><i>0{index + 1}</i><span><b>{humanSeat && index === 0 ? "HUMAN DELEGATE" : name}</b><small>{role} perspective</small></span></div>
            {humanSeat && index === 0 ? <strong>HUMAN CONTROL</strong> : (
              <AgentPicker
                value={agents[id] ?? defaultAgentId}
                onChange={(agentId) => setAgents((current) => ({ ...current, [id]: agentId }))}
                label="DEBATE ENGINE"
                baselineIds={baselineIds}
              />
            )}
          </article>
        ))}
      </div>
      <label className="persona-round-control">
        <span>COUNCIL ROUNDS <b>{rounds}</b></span>
        <input type="range" min="1" max="4" value={rounds} onChange={(event) => setRounds(Number(event.target.value))} />
      </label>
      <div className="persona-integrity">
        <span>✓ STRUCTURED ACTIONS</span><span>✓ PRIVATE OBJECTIVES</span><span>✓ DETERMINISTIC REPLAY</span>
      </div>
      {error && <p className="form-error">{error}</p>}
      <button className="persona-launch-button" onClick={launch} disabled={starting}>
        <span>{starting ? "CONVENING THE COUNCIL…" : "CONVENE THE COUNCIL"}</span><b>→</b>
      </button>
    </div>
  );
}
