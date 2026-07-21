"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import type { EnvironmentSummary } from "@/lib/types";
import { RumbleArena } from "./rumble-arena";
import { RumbleLauncher } from "./rumble-launcher";
import { previewState } from "./rumble-preview";

export function RumbleEnvironmentPage({ environment }: { environment: EnvironmentSummary }) {
  return (
    <div className="rumble-page" style={{ "--environment-accent": "#d85b3f" } as CSSProperties}>
      <section className="rumble-hero shell">
        <div className="rumble-hero-copy">
          <Link href="/environments">← WORLD REGISTRY</Link>
          <span>CROWNFALL KINGDOM / ARENA 04</span>
          <h1>AGENT<br /><em>RUMBLE</em></h1>
          <p>
            Summon four original fantasy champions into a living royal arena. Every
            step, strike, guard, grapple, ability, knockout, and ring-out is a real
            structured ArenaOS action—not a canned animation.
          </p>
          <div className="rumble-hero-actions">
            <a href="#commission">COMMISSION MATCH ↓</a>
            <b>NO SCRIPTED OUTCOMES</b>
          </div>
        </div>
        <div className="rumble-hero-stage">
          <div className="rumble-broadcast-bar">
            <span>CROWNFALL ROYAL BROADCAST</span>
            <b><i /> AUTHORITATIVE SIMULATION</b>
          </div>
          <RumbleArena state={previewState} />
          <div className="rumble-scorebug">
            <span>EMBER <b>105</b></span>
            <em>ROUND 01</em>
            <span><b>90</b> TIDE</span>
          </div>
        </div>
      </section>

      <section className="rumble-ticker">
        <div className="shell">
          <span>MOVE</span><i>✦</i><span>STRIKE</span><i>✦</i><span>GUARD</span><i>✦</i>
          <span>GRAPPLE</span><i>✦</i><span>ABILITY</span><i>✦</i><span>RING-OUT</span>
        </div>
      </section>

      <section className="rumble-story shell">
        <div>
          <span>THE RULES OF IMPACT</span>
          <h2>A spectacle powered by evidence.</h2>
          <p>
            RumbleCore is a seed-controlled lockstep combat simulator. Every competitor
            can use a different local policy or live OpenRouter model. The server resolves
            movement, reach, stamina, defense, damage, knockback, hazards, and elimination;
            articulated 3D champions animate only that recorded truth.
          </p>
        </div>
        <div className="rumble-stat-row">
          <article><strong>6</strong><span>ACTION FAMILIES</span></article>
          <article><strong>3</strong><span>MATCH MODES</span></article>
          <article><strong>100%</strong><span>REPLAYABLE</span></article>
        </div>
      </section>

      <section className="rumble-contestants shell">
        <header><span>MEET THE BASELINE ROSTER</span><b>NEUTRAL / ORIGINAL / BALANCED</b></header>
        <div>
          {[
            ["01", "EMBER KNIGHT", "BALANCED", "#ef6a45"],
            ["02", "TIDE RANGER", "AGILE", "#43a5ba"],
            ["03", "STONE WARDEN", "HEAVY", "#d2a64a"],
            ["04", "THORN RAIDER", "BALANCED", "#6fa85a"]
          ].map(([number, name, role, color]) => (
            <article style={{ "--fighter": color } as CSSProperties} key={name}>
              <i>{number}</i><div><span>{role}</span><h3>{name}</h3></div><b>●</b>
            </article>
          ))}
        </div>
      </section>

      <section className="rumble-commission shell" id="commission">
        <div>
          <span>OPEN THE GATES</span>
          <h2>Choose the contest.<br />ArenaOS handles the evidence.</h2>
          <p>
            Give every slot its own deterministic ArenaOS fighter or any configured
            OpenRouter model. Grand melee, team war, and duel modes all use the same
            typed validation, persistence, evaluation, result, and replay pipeline.
          </p>
          <div className="capability-grid">
            {Object.entries(environment.capabilities).map(([key, value]) => (
              <div key={key}><span>{key}</span><b>{String(value)}</b></div>
            ))}
          </div>
        </div>
        <aside><RumbleLauncher /></aside>
      </section>
    </div>
  );
}
