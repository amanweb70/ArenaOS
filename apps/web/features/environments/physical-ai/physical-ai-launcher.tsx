"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { arenaApi } from "@/lib/arena-api";
import { AgentPicker } from "@/components/agent-picker";

type MissionPreset = "single_supervisor" | "two_agent_cooperation" | "human_agent_team";

export function PhysicalAILauncher() {
  const router = useRouter();
  const [preset, setPreset] = useState<MissionPreset>("single_supervisor");
  const [agents, setAgents] = useState({
    supervisor: "mission-coordinator",
    alpha: "mission-coordinator",
    beta: "mission-coordinator"
  });
  const [timeLimit, setTimeLimit] = useState(360);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string>();
  const solo = preset === "single_supervisor";
  const human = preset === "human_agent_team";

  async function launch() {
    const participantIds = solo ? ["supervisor"] : ["alpha", "beta"];
    const primaryAgentId = solo ? agents.supervisor : human ? agents.beta : agents.alpha;
    setStarting(true);
    setError(undefined);
    try {
      const response = await arenaApi.startRun({
        name: `Physical AI — ${preset.replaceAll("_", " ")}`,
        environmentId: "physical-ai-mission-lab-v1",
        agentId: primaryAgentId,
        participants: solo
          ? [{ id: "supervisor", kind: "agent", agentId: agents.supervisor, displayName: "MISSION COORDINATOR", role: "supervisor" }]
          : [
              { id: "alpha", kind: human ? "human" : "agent", agentId: human ? undefined : agents.alpha, displayName: human ? "HUMAN OPERATOR" : "ALPHA COORDINATOR", role: "mobile-01" },
              { id: "beta", kind: "agent", agentId: agents.beta, displayName: "BETA COORDINATOR", role: "mobile-02" }
            ],
        evaluatorIds: ["physical-ai-mission-score"],
        seed: 606,
        scenario: {
          id: "warehouse-rescue-relay-v1",
          name: "Warehouse Rescue Relay",
          environmentId: "physical-ai-mission-lab-v1",
          parameters: { mode: preset, participantIds, timeLimitSeconds: timeLimit }
        },
        episodeLimits: {
          maxSteps: human ? 40 : 28,
          maxDurationMs: 900_000,
          maxTokens: 100_000,
          maxCostUsd: 5
        }
      });
      router.push(human ? `/runs/${response.runId}` : `/runs/${response.runId}?broadcast=1`, { scroll: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      setStarting(false);
    }
  }

  return (
    <div className="physical-launcher">
      <header><span>MISSION CONFIGURATION</span><b><i /> CONTROL PLANE READY</b></header>
      <div className="physical-mode-grid">
        {([
          ["single_supervisor", "01", "SINGLE SUPERVISOR", "One coordinator controls the robot fleet."],
          ["two_agent_cooperation", "02", "TWO-AGENT TEAM", "Independent agents coordinate two mobile robots."],
          ["human_agent_team", "03", "HUMAN + AGENT", "You command ATLAS-01 beside an AI teammate."]
        ] as Array<[MissionPreset, string, string, string]>).map(([id, number, label, copy]) => (
          <button key={id} className={preset === id ? "active" : ""} onClick={() => setPreset(id)}>
            <i>{number}</i><span><b>{label}</b><small>{copy}</small></span>
          </button>
        ))}
      </div>
      {preset === "single_supervisor" ? (
        <AgentPicker
          value={agents.supervisor}
          onChange={(agentId) => setAgents((current) => ({ ...current, supervisor: agentId }))}
          label="MISSION INTELLIGENCE"
          baselineIds={["mission-coordinator"]}
        />
      ) : (
        <div className="physical-agent-roster">
          {!human && (
            <AgentPicker
              value={agents.alpha}
              onChange={(agentId) => setAgents((current) => ({ ...current, alpha: agentId }))}
              label="ATLAS-01 CONTROLLER"
              baselineIds={["mission-coordinator"]}
            />
          )}
          <AgentPicker
            value={agents.beta}
            onChange={(agentId) => setAgents((current) => ({ ...current, beta: agentId }))}
            label="ATLAS-02 CONTROLLER"
            baselineIds={["mission-coordinator"]}
          />
        </div>
      )}
      <label className="physical-time-control">
        <span>MISSION CLOCK <b>{Math.floor(timeLimit / 60)}:{String(timeLimit % 60).padStart(2, "0")}</b></span>
        <input type="range" min="180" max="480" step="60" value={timeLimit} onChange={(event) => setTimeLimit(Number(event.target.value))} />
      </label>
      <section className="physical-runtime-disclosure">
        <span>LOCAL BACKEND</span>
        <strong>SEEDED REFERENCE MISSION TWIN</strong>
        <p>Isaac Sim is capability-gated. This machine will not claim PhysX or WebRTC unless the external bridge explicitly reports them available.</p>
      </section>
      <div className="physical-integrity"><span>✓ SAFETY VALIDATION</span><span>✓ STATE SNAPSHOTS</span><span>✓ EVENT REPLAY</span></div>
      {error && <p className="form-error">{error}</p>}
      <button className="physical-launch-button" onClick={launch} disabled={starting}>
        <span>{starting ? "INITIALIZING MISSION…" : "START WAREHOUSE RESCUE"}</span><b>→</b>
      </button>
    </div>
  );
}
