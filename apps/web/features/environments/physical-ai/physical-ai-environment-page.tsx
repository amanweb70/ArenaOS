import Link from "next/link";
import { PhysicalAILauncher } from "./physical-ai-launcher";
import { PhysicalAIPreview } from "./physical-ai-preview";

export function PhysicalAIEnvironmentPage() {
  return (
    <div className="physical-environment">
      <section className="shell physical-hero">
        <div className="physical-hero-copy">
          <Link href="/environments">← ALL ENVIRONMENTS</Link>
          <span>ENVIRONMENT 06 / PHYSICAL WORLD</span>
          <h1>Intelligence enters the physical world.</h1>
          <p>
            Command a robot team through a damaged warehouse. Inspect, plan, clear a blocked route,
            operate a fixed arm, recover priority cargo, and extract it without wasting time,
            energy, or safety margin.
          </p>
          <div><a href="#mission-start">START THE MISSION</a><small>STRUCTURED INTENT · AUTHORITATIVE STATE</small></div>
        </div>
        <div className="physical-hero-visual">
          <PhysicalAIPreview />
          <p><i /> ADAPTER ONLINE <b>PROTOCOL 1.0</b></p>
        </div>
      </section>

      <div className="physical-marquee"><div className="shell">
        <span>MISSION PLANNING</span><i /><span>ROBOT CONTROL</span><i /><span>SAFETY</span><i />
        <span>ENERGY</span><i /><span>MANIPULATION</span><i /><span>REPLAY</span>
      </div></div>

      <section className="shell physical-brief">
        <div><span>WAREHOUSE RESCUE RELAY</span><h2>One compact mission. Every embodied skill exposed.</h2></div>
        <p>
          A systems failure has damaged the conveyor, blocked the north aisle, and stranded
          package P3 beside a thermal hazard. ATLAS mobile robots and a fixed gantry arm must
          coordinate a safe recovery before the mission clock expires.
        </p>
      </section>

      <section className="shell physical-objectives">
        {[
          ["01", "PERCEIVE", "Inspect the conveyor, package bay, obstacle, and hazard margin."],
          ["02", "PLAN", "Assign robots, sequence work, and preserve a viable extraction route."],
          ["03", "ACT", "Navigate, push, transfer, carry, place, stop, charge, and recover."],
          ["04", "PROVE", "Score objective state, time, safety, energy, validity, and coordination."]
        ].map(([number, title, copy]) => <article key={title}><i>{number}</i><h3>{title}</h3><p>{copy}</p></article>)}
      </section>

      <section className="shell physical-stack">
        <div>
          <span>AN HONEST EXTERNAL-SIMULATOR BOUNDARY</span>
          <h2>One action path from intent to world state.</h2>
        </div>
        <div className="physical-flow">
          <article><b>AGENT OR HUMAN</b><span>High-level mission intent</span></article><i>↓</i>
          <article><b>ARENAOS</b><span>Validation, routing, events, scoring</span></article><i>↓</i>
          <article><b>SIMULATOR ADAPTER</b><span>Reference backend now · Isaac bridge when available</span></article><i>↓</i>
          <article><b>MISSION WORLD</b><span>Transforms, battery, collision, cargo, outcome</span></article>
        </div>
      </section>

      <section className="shell physical-truth">
        <div><span>CAPABILITY DISCOVERY</span><strong>NO FAKE ISAAC STREAM</strong></div>
        <p>
          The current workstation does not have NVIDIA Isaac Sim installed, so this build uses the
          fully functional seeded reference mission backend and labels it on every run. The adapter
          already preserves the exact action, observation, event, snapshot, and evaluation boundary
          required for an Isaac Sim/PhysX host.
        </p>
      </section>

      <section className="shell physical-launch-section" id="mission-start">
        <div><span>MISSION CONTROL</span><h2>Choose who commands the fleet.</h2><p>Run the deterministic coordinator baseline, compare two cooperating agents, or take direct command of ATLAS-01 while ArenaOS routes the second robot to an AI teammate.</p></div>
        <PhysicalAILauncher />
      </section>
    </div>
  );
}
