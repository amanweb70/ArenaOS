"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { arenaApi } from "@/lib/arena-api";
import { EnvironmentCard } from "@/components/environment-card";
import { LoadingBlock, QueryError } from "@/components/query-state";
import { SectionHeading } from "@/components/section-heading";
import { HeroArena } from "@/components/hero-arena";

export default function HomePage() {
  const environments = useQuery({
    queryKey: ["environments"],
    queryFn: arenaApi.environments
  });
  const runs = useQuery({ queryKey: ["runs"], queryFn: arenaApi.runs });
  const flagships = environments.data?.filter((environment) =>
    ["royal-chess-v1", "biocraft-v1", "chemcraft-v1", "agent-rumble-v1", "personacraft-v1", "physical-ai-mission-lab-v1"].includes(environment.id)
  );

  return (
    <>
      <section className="hero shell">
        <div className="hero-kicker">
          <span>AGENT EVALUATION INFRASTRUCTURE</span>
          <i />
          <b>LOCAL CONTROL PLANE</b>
        </div>
        <h1 className="hero-title">
          WORLDS WHERE
          <br />
          AI AGENTS <em>ACT.</em>
        </h1>
        <HeroArena />
        <p>
          Run agents inside interactive worlds. Observe decisions. Replay behavior.
          Benchmark what actually happened.
        </p>
        <div className="hero-actions">
          <Link href="/environments" className="button primary">
            Explore worlds <span>→</span>
          </Link>
          <Link href="/docs" className="button ghost">Read the architecture</Link>
        </div>
        <div className="hero-console" aria-label="ArenaOS execution pipeline">
          <div className="console-top">
            <span>ARENAOS://CONTROL-PLANE</span>
            <span><i /> SYSTEM READY</span>
          </div>
          <div className="pipeline">
            {[
              ["01", "ENVIRONMENT", environments.data?.length ?? "—"],
              ["02", "AGENT", "ACT"],
              ["03", "EVENT BUS", "TRACE"],
              ["04", "EVALUATION", "SCORE"],
              ["05", "REPLAY", runs.data?.length ?? "—"]
            ].map(([index, label, value], position) => (
              <div className="pipeline-node" key={label}>
                <small>{index}</small>
                <span>{label}</span>
                <b>{value}</b>
                {position < 4 && <i>→</i>}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="shell section">
        <SectionHeading
          eyebrow="REGISTERED NOW"
          title="Six flagship worlds. Six kinds of intelligence."
          action={<Link href="/environments" className="text-link">All environments →</Link>}
        >
          <p>
            Royal Chess tests competitive strategy. BioCraft tests protein reasoning.
            ChemCraft tests evidence-grounded molecular optimization. Agent Rumble tests
            embodied multi-agent tactics. All four run on
            the same observable ArenaOS spine.
          </p>
        </SectionHeading>
        {environments.isLoading && <LoadingBlock label="Reading environment registry" />}
        {environments.isError && (
          <QueryError error={environments.error} retry={() => environments.refetch()} />
        )}
        {flagships && (
          <div className="featured-environment">
            {flagships.map((environment) => (
              <EnvironmentCard environment={environment} key={environment.id} />
            ))}
          </div>
        )}
      </section>

      <section className="manifesto">
        <div className="shell manifesto-grid">
          <span>WHY ARENAOS</span>
          <h2>
            Static benchmarks tell you the answer.
            <br />
            <em>Interactive worlds reveal the behavior.</em>
          </h2>
          <div className="feature-columns">
            <article><b>01 / ACT</b><h3>Real decisions</h3><p>Agents choose typed actions against an environment contract.</p></article>
            <article><b>02 / OBSERVE</b><h3>Normalized traces</h3><p>Every transition becomes an inspectable event with durable context.</p></article>
            <article><b>03 / REPLAY</b><h3>Evidence, stored</h3><p>Reconstruct runs from recorded frames without rerunning the world.</p></article>
          </div>
        </div>
      </section>

      <section className="shell section">
        <SectionHeading eyebrow="JUDGE PATH" title="From world to evidence in one run." />
        <div className="judge-path">
          {[
            ["SELECT", "Choose a registered environment and compatible agent."],
            ["LAUNCH", "Create the experiment through the Fastify control plane."],
            ["WATCH", "Follow state, actions, events, and metrics live."],
            ["REPLAY", "Scrub the stored execution after it completes."]
          ].map(([title, body], index) => (
            <article key={title}><span>0{index + 1}</span><h3>{title}</h3><p>{body}</p></article>
          ))}
        </div>
        <Link href="/environments/royal-chess-v1" className="wide-cta">
          <span>ENTER FLAGSHIP WORLD 01</span>
          <b>Commission a Royal Match →</b>
        </Link>
        <Link href="/environments/biocraft-v1" className="wide-cta">
          <span>ENTER SCIENTIFIC WORLD 02</span>
          <b>Open the BioCraft laboratory →</b>
        </Link>
        <Link href="/environments/chemcraft-v1" className="wide-cta">
          <span>ENTER SCIENTIFIC WORLD 03</span>
          <b>Open the ChemCraft molecular station →</b>
        </Link>
        <Link href="/environments/agent-rumble-v1" className="wide-cta">
          <span>ENTER COMBAT WORLD 04</span>
          <b>Open the Neon Coliseum →</b>
        </Link>
        <Link href="/environments/personacraft-v1" className="wide-cta">
          <span>ENTER LANGUAGE WORLD 05</span>
          <b>Convene the Grand AI Council →</b>
        </Link>
        <Link href="/environments/physical-ai-mission-lab-v1" className="wide-cta">
          <span>ENTER PHYSICAL WORLD 06</span>
          <b>Launch the Warehouse Rescue Relay →</b>
        </Link>
      </section>
    </>
  );
}
