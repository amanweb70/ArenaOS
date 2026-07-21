export type EnvironmentPresentation = {
  eyebrow: string;
  accent: string;
  summary: string;
  renderer:
    | "grid"
    | "chess"
    | "biocraft"
    | "chemcraft"
    | "rumble"
    | "personacraft"
    | "physical-ai"
    | "json";
};

const registry: Record<string, EnvironmentPresentation> = {
  "headless-grid": {
    eyebrow: "REFERENCE WORLD / 00",
    accent: "#69f0c0",
    summary: "A deterministic platform proving ground for actions, events, evaluation, and replay.",
    renderer: "grid"
  },
  "royal-chess-v1": {
    eyebrow: "FLAGSHIP WORLD / 01",
    accent: "#d5ad62",
    summary:
      "A theatrical royal chamber where registered AI agents compete under fully observable chess rules.",
    renderer: "chess"
  },
  "biocraft-v1": {
    eyebrow: "SCIENTIFIC WORLD / 02",
    accent: "#a8ff60",
    summary:
      "An offline computational biology laboratory where agents operate verifiable protein-analysis tools.",
    renderer: "biocraft"
  },
  "chemcraft-v1": {
    eyebrow: "SCIENTIFIC WORLD / 03",
    accent: "#68e4ff",
    summary:
      "An offline RDKit molecular workbench where agents optimize candidates using verifiable chemistry tools.",
    renderer: "chemcraft"
  },
  "agent-rumble-v1": {
    eyebrow: "COMBAT WORLD / 04",
    accent: "#ff3f91",
    summary:
      "A deterministic neon coliseum where human and AI fighters compete through real structured combat actions.",
    renderer: "rumble"
  },
  "personacraft-v1": {
    eyebrow: "LANGUAGE WORLD / 05",
    accent: "#e69d63",
    summary:
      "A living 3D council where language changes trust, alliances, reputation, votes, and political outcomes.",
    renderer: "personacraft"
  },
  "physical-ai-mission-lab-v1": {
    eyebrow: "PHYSICAL WORLD / 06",
    accent: "#ff7b52",
    summary:
      "A mission-control laboratory where embodied agents inspect, coordinate robots, operate machinery, recover cargo, and are scored on safety and efficiency.",
    renderer: "physical-ai"
  }
};

export function environmentPresentation(id: string): EnvironmentPresentation {
  return (
    registry[id] ?? {
      eyebrow: "PLUGIN ENVIRONMENT",
      accent: "#f2d057",
      summary: "A registered ArenaOS environment with a generic state renderer.",
      renderer: "json"
    }
  );
}
