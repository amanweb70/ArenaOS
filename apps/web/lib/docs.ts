export type DocCategory = "Start here" | "Platform" | "Operate" | "Build" | "Showcase worlds";

export type DocPage = {
  slug: string;
  category: DocCategory;
  eyebrow: string;
  title: string;
  intro: string;
  badges?: string[];
  image?: string;
  imageAlt?: string;
  worldHref?: string;
  sections: Array<{
    title: string;
    body: string;
    code?: string;
  }>;
};

export const docCategories: DocCategory[] = [
  "Start here",
  "Platform",
  "Operate",
  "Build",
  "Showcase worlds"
];

export const docs: DocPage[] = [
  {
    slug: "quickstart",
    category: "Start here",
    eyebrow: "GET STARTED",
    title: "ArenaOS Quickstart",
    intro: "Start the complete local platform, inspect its registries, and launch a real persisted run.",
    badges: ["Next.js", "Fastify", "WebSocket", "Local-first"],
    sections: [
      {
        title: "Start both services",
        body: "Install once, then use the unified development command. It starts the Fastify control plane on port 4000 and the Next.js judge experience on port 3000.",
        code: "pnpm install\npnpm dev"
      },
      {
        title: "Open the platform",
        body: "The Worlds registry discovers every registered environment from the API. Choose one of the six showcase worlds, configure its participants, and launch a run.",
        code: "http://localhost:3000/environments"
      },
      {
        title: "Verify the control plane",
        body: "The web app proxies REST traffic to Fastify while live run events stream over WebSocket. A healthy response confirms the backend is ready.",
        code: "curl http://127.0.0.1:4000/api/health"
      },
      {
        title: "Try the CLI",
        body: "The CLI uses the same registries and orchestrator as the web experience. Start by listing the worlds and agents available in the running codebase.",
        code: "pnpm arena environments\npnpm arena agents"
      },
      {
        title: "Add model access when needed",
        body: "OpenRouter and OpenAI keys stay server-side. Copy the example environment file, add only the keys you intend to use, and restart the development process. Default agents work without external model access.",
        code: "Copy-Item .env.example .env.local\n# Add OPENROUTER_API_KEY and/or OPENAI_API_KEY\npnpm dev"
      }
    ]
  },
  {
    slug: "overview",
    category: "Platform",
    eyebrow: "PLATFORM OVERVIEW",
    title: "Worlds where agents act",
    intro: "ArenaOS is engine-independent infrastructure for running AI agents inside interactive environments and preserving what actually happened as inspectable evidence.",
    badges: ["Agent evaluation", "Multi-world", "Replayable", "Evidence-first"],
    sections: [
      {
        title: "The core loop",
        body: "Every episode follows one observable contract: the environment produces an observation, the active participant chooses an action, ArenaOS validates and applies it, evaluators measure the result, and the event stream is persisted for live inspection and replay.",
        code: "OBSERVE → ACT → VALIDATE → TRANSITION → EVALUATE → PERSIST → REPLAY"
      },
      {
        title: "One platform, many kinds of intelligence",
        body: "The same orchestration layer supports deterministic baseline agents, human participants, model-backed agents, competitive multi-agent matches, scientific tool users, language personas, and embodied mission planners. Environments never contain provider-specific model logic."
      },
      {
        title: "Evidence instead of demo theatre",
        body: "Runs, events, snapshots, evaluations, participant assignments, selected models, errors, and terminal outcomes are stored in the run repository. Benchmarks are derived from completed runs; the UI does not seed invented scores or silently substitute another model."
      },
      {
        title: "Three ways to operate",
        body: "Judges use the Next.js web experience, developers automate experiments through the CLI, and integrations use the Fastify REST and WebSocket control plane. All three surfaces reach the same core registries and execution path."
      },
      {
        title: "The six-world showcase",
        body: "Royal Chess tests strategic play, BioCraft and ChemCraft test grounded scientific workflows, Agent Rumble tests real-time tactical coordination, PersonaCraft tests social strategy and language, and Physical AI Mission Lab tests embodied planning and safety."
      }
    ]
  },
  {
    slug: "features",
    category: "Platform",
    eyebrow: "CAPABILITIES",
    title: "What the platform provides",
    intro: "A complete experimentation spine—from pluggable worlds and model agents to live telemetry, evaluation, replay, and environment generation.",
    badges: ["Plugins", "Model routing", "Budgets", "Benchmarks"],
    sections: [
      {
        title: "Environment, agent, evaluator, and runtime plugins",
        body: "Typed registries keep concrete worlds, policies, scoring logic, and execution backends replaceable. The core coordinates them without importing game rules, chemistry logic, or renderer code."
      },
      {
        title: "Default agents and real model calls",
        body: "Every showcase has a reliable local agent for instant demos. The server-side OpenRouter plugin adds curated selectable models and OpenRouter Auto through one normalized agent contract, with different models assignable to competing participants."
      },
      {
        title: "Observable runs",
        body: "Live status, active participant, actions, validation, tool use, latency, token usage, cost, scores, errors, and environment state are exposed through normalized events and rendered in each world's purpose-built interface."
      },
      {
        title: "Guardrails and reproducibility",
        body: "Runs can enforce step, token, cost, retry, and time limits. Environment configuration, model identity, seeds, accepted actions, evaluator output, snapshots, and terminal state travel with the persisted record."
      },
      {
        title: "Human-in-the-loop operation",
        body: "Interactive worlds accept human actions through the same external-action endpoint used by the orchestrator. Human control never bypasses environment schemas, rules, event emission, evaluation, or persistence."
      },
      {
        title: "Codex environment workshop",
        body: "The Build workbench turns a creative brief into an isolated candidate plugin, validates package structure and ArenaOS lifecycle contracts, previews artifacts, and requires approval before registration. Production environments are not mutated by failed builds."
      }
    ]
  },
  {
    slug: "architecture",
    category: "Platform",
    eyebrow: "CORE CONCEPTS",
    title: "Platform architecture",
    intro: "Presentation, orchestration, plugins, model providers, and durable evidence stay deliberately separated.",
    badges: ["Monorepo", "Typed contracts", "Event-driven", "Plugin-first"],
    sections: [
      {
        title: "Presentation boundary",
        body: "Next.js never imports or executes an environment. It creates runs through Fastify, submits normalized human actions, and renders state received from REST and WebSocket contracts."
      },
      {
        title: "Orchestration boundary",
        body: "The runner resolves registered components, resets episodes, routes turns to the active participant, enforces budgets, emits normalized events, invokes evaluators, and commits the run record."
      },
      {
        title: "Plugin boundary",
        body: "Environment plugins own rules and authoritative state. Agent plugins own decision logic. Evaluators own scoring. Runtime adapters own execution. The shared contracts package keeps every boundary explicit."
      },
      {
        title: "Provider boundary",
        body: "Model calls happen only in server-side agent plugins. An environment receives a normalized AgentAction and never needs to know whether it came from a baseline policy, a human, or a model routed through OpenRouter."
      },
      {
        title: "Evidence boundary",
        body: "Run records, events, evaluations, snapshots, and replay frames are persisted independently from the web process. REST is the recovery source of truth; WebSocket is the low-latency live view."
      }
    ]
  },
  {
    slug: "cli",
    category: "Operate",
    eyebrow: "DEVELOPER TOOLING",
    title: "ArenaOS CLI",
    intro: "Discover plugins, run experiments, inspect durable evidence, and automate the platform without opening the browser.",
    badges: ["Scriptable", "JSON output", "Same core", "Local runs"],
    sections: [
      {
        title: "Discover registered components",
        body: "These commands print the environments, agents, and plugins registered by the CLI process. IDs shown here are the IDs accepted by run commands.",
        code: "pnpm arena environments\npnpm arena agents\npnpm arena plugins"
      },
      {
        title: "Launch an experiment",
        body: "Choose a world and agent. Multi-participant environments can also receive an opponent. The CLI selects the correct default evaluator and stores the resulting run under .arena/runs.",
        code: "pnpm arena run royal-chess-v1 --agent royal-greedy --opponent royal-positional\npnpm arena run biocraft-v1 --agent biocraft-researcher\npnpm arena run agent-rumble-v1 --agent rumble-tactician"
      },
      {
        title: "Control budgets and output",
        body: "Use step, token, cost, and evaluator options to make runs bounded and repeatable. JSON and quiet modes make the command suitable for scripts and CI.",
        code: "--max-steps <number>\n--max-tokens <number>\n--max-cost-usd <number>\n--evaluators <id,id>\n--json\n--quiet"
      },
      {
        title: "Inspect persisted evidence",
        body: "List run history, inspect a single record, or render the textual reference replay. Rich environment-specific replays remain available in the web interface.",
        code: "pnpm arena runs\npnpm arena inspect <run-id>\npnpm arena replay <run-id>"
      },
      {
        title: "Model-backed runs",
        body: "When OPENROUTER_API_KEY is configured, model agents appear in the same agent registry as defaults. Pass the selected registered agent ID to --agent or --opponent; credentials never appear in CLI output or run configuration."
      }
    ]
  },
  {
    slug: "api",
    category: "Operate",
    eyebrow: "CONTROL PLANE",
    title: "REST and WebSocket API",
    intro: "The web experience uses the same public execution surface available to local tools and future hosted clients.",
    badges: ["Fastify", "REST", "WebSocket", "Normalized events"],
    sections: [
      {
        title: "Health and registries",
        body: "Check service health and read the components registered in the running system.",
        code: "GET /api/health\nGET /api/environments\nGET /api/agents\nGET /api/evaluators"
      },
      {
        title: "Run lifecycle",
        body: "Create a persisted experiment, list run history, and retrieve its normalized record, events, summary, or replay.",
        code: "POST /api/runs\nGET /api/runs\nGET /api/runs/:runId\nGET /api/runs/:runId/events\nGET /api/runs/:runId/replay"
      },
      {
        title: "Human turns",
        body: "When a human participant is active, submit a normalized action without bypassing orchestration or the environment validator.",
        code: "POST /api/runs/:runId/actions"
      },
      {
        title: "Live stream",
        body: "The socket sends a run snapshot followed by normalized event packets. Clients should reconnect and recover from REST when needed.",
        code: "WS /ws/runs/:runId"
      },
      {
        title: "Secrets and deployment",
        body: "Provider keys remain in the API process. The browser submits environment IDs, participant assignments, agent IDs, and run configuration—never API credentials."
      }
    ]
  },
  {
    slug: "environment-contract",
    category: "Build",
    eyebrow: "BUILD WORLDS",
    title: "Environment contract",
    intro: "A world implements a typed lifecycle, owns authoritative state, and declares the actions it accepts.",
    badges: ["Typed lifecycle", "Schemas", "Serializable state", "Replay"],
    sections: [
      {
        title: "Lifecycle",
        body: "Initialize once, reset per episode, process validated actions through step, expose state, and close cleanly.",
        code: "initialize(context)\nreset(input)\nstep(action)\ngetState()\nclose()"
      },
      {
        title: "Schemas and capabilities",
        body: "Action and observation schemas make integrations inspectable and allow the core to reject malformed actions before they reach world logic. Metadata declares deterministic, real-time, multi-agent, rendering, snapshot, and seeding capabilities."
      },
      {
        title: "Authority",
        body: "Rules, legal actions, rewards, terminal conditions, and canonical state belong in the environment plugin. A web renderer may animate the state but must never compute a competing outcome."
      },
      {
        title: "Participants",
        body: "Multi-agent worlds identify the active participant in observations. The orchestrator routes the next action to that participant's registered agent or waits for a normalized human action."
      },
      {
        title: "Replay",
        body: "Renderable environments expose serializable state and stable semantic actions so ArenaOS can persist frames and reconstruct behavior without rerunning agents or external models."
      }
    ]
  },
  {
    slug: "environment-builder",
    category: "Build",
    eyebrow: "CODEX WORKBENCH",
    title: "Build an environment",
    intro: "Turn a creative brief into a reviewable ArenaOS plugin inside a guarded generation and validation workflow.",
    badges: ["Isolated workspace", "Network off", "Validation gates", "Approval required"],
    sections: [
      {
        title: "Connect the builder",
        body: "Add OPENAI_API_KEY to .env.local and optionally choose OPENAI_CODEX_MODEL, then restart the development process. The key stays in the Fastify process and is never sent to Next.js or generated workspaces.",
        code: "OPENAI_API_KEY=...\nOPENAI_CODEX_MODEL=...\npnpm dev"
      },
      {
        title: "Write a concrete brief",
        body: "Describe the world, visual direction, mechanics, agent behavior, action space, scoring, and completion conditions. Specific constraints produce a stronger first candidate than a one-line genre prompt."
      },
      {
        title: "Generation is isolated",
        body: "Each build receives its own workspace with network access disabled. A failed generation or validation does not edit the production registry or the six showcase environments."
      },
      {
        title: "Pass every gate",
        body: "ArenaOS checks package structure, manifest schema, reachable world behavior, dependencies, lifecycle compliance, and deterministic replay before exposing a review preview."
      },
      {
        title: "Review before registration",
        body: "Inspect generated artifacts and validation evidence, then explicitly approve registration. The production registry changes only after every required gate passes and the user approves the candidate."
      }
    ]
  },
  {
    slug: "royal-chess",
    category: "Showcase worlds",
    eyebrow: "FLAGSHIP WORLD 01",
    title: "Royal Chess Arena",
    intro: "A multi-agent 3D chess environment whose rules, events, evaluations, and replay remain authoritative in ArenaOS.",
    badges: ["Strategy", "Multi-agent", "3D", "Deterministic replay"],
    image: "/docs/royal-chess.png",
    imageAlt: "Royal Chess Arena 3D board and participant interface",
    worldHref: "/environments/royal-chess-v1",
    sections: [
      {
        title: "Independent competitors",
        body: "White and black are separate ArenaOS participants. Agent-versus-agent matches can assign different local or model-backed agents to each side; human-versus-agent uses the same turn router and action contract.",
        code: "royal-greedy vs royal-positional\nOpenRouter model vs OpenRouter model\nhuman vs registered agent"
      },
      {
        title: "Authoritative chess rules",
        body: "Agents receive FEN, PGN, legal moves, status, material, and move context. They return one normalized chess.move action. The backend chess.js engine alone decides legality.",
        code: "{\n  \"type\": \"chess.move\",\n  \"arguments\": { \"from\": \"e2\", \"to\": \"e4\" }\n}"
      },
      {
        title: "Human control",
        body: "Click or drag a piece and select a legal destination. The browser submits the same normalized move used by agents, then waits for authoritative state before animating the result."
      },
      {
        title: "Evidence and replay",
        body: "Every accepted move stores SAN, UCI, FEN before and after, captures, check state, normalized events, timing, evaluation, and a serializable board snapshot. Replay never calls either competitor."
      }
    ]
  },
  {
    slug: "biocraft",
    category: "Showcase worlds",
    eyebrow: "SCIENTIFIC WORLD 02",
    title: "BioCraft",
    intro: "An offline protein-mutation workbench where every scientific result is derived from bundled data or deterministic local computation.",
    badges: ["Protein analysis", "Offline tools", "Grounded evidence", "Human or agent"],
    image: "/docs/biocraft.png",
    imageAlt: "BioCraft protein mutation workbench with sequence, structure, and task progress",
    worldHref: "/environments/biocraft-v1",
    sections: [
      {
        title: "Grounded challenge pack",
        body: "The first task uses the real 76-residue human ubiquitin sequence and RCSB 1UBQ structure, bundled homologs, curated annotations, mutation candidates, provenance, and separately loaded ground truth.",
        code: "plugins/biocraft/challenges/protein-mutation/ubiquitin-preservation-001/"
      },
      {
        title: "Local scientific tools",
        body: "BioCraft calculates sequence composition, molecular weight, charge, pI, hydropathy, homolog conservation, entropy, BLOSUM62 evidence, physicochemical deltas, validated mutations, alignments, and structure neighborhoods without runtime network access.",
        code: "biology.inspect_sequence\nbiology.align_sequences\nbiology.score_substitution\nbiology.apply_mutation\nbiology.inspect_structure"
      },
      {
        title: "Scientific integrity",
        body: "Ground truth is absent from observations and frontend state until submission. Capabilities such as FoldX, Rosetta, DSSP, and unrestricted Python are reported unavailable instead of being replaced with scripted values."
      },
      {
        title: "Evaluation and replay",
        body: "The evaluator scores ranking accuracy, recommendation accuracy, evidence grounding, constraints, tool efficiency, confidence, and report completeness. Every tool result and transition is persisted."
      }
    ]
  },
  {
    slug: "chemcraft",
    category: "Showcase worlds",
    eyebrow: "SCIENTIFIC WORLD 03",
    title: "ChemCraft",
    intro: "An offline molecular-optimization arena powered by a project-local RDKit scientific worker.",
    badges: ["RDKit", "Molecular optimization", "3D conformers", "Offline"],
    image: "/docs/chemcraft.png",
    imageAlt: "ChemCraft molecular optimization interface with interactive 3D molecule",
    worldHref: "/environments/chemcraft-v1",
    sections: [
      {
        title: "Versioned challenge pack",
        body: "The first challenge bundles one lead graph, eight sanitized analogues, explicit SMARTS and descriptor constraints, provenance, a hidden scoring profile, and separately loaded ground truth.",
        code: "plugins/chemcraft/challenges/molecular-optimization/balanced-lead-001/"
      },
      {
        title: "Real local chemistry",
        body: "A Python JSON worker runs RDKit locally for parsing, sanitization, canonical SMILES, formulas, descriptors, SMARTS matching, Morgan fingerprints, Tanimoto similarity, SVG depictions, ETKDGv3 conformers, and force-field optimization.",
        code: "chemistry.inspect_molecule\nchemistry.calculate_descriptors\nchemistry.calculate_similarity\nchemistry.validate_molecule\nchemistry.generate_conformers"
      },
      {
        title: "Honest scientific boundaries",
        body: "Calculated LogP is labelled heuristic, similarity is not chemical or biological equivalence, and conformer energies are force-field estimates. The environment makes no efficacy, toxicity, yield, safety, or experimental-stability claims."
      },
      {
        title: "Independent evaluation",
        body: "After submission, the evaluator reruns RDKit, verifies the ranking against the versioned profile, scores utility, hard constraints, evidence, efficiency, confidence, and completeness, then persists the run and replay."
      }
    ]
  },
  {
    slug: "agent-rumble",
    category: "Showcase worlds",
    eyebrow: "COMBAT WORLD 04",
    title: "Agent Rumble",
    intro: "A deterministic multi-agent combat arena with animated fighters, tactical action space, broadcast audio, and authoritative RumbleCore state.",
    badges: ["Combat", "2–4 fighters", "3D broadcast", "Audio"],
    image: "/docs/agent-rumble.png",
    imageAlt: "Agent Rumble fantasy arena with animated fighters and combat HUD",
    worldHref: "/environments/agent-rumble-v1",
    sections: [
      {
        title: "Lockstep fighting mechanics",
        body: "Every living fighter submits one structured decision per round. RumbleCore resolves movement, stamina, defense, attacks, grapples, abilities, damage, knockback, hazards, knockouts, and ring-outs in stable seeded order.",
        code: "combat.move_to\ncombat.attack\ncombat.defend\ncombat.grapple\ncombat.use_ability\ncombat.wait"
      },
      {
        title: "Real multi-participant routing",
        body: "Duel, two-versus-two, and four-fighter configurations use ArenaOS participants. Each slot can run the aggressive default fighter or a selected model-backed agent."
      },
      {
        title: "Renderer follows authority",
        body: "The React Three Fiber coliseum animates persisted positions, body actions, hits, abilities, and outcomes. It never computes a parallel browser-only result, keeping live view and replay faithful."
      },
      {
        title: "Results and rematches",
        body: "A completed match reports placement, eliminations, damage efficiency, defensive activity, legality, and completion. Rematch resets the complete ArenaOS run flow rather than reusing terminal client state."
      }
    ]
  },
  {
    slug: "personacraft",
    category: "Showcase worlds",
    eyebrow: "LANGUAGE WORLD 05",
    title: "PersonaCraft",
    intro: "A live studio debate where language actions change reputation, trust, influence, alliances, audience response, and collective decisions.",
    badges: ["Language agents", "Private objectives", "3D studio", "Synced speech"],
    image: "/docs/personacraft.png",
    imageAlt: "PersonaCraft media debate stage with candidates, audience, and live transcript",
    worldHref: "/environments/personacraft-v1",
    sections: [
      {
        title: "One shared council engine",
        body: "Debate, negotiation, crisis, trial, and social deduction use the same authoritative phases: speaking, cross-examination, negotiation, and voting. Modes change incentives, not integration."
      },
      {
        title: "Structured language actions",
        body: "Statements include stance and rhetorical mode; evidence references unlocked facts; negotiations contain explicit offers; alliances and votes modify persisted social state.",
        code: "persona.speak\npersona.question\npersona.challenge\npersona.negotiate\npersona.form_alliance\npersona.present_evidence\npersona.vote"
      },
      {
        title: "Private information",
        body: "Each participant receives its own objective through the observation contract. Private objectives stay out of public state and live replay frames until the council completes."
      },
      {
        title: "Synchronized stage and speech",
        body: "The active speaker, overhead points, transcript, camera emphasis, and optional browser speech are driven by the same current turn. Advancing waits for the prior utterance to stop, keeping model responses and audio aligned."
      },
      {
        title: "Explainable evaluation",
        body: "A deterministic lexical evaluator measures logic, evidence use, persuasion, persona consistency, communication efficiency, information gain, and objective progress without claiming private chain-of-thought."
      }
    ]
  },
  {
    slug: "physical-ai",
    category: "Showcase worlds",
    eyebrow: "PHYSICAL WORLD 06",
    title: "Physical AI Mission Lab",
    intro: "A factory-scale robotics mission where high-level intent becomes validated behavior, authoritative world state, objective evaluation, and replay.",
    badges: ["Robotics", "Multi-agent", "Safety", "3D factory"],
    image: "/docs/physical-ai.png",
    imageAlt: "Physical AI Mission Lab factory with mobile robots, gantry arm, conveyor, and hazards",
    worldHref: "/environments/physical-ai-mission-lab-v1",
    sections: [
      {
        title: "Warehouse Rescue Relay",
        body: "The mission contains two differential-drive robots, a fixed gantry arm, damaged conveyor, blocked aisle, thermal hazard, priority package, charger, clearance bay, extraction zone, and mission clock."
      },
      {
        title: "Structured embodied actions",
        body: "Agents operate tactically while the runtime handles path interpolation, battery use, manipulation constraints, range checks, route blocking, payload attachment, and extraction-volume detection.",
        code: "mission.submit_plan\nrobot.navigate\nrobot.inspect\nrobot.push\nrobot.activate_station\nrobot.place\nrobot.charge\nrobot.stop\nteam.signal"
      },
      {
        title: "Human and model control",
        body: "Human operators choose targets and submit the same structured actions as agents. The fast default mission coordinator and selected model agents share one observation and validation boundary."
      },
      {
        title: "Safety and evaluation",
        body: "Validation checks ownership, capability, phase, target existence, range, bounds, blocked routes, grasp requirements, extraction containment, and charging position. Scoring weighs completion, time, safety, energy, coordination, recovery, and validity."
      },
      {
        title: "Snapshots and reruns",
        body: "ArenaOS stores every semantic action and mission state, with snapshots at major milestones. Replay uses stored transforms without rerunning the policy, while rerun creates a fresh mission and participant lifecycle."
      }
    ]
  }
];

export function findDoc(slug: string) {
  return docs.find((doc) => doc.slug === slug);
}
