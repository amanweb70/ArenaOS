"use client";

import { useQuery } from "@tanstack/react-query";
import { arenaApi } from "@/lib/arena-api";
import { EnvironmentCard } from "@/components/environment-card";
import { LoadingBlock, QueryError } from "@/components/query-state";
import { SectionHeading } from "@/components/section-heading";

export default function EnvironmentsPage() {
  const query = useQuery({ queryKey: ["environments"], queryFn: arenaApi.environments });
  const showcaseCount =
    query.data?.filter((environment) => environment.id !== "headless-grid").length ?? 0;
  const showcaseOrder = [
    "royal-chess-v1",
    "biocraft-v1",
    "chemcraft-v1",
    "agent-rumble-v1",
    "personacraft-v1",
    "physical-ai-mission-lab-v1",
    "headless-grid"
  ];
  const environments = [...(query.data ?? [])].sort(
    (left, right) =>
      showcaseOrder.indexOf(left.id) - showcaseOrder.indexOf(right.id)
  );
  return (
    <div className="shell page">
      <SectionHeading eyebrow="WORLD REGISTRY" title="Select an environment.">
        <p>
          Registered plugins appear here automatically. Royal Chess is World 01,
          BioCraft is World 02, ChemCraft is World 03, Agent Rumble is World 04,
          PersonaCraft is World 05, and Physical AI Mission Lab completes the
          six-world showcase as World 06.
        </p>
      </SectionHeading>
      <div className="roster-status">
        <span>SHOWCASE ROSTER</span>
        <strong>{showcaseCount} / 6</strong>
        <p>{showcaseCount} showcase environments are connected to the platform.</p>
      </div>
      {query.isLoading && <LoadingBlock label="Reading environment registry" />}
      {query.isError && <QueryError error={query.error} retry={() => query.refetch()} />}
      <div className="environment-list">
        {environments.map((environment) => (
          <EnvironmentCard environment={environment} key={environment.id} />
        ))}
      </div>
      <div className="future-worlds" aria-label="Future showcase environment area">
        <span>REMAINING SHOWCASE WORLDS / RESERVED</span>
        {Array.from({ length: Math.max(0, 6 - showcaseCount) }, (_, index) => (
          <i key={index} aria-hidden="true">0{showcaseCount + index + 1}</i>
        ))}
      </div>
    </div>
  );
}
