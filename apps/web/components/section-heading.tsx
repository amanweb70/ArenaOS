import type { ReactNode } from "react";

export function SectionHeading({
  eyebrow,
  title,
  children,
  action
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="section-heading">
      <div>
        <span>{eyebrow}</span>
        <h2>{title}</h2>
        {children && <div className="section-intro">{children}</div>}
      </div>
      {action}
    </header>
  );
}
