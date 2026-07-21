import Link from "next/link";
import type { EnvironmentSummary } from "@/lib/types";
import { BioCraftPreview } from "./biocraft-preview";
import { BioCraftLauncher } from "./biocraft-launcher";

export function BioCraftEnvironmentPage({
  environment
}: {
  environment: EnvironmentSummary;
}) {
  return (
    <div className="biocraft-environment">
      <section className="shell biocraft-hero">
        <div className="biocraft-hero-copy">
          <Link href="/environments">← ALL ENVIRONMENTS</Link>
          <span>ARENAOS SCIENTIFIC WORLD / 02</span>
          <h1>Biology you can<br />inspect, not trust.</h1>
          <p>
            BioCraft turns protein-mutation analysis into an observable agent
            workflow. Every metric, alignment, coordinate, annotation, artifact,
            and score comes from bundled data or deterministic local computation.
          </p>
          <div className="tag-row">
            {(environment.tags ?? []).map((tag) => <span key={tag}>{tag}</span>)}
          </div>
        </div>
        <div className="biocraft-hero-lab">
          <BioCraftPreview />
          <div className="bio-lab-readouts">
            <article><span>REFERENCE</span><b>1UBQ</b><small>Homo sapiens ubiquitin</small></article>
            <article><span>STRUCTURE</span><b>1.8 Å</b><small>X-ray diffraction</small></article>
            <article><span>EXECUTION</span><b>LOCAL</b><small>network disabled</small></article>
          </div>
        </div>
      </section>

      <div className="biocraft-marquee">
        <div className="shell">
          <span>SEQUENCE INSPECTION</span><i />
          <span>ALIGNMENT</span><i />
          <span>BLOSUM62</span><i />
          <span>1UBQ STRUCTURE</span><i />
          <span>EVIDENCE NOTEBOOK</span>
        </div>
      </div>

      <section className="shell biocraft-intro">
        <div>
          <span>01 / THE CHALLENGE</span>
          <h2>Act like a computational biology researcher.</h2>
        </div>
        <p>
          Rank five candidate substitutions by their likelihood of preserving
          ubiquitin function. Inspect the sequence, quantify conservation,
          calculate substitution chemistry, explore the real 1UBQ structure,
          create a mutant FASTA, record evidence, then submit a structured conclusion.
        </p>
      </section>

      <section className="shell bio-tool-grid">
        {[
          ["01", "Sequence Inspector", "Molecular weight, composition, charge, pI and Kyte-Doolittle hydropathy."],
          ["02", "Conservation Lab", "A bundled three-species alignment with residue conservation and Shannon entropy."],
          ["03", "Mutation Evidence", "BLOSUM62, charge, polarity, volume and hydropathy changes."],
          ["04", "Structure Inspector", "Real 1UBQ C-alpha coordinates, neighborhoods and declared exposure approximation."],
          ["05", "Evidence Notebook", "Public concise notes linked to persisted scientific result IDs."],
          ["06", "Deterministic Evaluation", "Weighted ranking, recommendation, grounding, compliance and efficiency scoring."]
        ].map(([number, title, body]) => (
          <article key={number}>
            <span>{number}</span>
            <h3>{title}</h3>
            <p>{body}</p>
          </article>
        ))}
      </section>

      <section className="shell biocraft-launch-section">
        <div>
          <span>02 / OPEN THE WORKBENCH</span>
          <h2>One challenge.<br />A complete scientific trace.</h2>
          <p>
            Run the included research baseline or take manual control. Both paths
            use the identical ArenaOS action contract, tool budget, evidence model,
            evaluator, persistence, and replay pipeline.
          </p>
          <div className="bio-boundary">
            <b>SCIENTIFIC BOUNDARY</b>
            <p>
              No stability value is invented. FoldX, Rosetta, DSSP, FreeSASA and
              unrestricted Python remain explicitly unavailable until a validated
              local backend is installed.
            </p>
          </div>
        </div>
        <aside><BioCraftLauncher /></aside>
      </section>
    </div>
  );
}
