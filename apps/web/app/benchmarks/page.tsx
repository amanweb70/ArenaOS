"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { RunRecord } from "@arena/contracts";
import { arenaApi } from "@/lib/arena-api";
import { durationMs, evaluation, shortId } from "@/lib/format";
import { EmptyState, LoadingBlock, QueryError } from "@/components/query-state";
import { SectionHeading } from "@/components/section-heading";

export default function BenchmarksPage() {
  const query = useQuery({ queryKey: ["runs"], queryFn: arenaApi.runs });
  const completed = (query.data ?? []).filter((run) => run.status === "completed");
  const groups = groupRuns(completed);

  return (
    <div className="shell page">
      <SectionHeading eyebrow="AUTHENTIC RESULTS ONLY" title="Benchmarks.">
        <p>
          Comparisons are derived from persisted ArenaOS runs. No seeded demo scores,
          invented models, or placeholder leaderboard entries.
        </p>
      </SectionHeading>
      {query.isLoading && <LoadingBlock label="Aggregating persisted evaluations" />}
      {query.isError && <QueryError error={query.error} retry={() => query.refetch()} />}
      {!query.isLoading && groups.length === 0 && (
        <EmptyState eyebrow="NO COMPLETED RUNS" title="Benchmark evidence starts with a run.">
          <p>Complete the reference environment to create the first authentic row.</p>
          <Link href="/environments/headless-grid">Launch Headless Grid →</Link>
        </EmptyState>
      )}
      {groups.length > 0 && (
        <>
          <div className="benchmark-summary">
            <article><span>COMPLETED RUNS</span><strong>{completed.length}</strong></article>
            <article><span>CONFIGURATIONS</span><strong>{groups.length}</strong></article>
            <article><span>ENVIRONMENTS</span><strong>{new Set(completed.map((run) => run.config.environmentId)).size}</strong></article>
          </div>
          <div className="table-wrap">
            <table className="runs-table benchmark-table">
              <thead>
                <tr>
                  <th>ENVIRONMENT</th><th>AGENT</th><th>RUNS</th><th>SUCCESS</th>
                  <th>AVG STEPS</th><th>AVG DURATION</th><th>LATEST</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => (
                  <tr key={group.key}>
                    <td>{group.environmentId}</td>
                    <td>{group.agentId}</td>
                    <td>{group.runs.length}</td>
                    <td>{Math.round(group.successRate * 100)}%</td>
                    <td>{group.averageSteps.toFixed(1)}</td>
                    <td>{(group.averageDuration / 1_000).toFixed(2)} s</td>
                    <td><Link href={`/runs/${group.latest.id}`}>{shortId(group.latest.id)} ↗</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <section className="benchmark-bars">
            <span>SUCCESS RATE BY CONFIGURATION</span>
            {groups.map((group) => (
              <div key={group.key}>
                <label>{group.environmentId} / {group.agentId}</label>
                <i><b style={{ width: `${group.successRate * 100}%` }} /></i>
                <strong>{Math.round(group.successRate * 100)}%</strong>
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  );
}

function groupRuns(runs: RunRecord[]) {
  const map = new Map<string, RunRecord[]>();
  for (const run of runs) {
    const key = `${run.config.environmentId}:${run.config.agentId}`;
    map.set(key, [...(map.get(key) ?? []), run]);
  }
  return [...map.entries()].map(([key, items]) => {
    const successes = items.filter((run) => evaluation(run, "success")?.passed).length;
    const durations = items.map(durationMs).filter((value): value is number => value !== undefined);
    const latest = [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]!;
    return {
      key,
      environmentId: latest.config.environmentId,
      agentId: latest.config.agentId,
      runs: items,
      latest,
      successRate: items.length ? successes / items.length : 0,
      averageSteps: items.reduce((sum, run) => sum + run.steps, 0) / items.length,
      averageDuration: durations.length
        ? durations.reduce((sum, value) => sum + value, 0) / durations.length
        : 0
    };
  });
}
