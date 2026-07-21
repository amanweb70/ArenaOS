"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { arenaApi } from "@/lib/arena-api";

export function RunLauncher({ environmentId }: { environmentId: string }) {
  const router = useRouter();
  const agents = useQuery({ queryKey: ["agents"], queryFn: arenaApi.agents });
  const evaluators = useQuery({ queryKey: ["evaluators"], queryFn: arenaApi.evaluators });
  const [agentId, setAgentId] = useState("scripted-agent");
  const [maxSteps, setMaxSteps] = useState(30);
  const [seed, setSeed] = useState(7);
  const [selectedEvaluators, setSelectedEvaluators] = useState<string[]>([
    "success",
    "step-efficiency",
    "invalid-actions",
    "collisions"
  ]);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string>();

  const ready = useMemo(
    () => Boolean(agents.data?.length && evaluators.data?.length && selectedEvaluators.length),
    [agents.data?.length, evaluators.data?.length, selectedEvaluators.length]
  );

  function toggleEvaluator(id: string) {
    setSelectedEvaluators((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  }

  async function launch() {
    setStarting(true);
    setError(undefined);
    try {
      const response = await arenaApi.startRun({
        name: `${environmentId} web run`,
        environmentId,
        agentId,
        evaluatorIds: selectedEvaluators,
        seed,
        episodeLimits: {
          maxSteps,
          maxDurationMs: 15 * 60_000,
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
    <div className="launcher">
      <header>
        <span>RUN CONFIGURATION</span>
        <b>POST /api/runs</b>
      </header>
      <label>
        Agent
        <select value={agentId} onChange={(event) => setAgentId(event.target.value)}>
          {agents.data?.map((agent) => (
            <option value={agent.id} key={agent.id}>{agent.name}</option>
          ))}
        </select>
      </label>
      <div className="launcher-grid">
        <label>
          Step limit
          <input
            type="number"
            min="1"
            max="500"
            value={maxSteps}
            onChange={(event) => setMaxSteps(Number(event.target.value))}
          />
        </label>
        <label>
          Seed
          <input
            type="number"
            value={seed}
            onChange={(event) => setSeed(Number(event.target.value))}
          />
        </label>
      </div>
      <fieldset>
        <legend>Evaluators</legend>
        <div className="evaluator-options">
          {evaluators.data?.map((evaluator) => (
            <label key={evaluator.id}>
              <input
                type="checkbox"
                checked={selectedEvaluators.includes(evaluator.id)}
                onChange={() => toggleEvaluator(evaluator.id)}
              />
              <span>{evaluator.name}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {error && <p className="form-error">{error}</p>}
      <button className="launch-button" onClick={launch} disabled={!ready || starting}>
        {starting ? "INITIALIZING…" : "LAUNCH RUN"} <span>→</span>
      </button>
      <small>Creates a real persisted run, then opens its live workspace.</small>
    </div>
  );
}
