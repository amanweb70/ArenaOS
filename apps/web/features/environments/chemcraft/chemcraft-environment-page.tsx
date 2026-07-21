import Link from "next/link";
import type { EnvironmentSummary } from "@/lib/types";
import { ChemCraftPreview } from "./chemcraft-preview";
import { ChemCraftLauncher } from "./chemcraft-launcher";

export function ChemCraftEnvironmentPage({
  environment
}: {
  environment: EnvironmentSummary;
}) {
  return (
    <div className="chemcraft-environment">
      <section className="shell chemcraft-hero">
        <div className="chemcraft-hero-copy">
          <Link href="/environments">← ALL ENVIRONMENTS</Link>
          <span>SCIENTIFIC WORLD / 03</span>
          <h1>Molecules under constraint.</h1>
          <p>
            ChemCraft is an offline computational chemistry station where agents inspect,
            compare, validate, visualize, and rank real molecular graphs using a local
            RDKit worker. Every number has a backend and every decision has evidence.
          </p>
          <div className="chem-hero-tags">
            {(environment.tags ?? []).slice(0, 5).map((tag) => <i key={tag}>{tag}</i>)}
          </div>
        </div>
        <div className="chemcraft-hero-visual">
          <ChemCraftPreview />
          <div className="chem-live-readout">
            <span><i /> LOCAL WORKER</span>
            <b>NO CHEMISTRY DATABASE CALLS</b>
          </div>
        </div>
      </section>

      <div className="chemcraft-marquee">
        <div className="shell">
          <span>PARSE</span><i /><span>DESCRIBE</span><i /><span>FINGERPRINT</span><i />
          <span>VALIDATE</span><i /><span>CONFORM</span><i /><span>EVALUATE</span>
        </div>
      </div>

      <section className="shell chemcraft-intro">
        <div>
          <span>01 / REAL LOCAL CHEMISTRY</span>
          <h2>A scientific instrument, not a chemistry-flavoured chatbot.</h2>
        </div>
        <p>
          RDKit performs sanitization, canonicalization, descriptors, SMARTS matching,
          Morgan fingerprints, Tanimoto similarity, ETKDG conformers, and force-field
          optimization. Calculated and heuristic evidence is labelled explicitly.
        </p>
      </section>

      <section className="shell chem-instrument-grid">
        <article><span>GRAPH</span><b>Molecule parser</b><p>Sanitized canonical graphs, formulas, atom indices, and local SVG depictions.</p></article>
        <article><span>MEASURE</span><b>Descriptor board</b><p>Mass, calculated LogP, TPSA, H-bond counts, rings, fraction sp3, and more.</p></article>
        <article><span>COMPARE</span><b>Similarity explorer</b><p>Morgan radius-2 fingerprints and transparent Tanimoto settings.</p></article>
        <article><span>3D</span><b>Conformer station</b><p>Seeded ETKDGv3 coordinates with MMFF94 or UFF force-field optimization.</p></article>
      </section>

      <section className="shell chemcraft-launch-section">
        <div>
          <span>02 / COMMISSION A RUN</span>
          <h2>Give the molecular station to an agent—or operate it yourself.</h2>
          <p>
            Both modes use the same normalized actions, budgets, artifacts, events,
            replay frames, and evaluator. The hidden answer is revealed only after a
            structured evidence-linked submission.
          </p>
        </div>
        <ChemCraftLauncher />
      </section>
    </div>
  );
}
