"use client";

import { use, type CSSProperties } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { arenaApi } from "@/lib/arena-api";
import { environmentPresentation } from "@/lib/environment-presentation";
import { ReferenceGridPreview } from "@/components/grid-renderer";
import { LoadingBlock, QueryError } from "@/components/query-state";
import { RunLauncher } from "@/components/run-launcher";
import { RoyalChessEnvironmentPage } from "@/features/environments/royal-chess/royal-chess-environment-page";
import { BioCraftEnvironmentPage } from "@/features/environments/biocraft/biocraft-environment-page";
import { ChemCraftEnvironmentPage } from "@/features/environments/chemcraft/chemcraft-environment-page";
import { RumbleEnvironmentPage } from "@/features/environments/agent-rumble/rumble-environment-page";
import { PersonaCraftEnvironmentPage } from "@/features/environments/personacraft/personacraft-environment-page";
import { PhysicalAIEnvironmentPage } from "@/features/environments/physical-ai/physical-ai-environment-page";

export default function EnvironmentDetailPage({
  params
}: {
  params: Promise<{ environmentId: string }>;
}) {
  const { environmentId } = use(params);
  const query = useQuery({ queryKey: ["environments"], queryFn: arenaApi.environments });
  const environment = query.data?.find((item) => item.id === environmentId);
  const presentation = environmentPresentation(environmentId);

  if (query.isLoading) return <div className="shell page"><LoadingBlock /></div>;
  if (query.isError) {
    return <div className="shell page"><QueryError error={query.error} retry={() => query.refetch()} /></div>;
  }
  if (!environment) {
    return (
      <div className="shell page system-message">
        <span>404 / REGISTRY MISS</span>
        <h1>Environment not registered.</h1>
        <Link href="/environments">Return to registry</Link>
      </div>
    );
  }

  if (environment.id === "royal-chess-v1") {
    return <RoyalChessEnvironmentPage environment={environment} />;
  }
  if (environment.id === "biocraft-v1") {
    return <BioCraftEnvironmentPage environment={environment} />;
  }
  if (environment.id === "chemcraft-v1") {
    return <ChemCraftEnvironmentPage environment={environment} />;
  }
  if (environment.id === "agent-rumble-v1") {
    return <RumbleEnvironmentPage environment={environment} />;
  }
  if (environment.id === "personacraft-v1") {
    return <PersonaCraftEnvironmentPage />;
  }
  if (environment.id === "physical-ai-mission-lab-v1") {
    return <PhysicalAIEnvironmentPage />;
  }

  return (
    <div
      className="environment-detail"
      style={{ "--environment-accent": presentation.accent } as CSSProperties}
    >
      <section className="shell environment-hero">
        <div className="environment-title">
          <Link href="/environments">← ALL ENVIRONMENTS</Link>
          <span>{presentation.eyebrow}</span>
          <h1>{environment.name}</h1>
          <p>{environment.description ?? presentation.summary}</p>
          <div className="tag-row">
            {(environment.tags ?? []).map((tag) => <span key={tag}>{tag}</span>)}
          </div>
        </div>
        <div className="arcade-frame">
          <header><span>{environment.id}</span><b>READY</b></header>
          <div className="arcade-screen">
            {environment.id === "headless-grid" ? (
              <ReferenceGridPreview />
            ) : (
              <pre>{JSON.stringify(environment.capabilities, null, 2)}</pre>
            )}
          </div>
          <footer>
            <i /><i /><i />
            <span>ARENAOS RUNTIME</span>
          </footer>
        </div>
      </section>

      <section className="shell environment-body">
        <div>
          <div className="detail-block">
            <span>01 / WHY THIS WORLD</span>
            <h2>A clean proof of the entire ArenaOS loop.</h2>
            <p>
              Headless Grid is intentionally small. Its job is to make every platform
              behavior visible: reset, observation, typed action, validation, state
              transition, event emission, evaluation, persistence, and replay.
            </p>
          </div>
          <div className="capability-grid">
            {Object.entries(environment.capabilities).map(([key, value]) => (
              <div key={key}><span>{key}</span><b>{String(value)}</b></div>
            ))}
          </div>
          <div className="detail-block">
            <span>02 / JUDGE EXPERIENCE</span>
            <h2>Launch it, watch it, inspect it, replay it.</h2>
            <p>
              The scripted baseline finds a valid path while ArenaOS records the evidence
              needed to explain the result. Nothing on this page executes the world; it
              only asks the control API to do so.
            </p>
          </div>
        </div>
        <aside><RunLauncher environmentId={environment.id} /></aside>
      </section>
    </div>
  );
}
