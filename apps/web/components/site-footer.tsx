import Link from "next/link";
import { Brand } from "./brand";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="shell footer-grid">
        <div>
          <Brand />
          <p>Interactive worlds for observable, replayable AI-agent evaluation.</p>
        </div>
        <div>
          <b>PLATFORM</b>
          <Link href="/environments">Environments</Link>
          <Link href="/runs">Runs</Link>
          <Link href="/benchmarks">Benchmarks</Link>
        </div>
        <div>
          <b>DEVELOPERS</b>
          <Link href="/build">Build</Link>
          <Link href="/docs">Docs</Link>
        </div>
        <small>© 2026 ARENAOS / HACKATHON BUILD</small>
      </div>
    </footer>
  );
}
