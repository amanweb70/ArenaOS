"use client";

import { useQuery } from "@tanstack/react-query";
import { OPENROUTER_MODEL_CATALOG } from "@arena/contracts";
import { arenaApi } from "@/lib/arena-api";

const catalogOrder = new Map<string, number>(
  OPENROUTER_MODEL_CATALOG.map((model, index) => [model.id, index])
);
const catalogById = new Map<string, (typeof OPENROUTER_MODEL_CATALOG)[number]>(
  OPENROUTER_MODEL_CATALOG.map((model) => [model.id, model])
);

export function AgentPicker({
  value,
  onChange,
  label = "AI CONTROLLER",
  baselineIds
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  baselineIds?: string[];
}) {
  const agents = useQuery({ queryKey: ["agents"], queryFn: arenaApi.agents });
  const live = (agents.data ?? [])
    .filter((agent) => agent.provider === "openrouter")
    .sort(
      (left, right) =>
        (catalogOrder.get(left.model ?? "") ?? Number.MAX_SAFE_INTEGER) -
        (catalogOrder.get(right.model ?? "") ?? Number.MAX_SAFE_INTEGER)
    );
  const baselines = (agents.data ?? []).filter(
    (agent) =>
      agent.provider !== "openrouter" &&
      (!baselineIds || baselineIds.includes(agent.id))
  );
  const selected = agents.data?.find((agent) => agent.id === value);
  const selectedModel = selected?.model
    ? catalogById.get(selected.model)
    : undefined;

  return (
    <label className="arena-agent-picker">
      <span>
        {label}
        <i className={selected?.provider === "openrouter" ? "live" : ""}>
          {selected?.provider === "openrouter" ? "LIVE API" : "LOCAL BASELINE"}
        </i>
      </span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {live.length > 0 && (
          <optgroup label="OPENROUTER · LIVE MODELS">
            {live.map((agent) => (
              <option value={agent.id} key={agent.id}>
                {(() => {
                  const catalogEntry = catalogById.get(agent.model ?? "");
                  return catalogEntry && "automatic" in catalogEntry && catalogEntry.automatic
                    ? "AUTO · "
                    : "";
                })()}
                {agent.name}
              </option>
            ))}
          </optgroup>
        )}
        <optgroup label="ARENAOS · LOCAL BASELINES">
          {baselines.map((agent) => (
            <option value={agent.id} key={agent.id}>
              {agent.name}
            </option>
          ))}
        </optgroup>
      </select>
      {selected?.provider === "openrouter" && (
        <small>
          {selectedModel?.provider ?? "OpenRouter"} · {selected.model} · billed API call
        </small>
      )}
      {live.length === 0 && (
        <small>
          Add OPENROUTER_API_KEY to .env.local to enable the curated live model roster.
        </small>
      )}
    </label>
  );
}
