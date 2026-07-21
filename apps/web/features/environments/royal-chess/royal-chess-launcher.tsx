"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { arenaApi } from "@/lib/arena-api";

const presets = {
  spectacle: { label: "Royal Spectacle", maxPlies: 80, pause: 550 },
  blitz: { label: "Blitz Demo", maxPlies: 60, pause: 220 },
  instant: { label: "Instant Replay", maxPlies: 120, pause: 0 },
  tactical: {
    label: "Tactical Challenge",
    maxPlies: 24,
    pause: 500,
    fen: "r1bq1rk1/ppp2ppp/2np1n2/8/2B1P3/2N2N2/PPPP1PPP/R1BQ1RK1 w - - 2 8"
  }
} as const;

type PresetId = keyof typeof presets;
type MatchMode = "agent-agent" | "human-agent";
type HumanSide = "white" | "black";

export function RoyalChessLauncher() {
  const router = useRouter();
  const agents = useQuery({ queryKey: ["agents"], queryFn: arenaApi.agents });
  const chessAgents = useMemo(
    () =>
      (agents.data ?? []).filter(
        (agent) =>
          agent.tags?.includes("chess") || agent.provider === "openrouter"
      ),
    [agents.data]
  );
  const [whiteAgentId, setWhiteAgentId] = useState("royal-greedy");
  const [blackAgentId, setBlackAgentId] = useState("royal-positional");
  const [mode, setMode] = useState<MatchMode>("agent-agent");
  const [humanSide, setHumanSide] = useState<HumanSide>("white");
  const [presetId, setPresetId] = useState<PresetId>("spectacle");
  const [sound, setSound] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string>();
  const whiteIsHuman = mode === "human-agent" && humanSide === "white";
  const blackIsHuman = mode === "human-agent" && humanSide === "black";

  async function launch() {
    const preset = presets[presetId];
    const whiteName = whiteIsHuman
      ? "Human Challenger"
      : chessAgents.find((agent) => agent.id === whiteAgentId)?.name ?? whiteAgentId;
    const blackName = blackIsHuman
      ? "Human Challenger"
      : chessAgents.find((agent) => agent.id === blackAgentId)?.name ?? blackAgentId;
    setStarting(true);
    setError(undefined);
    try {
      window.localStorage.setItem(
        "arena:royal-preferences",
        JSON.stringify({
          sound,
          reducedMotion,
          camera: mode === "human-agent" ? humanSide : "broadcast"
        })
      );
      const response = await arenaApi.startRun({
        name: `${preset.label}: ${whiteName} vs ${blackName}`,
        environmentId: "royal-chess-v1",
        agentId: whiteIsHuman ? blackAgentId : whiteAgentId,
        participants: [
          {
            id: "white",
            kind: whiteIsHuman ? "human" : "agent",
            agentId: whiteIsHuman ? undefined : whiteAgentId,
            displayName: whiteName,
            role: "white",
            metadata: { crown: "ivory" }
          },
          {
            id: "black",
            kind: blackIsHuman ? "human" : "agent",
            agentId: blackIsHuman ? undefined : blackAgentId,
            displayName: blackName,
            role: "black",
            metadata: { crown: "obsidian" }
          }
        ],
        evaluatorIds: ["chess-result", "chess-legal-actions"],
        scenario: {
          id: presetId,
          name: preset.label,
          environmentId: "royal-chess-v1",
          initialState: undefined,
          parameters: {
            whiteParticipantId: "white",
            blackParticipantId: "black",
            maxPlies: preset.maxPlies,
            pauseBetweenMovesMs: preset.pause,
            initialFen: "fen" in preset ? preset.fen : undefined
          }
        },
        episodeLimits: {
          maxSteps: preset.maxPlies,
          maxDurationMs: Math.max(900_000, preset.maxPlies * (preset.pause + 45_000)),
          maxTokens: 160_000,
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
    <div className="royal-launcher">
      <header>
        <span>MATCH COMMISSION</span>
        <b>{mode.replaceAll("-", " VS ").toUpperCase()}</b>
      </header>
      <div className="match-mode-switch" role="group" aria-label="Match mode">
        {([
          ["agent-agent", "AGENT VS AGENT"],
          ["human-agent", "HUMAN VS AI"]
        ] as Array<[MatchMode, string]>).map(([value, label]) => (
          <button
            type="button"
            className={mode === value ? "active" : ""}
            onClick={() => setMode(value)}
            key={value}
          >
            {label}
          </button>
        ))}
      </div>
      {mode === "human-agent" && (
        <div className="human-side-switch" role="group" aria-label="Choose your side">
          <span>PLAY AS</span>
          <button
            type="button"
            className={humanSide === "white" ? "active" : ""}
            onClick={() => setHumanSide("white")}
          >
            ♔ IVORY / FIRST
          </button>
          <button
            type="button"
            className={humanSide === "black" ? "active" : ""}
            onClick={() => setHumanSide("black")}
          >
            ♚ OBSIDIAN / SECOND
          </button>
        </div>
      )}
      <div className="crown-select ivory">
        <div><i>♔</i><span>IVORY CROWN</span></div>
        {!whiteIsHuman ? <label>
          White agent
          <select value={whiteAgentId} onChange={(event) => setWhiteAgentId(event.target.value)}>
            {chessAgents.map((agent) => (
              <option value={agent.id} key={agent.id}>{agent.name}</option>
            ))}
          </select>
        </label> : <strong>Human Challenger</strong>}
      </div>
      <div className="versus-seal"><span>VS</span></div>
      <div className="crown-select obsidian">
        <div><i>♚</i><span>OBSIDIAN CROWN</span></div>
        {!blackIsHuman ? <label>
          Black agent
          <select value={blackAgentId} onChange={(event) => setBlackAgentId(event.target.value)}>
            {chessAgents.map((agent) => (
              <option value={agent.id} key={agent.id}>{agent.name}</option>
            ))}
          </select>
        </label> : <strong>Human Challenger</strong>}
      </div>
      <fieldset>
        <legend>MATCH PRESET</legend>
        <div className="preset-grid">
          {(Object.entries(presets) as Array<[PresetId, (typeof presets)[PresetId]]>).map(
            ([id, preset]) => (
              <button
                type="button"
                className={presetId === id ? "active" : ""}
                onClick={() => setPresetId(id)}
                key={id}
              >
                <b>{preset.label}</b>
                <small>{preset.maxPlies} ply cap · {preset.pause}ms pace</small>
              </button>
            )
          )}
        </div>
      </fieldset>
      <div className="royal-toggles">
        <label>
          <input type="checkbox" checked={sound} onChange={(event) => setSound(event.target.checked)} />
          <span>Royal sound</span>
        </label>
        <label>
          <input type="checkbox" checked={reducedMotion} onChange={(event) => setReducedMotion(event.target.checked)} />
          <span>Reduced motion</span>
        </label>
      </div>
      {error && <p className="form-error">{error}</p>}
      <button
        className="royal-launch-button"
        onClick={launch}
        disabled={starting || (mode === "agent-agent" ? chessAgents.length < 2 : chessAgents.length < 1)}
      >
        <span>{starting ? "OPENING THE ARENA…" : "BEGIN ROYAL MATCH"}</span>
        <b>♜</b>
      </button>
      <small>
        Every move travels through ArenaOS validation, events, evaluators, persistence,
        and deterministic replay.
      </small>
    </div>
  );
}
