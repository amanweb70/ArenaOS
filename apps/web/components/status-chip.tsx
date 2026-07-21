import type { RunRecord } from "@arena/contracts";

export function StatusChip({ status }: { status: RunRecord["status"] }) {
  return (
    <span className={`status-chip ${status}`}>
      <i />
      {status}
    </span>
  );
}
