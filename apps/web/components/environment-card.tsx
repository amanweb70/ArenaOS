import Link from "next/link";
import type { EnvironmentSummary } from "@/lib/types";
import { environmentPresentation } from "@/lib/environment-presentation";
import { ReferenceGridPreview } from "./grid-renderer";
import { RoyalChessPreview } from "@/features/environments/royal-chess/royal-chess-preview";
import { BioCraftPreview } from "@/features/environments/biocraft/biocraft-preview";
import { ChemCraftPreview } from "@/features/environments/chemcraft/chemcraft-preview";
import { RumblePreview } from "@/features/environments/agent-rumble/rumble-preview";
import { PersonaCraftPreview } from "@/features/environments/personacraft/personacraft-preview";
import { PhysicalAIPreview } from "@/features/environments/physical-ai/physical-ai-preview";

export function EnvironmentCard({ environment }: { environment: EnvironmentSummary }) {
  const presentation = environmentPresentation(environment.id);
  return (
    <Link
      href={`/environments/${environment.id}`}
      className="environment-card"
      style={{ "--environment-accent": presentation.accent } as React.CSSProperties}
    >
      <div className="environment-visual">
        {environment.id === "headless-grid" ? (
          <ReferenceGridPreview />
        ) : environment.id === "royal-chess-v1" ? (
          <RoyalChessPreview />
        ) : environment.id === "biocraft-v1" ? (
          <BioCraftPreview />
        ) : environment.id === "chemcraft-v1" ? (
          <ChemCraftPreview />
        ) : environment.id === "agent-rumble-v1" ? (
          <RumblePreview />
        ) : environment.id === "personacraft-v1" ? (
          <PersonaCraftPreview />
        ) : environment.id === "physical-ai-mission-lab-v1" ? (
          <PhysicalAIPreview />
        ) : (
          <pre>{JSON.stringify(environment.capabilities, null, 2)}</pre>
        )}
        <span>{presentation.eyebrow}</span>
      </div>
      <div className="environment-copy">
        <div>
          <small>{environment.runtime}</small>
          <h3>{environment.name}</h3>
        </div>
        <p>{environment.description ?? presentation.summary}</p>
        <div className="tag-row">
          {(environment.tags ?? []).slice(0, 3).map((tag) => <span key={tag}>{tag}</span>)}
        </div>
        <b>Inspect environment ↗</b>
      </div>
    </Link>
  );
}
