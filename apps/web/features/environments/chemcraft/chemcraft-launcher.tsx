"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { arenaApi } from "@/lib/arena-api";
import { AgentPicker } from "@/components/agent-picker";

export function ChemCraftLauncher() {
  const router = useRouter();
  const [mode, setMode] = useState<"agent" | "human">("agent");
  const [agentId, setAgentId] = useState("chemcraft-researcher");
  const [toolBudget, setToolBudget] = useState(18);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string>();

  async function launch() {
    setStarting(true);
    setError(undefined);
    try {
      const response = await arenaApi.startRun({
        name:
          mode === "agent"
            ? "ChemCraft / deterministic RDKit researcher"
            : "ChemCraft / human molecular workbench",
        environmentId: "chemcraft-v1",
        agentId,
        participants:
          mode === "human"
            ? [
                {
                  id: "primary",
                  kind: "human",
                  displayName: "Human Chemist",
                  role: "researcher"
                }
              ]
            : undefined,
        evaluatorIds: ["chemcraft-scientific-score"],
        seed: 1701,
        scenario: {
          id: "balanced-lead-001",
          name: "Balanced Local-Anesthetic Lead Optimization",
          environmentId: "chemcraft-v1",
          parameters: {
            maxToolCalls: toolBudget,
            presentationDelayMs: mode === "agent" ? 460 : 0
          }
        },
        episodeLimits: {
          maxSteps: 20,
          maxDurationMs: 15 * 60_000,
          maxToolCalls: toolBudget,
          maxTokens: 100_000,
          maxCostUsd: 5
        }
      });
      router.push(`/runs/${response.runId}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      setStarting(false);
    }
  }

  return (
    <div className="chemcraft-launcher">
      <header><span>MOLECULAR COMMISSION</span><b>RDKIT / OFFLINE</b></header>
      <div className="chem-mode-switch">
        <button className={mode === "agent" ? "active" : ""} onClick={() => setMode("agent")}>
          <b>AUTO RESEARCH</b>
          <small>Observe the deterministic agent invoke genuine tools.</small>
        </button>
        <button className={mode === "human" ? "active" : ""} onClick={() => setMode("human")}>
          <b>HUMAN WORKBENCH</b>
          <small>Operate the same typed RDKit actions manually.</small>
        </button>
      </div>
      <section>
        <span>CHALLENGE PACK</span>
        <strong>Balanced Lead Optimization</strong>
        <p>1 lead · 8 sanitized analogues · hidden deterministic utility</p>
      </section>
      {mode === "agent" && (
        <AgentPicker value={agentId} onChange={setAgentId} label="CHEMISTRY AGENT" baselineIds={["chemcraft-researcher"]} />
      )}
      <label>
        <span>TOOL-CALL BUDGET</span>
        <input
          type="range"
          min="12"
          max="18"
          value={toolBudget}
          onChange={(event) => setToolBudget(Number(event.target.value))}
        />
        <b>{toolBudget} CALLS / 36 COMPUTE UNITS</b>
      </label>
      <div className="chem-integrity-list">
        <span><i /> RDKit 2025.03.5 executes locally</span>
        <span><i /> Runtime network access disabled</span>
        <span><i /> Ground truth isolated until evaluation</span>
        <span><i /> xTB and Open Babel fail honestly when absent</span>
      </div>
      {error && <p className="form-error">{error}</p>}
      <button className="chem-launch-button" onClick={launch} disabled={starting}>
        {starting ? "INITIALIZING RDKIT…" : mode === "agent" ? "START OBSERVABLE RUN" : "ENTER WORKBENCH"}
        <span>→</span>
      </button>
    </div>
  );
}
