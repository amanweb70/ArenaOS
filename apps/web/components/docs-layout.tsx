import Link from "next/link";
import type { ReactNode } from "react";
import { docCategories, docs } from "@/lib/docs";

export function DocsLayout({ active, children }: { active: string; children: ReactNode }) {
  return (
    <div className="shell docs-shell">
      <aside>
        <div className="docs-sidebar-title">
          <span>ARENAOS MANUAL</span>
          <strong>Documentation</strong>
        </div>
        <nav aria-label="Documentation navigation">
          {docCategories.map((category) => (
            <div className="docs-nav-group" key={category}>
              <span>{category}</span>
              {docs
                .filter((doc) => doc.category === category)
                .map((doc) => (
                  <Link
                    href={`/docs/${doc.slug}`}
                    className={active === doc.slug ? "active" : ""}
                    key={doc.slug}
                  >
                    {doc.title}
                  </Link>
                ))}
            </div>
          ))}
        </nav>
        <div className="docs-local-api">
          <b>LOCAL API</b>
          <code>127.0.0.1:4000</code>
        </div>
      </aside>
      <article className="doc-content">{children}</article>
    </div>
  );
}
