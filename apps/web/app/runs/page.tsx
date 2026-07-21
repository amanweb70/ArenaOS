"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { arenaApi } from "@/lib/arena-api";
import { LoadingBlock, QueryError, EmptyState } from "@/components/query-state";
import { RunsTable } from "@/components/runs-table";
import { SectionHeading } from "@/components/section-heading";

export default function RunsPage() {
  const query = useQuery({ queryKey: ["runs"], queryFn: arenaApi.runs, refetchInterval: 3_000 });
  const runs = [...(query.data ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <div className="shell page">
      <SectionHeading
        eyebrow="PERSISTED EVIDENCE"
        title="Run history."
        action={<Link href="/environments" className="button primary compact-button">New run →</Link>}
      >
        <p>Every row is sourced from the ArenaOS run repository.</p>
      </SectionHeading>
      {query.isLoading && <LoadingBlock label="Loading persisted runs" />}
      {query.isError && <QueryError error={query.error} retry={() => query.refetch()} />}
      {!query.isLoading && !query.isError && runs.length === 0 && (
        <EmptyState eyebrow="NO RUNS YET" title="The repository is empty.">
          <p>Launch the Headless Grid reference world to produce the first trace.</p>
          <Link href="/environments/headless-grid">Open launcher →</Link>
        </EmptyState>
      )}
      {runs.length > 0 && <RunsTable runs={runs} />}
    </div>
  );
}
