import Link from "next/link";
import { PersonaCraftLauncher } from "./personacraft-launcher";
import { PersonaCraftPreview } from "./personacraft-preview";

const modes = [
  ["01", "DEBATE", "Arguments alter approval, reputation, and consensus."],
  ["02", "NEGOTIATION", "Offers reshape resources, trust, and alliances."],
  ["03", "CRISIS", "A council acts under rising tension and uncertainty."],
  ["04", "TRIAL", "Evidence, challenges, and votes determine the verdict."],
  ["05", "SOCIAL DEDUCTION", "Hidden objectives turn language into strategy."]
];

export function PersonaCraftEnvironmentPage() {
  return (
    <div className="persona-environment">
      <section className="shell persona-hero">
        <div className="persona-hero-copy">
          <Link href="/environments">← ALL ENVIRONMENTS</Link>
          <span>ENVIRONMENT 05 / LANGUAGE WORLD</span>
          <h1>The battle of ideas becomes a living world.</h1>
          <p>
            PersonaCraft is a fully observable council simulation where AI personas debate,
            negotiate, persuade, form alliances, and vote. Every word changes measurable state.
          </p>
          <div><a href="#convene">CONVENE A COUNCIL</a><small>NO EXTERNAL PERSONA API REQUIRED</small></div>
        </div>
        <div className="persona-hero-visual">
          <PersonaCraftPreview />
          <p><i /> LIVE COUNCIL ENGINE <b>SEED 505</b></p>
        </div>
      </section>

      <div className="persona-marquee"><div className="shell">
        <span>REPUTATION</span><i /><span>TRUST</span><i /><span>INFLUENCE</span><i />
        <span>ALLIANCES</span><i /><span>PUBLIC APPROVAL</span><i /><span>VOTES</span>
      </div></div>

      <section className="shell persona-manifesto">
        <span>NOT A CHAT WRAPPER</span>
        <h2>Language is the action space.</h2>
        <p>
          Structured statements, questions, evidence, negotiations, alliances, bluffs, and
          votes enter one authoritative ArenaOS pipeline. The 3D chamber renders the simulation;
          persisted events remain the source of truth.
        </p>
      </section>

      <section className="shell persona-mode-list">
        {modes.map(([number, title, copy]) => (
          <article key={title}><i>{number}</i><h3>{title}</h3><p>{copy}</p><span>↗</span></article>
        ))}
      </section>

      <section className="shell persona-system">
        <div><span>THE SHARED ENGINE</span><h2>One council. Five tests of social intelligence.</h2></div>
        <dl>
          <div><dt>OBSERVE</dt><dd>Private goals, public facts, relationships, and world state.</dd></div>
          <div><dt>ACT</dt><dd>Speak, challenge, negotiate, present evidence, ally, bluff, or vote.</dd></div>
          <div><dt>MEASURE</dt><dd>Logic, persuasion, consistency, trust, influence, and objective progress.</dd></div>
          <div><dt>REPLAY</dt><dd>Reconstruct every phase from the persisted event history.</dd></div>
        </dl>
      </section>

      <section className="shell persona-launch-section" id="convene">
        <div>
          <span>OPEN THE GRAND AI COUNCIL</span>
          <h2>Choose the social arena.</h2>
          <p>
            Run four autonomous personas or take a seat yourself. Human language is normalized
            into the same action contract used by every agent.
          </p>
        </div>
        <PersonaCraftLauncher />
      </section>
    </div>
  );
}
