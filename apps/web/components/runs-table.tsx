import Link from "next/link";
import type { RunRecord } from "@arena/contracts";
import { formatDate, formatDuration, durationMs, shortId, successLabel } from "@/lib/format";
import { StatusChip } from "./status-chip";

export function RunsTable({ runs }: { runs: RunRecord[] }) {
  return (
    <div className="table-wrap">
      <table className="runs-table">
        <thead>
          <tr>
            <th>RUN</th>
            <th>ENVIRONMENT</th>
            <th>AGENT</th>
            <th>STATUS</th>
            <th>STEPS</th>
            <th>RESULT</th>
            <th>DURATION</th>
            <th>CREATED</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr key={run.id}>
              <td><Link href={`/runs/${run.id}`}>{shortId(run.id)} ↗</Link></td>
              <td>{run.config.environmentId}</td>
              <td>{run.config.agentId}</td>
              <td><StatusChip status={run.status} /></td>
              <td>{run.steps}</td>
              <td>{successLabel(run)}</td>
              <td>{formatDuration(durationMs(run))}</td>
              <td>{formatDate(run.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
