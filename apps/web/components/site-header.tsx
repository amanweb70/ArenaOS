"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Brand } from "./brand";

const links = [
  ["/environments", "Worlds"],
  ["/runs", "Runs"],
  ["/benchmarks", "Benchmarks"],
  ["/build", "Build"],
  ["/docs", "Docs"]
] as const;

export function SiteHeader() {
  const pathname = usePathname();
  return (
    <header className="site-header">
      <div className="shell header-inner">
        <Brand />
        <nav aria-label="Primary">
          {links.map(([href, label]) => (
            <Link
              href={href}
              key={href}
              aria-current={pathname.startsWith(href) ? "page" : undefined}
            >
              {label}
            </Link>
          ))}
        </nav>
        <Link href="/environments" className="header-cta">
          Enter arena <span>↗</span>
        </Link>
      </div>
    </header>
  );
}
