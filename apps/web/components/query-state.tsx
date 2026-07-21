import type { ReactNode } from "react";

export function QueryError({
  title = "Control plane unavailable",
  error,
  retry
}: {
  title?: string;
  error: Error | null;
  retry?: () => void;
}) {
  return (
    <div className="system-message error-message" role="alert">
      <span>CONNECTION ERROR</span>
      <h2>{title}</h2>
      <p>{error?.message ?? "The ArenaOS API could not be reached."}</p>
      {retry && <button onClick={retry}>Retry connection</button>}
    </div>
  );
}

export function LoadingBlock({ label = "Loading platform state" }: { label?: string }) {
  return (
    <div className="loading-block" aria-live="polite">
      <i />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({
  eyebrow,
  title,
  children
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="system-message">
      <span>{eyebrow}</span>
      <h2>{title}</h2>
      <div>{children}</div>
    </div>
  );
}
