"use client";

import type { PersonaCraftState, PersonaDefinition } from "@/lib/types";
import { PersonaCouncilScene } from "./persona-council-scene";

export function PersonaCraftPreview() {
  return (
    <div className="persona-preview">
      <PersonaCouncilScene state={previewCouncilState} compact reducedMotion />
      <div className="persona-preview-title">
        <span>LANGUAGE WORLD / 05</span>
        <b>THE GRAND AI COUNCIL</b>
      </div>
      <div className="persona-preview-live"><i /> SPEAKING</div>
    </div>
  );
}

export const previewCouncilState: PersonaCraftState = {
  sessionId: "preview",
  mode: "debate",
  status: "ready",
  timingMode: "turn_based",
  seed: 505,
  round: 1,
  maxRounds: 3,
  phase: "speaking",
  phaseIndex: 0,
  activeParticipantId: "pink",
  actedThisPhase: [],
  scenario: {
    id: "ai-accord-2040",
    title: "The AI Accord of 2040",
    topic: "Should frontier AI development require a binding international safety accord?",
    briefing: "Four influential minds must persuade the Grand AI Council.",
    stakes: "The winning framework governs a generation.",
    arena: "grand-ai-council",
    decisionChoices: [
      { id: "adopt_safeguards", label: "Adopt Binding Safeguards", description: "Mandatory audits." },
      { id: "accelerate_openly", label: "Accelerate Openly", description: "Open research." },
      { id: "pause_deployment", label: "Pause Deployment", description: "Temporary pause." }
    ],
    publicFacts: [
      {
        id: "audit-forecast",
        title: "Independent Forecast",
        content: "A severe second-order risk remains.",
        credibility: 92,
        unlockedRound: 1
      }
    ]
  },
  personas: [
    persona("pink", "Ada Lovelace", "Architect of Possibility", "Analytical Engines", "#ff4f9a", 0),
    persona("cyan", "Sun Tzu", "Strategist of the Empty Field", "Strategy", "#55e7ff", 1),
    persona("gold", "Cleopatra", "Sovereign Diplomat", "Statecraft", "#ffd84c", 2),
    persona("violet", "Alan Turing", "The Quiet Logician", "Computation", "#a67cff", 3)
  ],
  relationships: [],
  transcript: [],
  eventHistory: [],
  recentEvents: [],
  votes: {},
  audience: { sentiment: 52, energy: 34, dominantReaction: "thoughtful", reactionCounts: {} },
  world: {
    tension: 42,
    consensus: 20,
    informationLevel: 18,
    update: "The chamber receives the opening constitutional mandate."
  },
  revealedObjectives: {}
};

function persona(
  id: string,
  displayName: string,
  title: string,
  domain: string,
  color: string,
  seat: number
): PersonaDefinition {
  return {
    id,
    displayName,
    title,
    domain,
    color,
    accent: color,
    seat,
    speakingStyle: "Measured and strategic",
    traits: ["strategic", "logical"],
    publicGoal: "Produce a defensible council decision.",
    preferredChoice: "adopt_safeguards",
    status: "active",
    alliances: [],
    votesReceived: 0,
    metrics: {
      reputation: 55,
      trust: 50,
      influence: 40 + seat * 2,
      politicalCapital: 40,
      publicApproval: 50,
      suspicion: 18,
      resources: 50,
      confidence: 62,
      evidenceScore: 35,
      logicScore: 45,
      persuasionScore: 42,
      personaConsistency: 60,
      informationGain: 0,
      objectiveProgress: 12,
      communicationEfficiency: 58
    }
  };
}
