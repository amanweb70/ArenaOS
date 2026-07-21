# ArenaOS

ArenaOS is engine-independent infrastructure for running, observing, evaluating, benchmarking, and replaying AI agents inside interactive environments.

The repository contains the complete local platform: shared contracts, plugin registries, orchestration, durable evidence, CLI and API surfaces, a judge-facing Next.js application, model-backed agents, a guarded Codex environment builder, and six production showcase worlds.

## Platform capabilities

- Shared TypeScript contracts for environments, agents, runtimes, evaluators, events, runs, and plugins
- Generic registries and plugin manager
- In-process environment runtime
- Experiment orchestrator and episode loop
- JSON Schema action validation with Ajv
- Normalized event stream
- In-memory and local JSON run repositories
- Recorded replay frames
- Headless Grid environment plugin
- Royal Chess Arena environment with authoritative chess.js rules
- BioCraft computational biology environment with offline protein-analysis tools
- Curated 1UBQ challenge pack with RCSB and UniProt provenance
- Real sequence metrics, homolog conservation, BLOSUM62 scoring, mutation FASTA artifacts, and structure neighborhoods
- Deterministic BioCraft scientific evaluator with isolated ground truth
- Human-operated and scripted BioCraft research workflows through the same action endpoint
- ChemCraft offline molecular-optimization environment with a project-local RDKit 2025.03.5 worker
- Real molecular sanitization, descriptors, SMARTS groups, Morgan/Tanimoto similarity, validation, SVG depictions, and seeded ETKDG conformers
- Deterministic ChemCraft evaluator with independently recalculated hidden utility and evidence-linked ranking
- Interactive 2D and 3D molecular workbench with human and scripted research modes
- Agent Rumble deterministic combat with duel, team, Royal Rumble, human control, scoring, 3D broadcast, and replay
- PersonaCraft multi-persona debate and negotiation with private objectives, synchronized speech, social-state evaluation, 3D studio, and replay
- Physical AI Mission Lab with multi-robot planning, manipulation constraints, safety validation, detailed factory renderer, and replay
- Multi-participant turn routing for independent white and black agents
- Crown Tactician and Court Strategist deterministic chess baselines
- Chess result and legal-action-rate evaluators
- Deterministic shortest-path agent plugin
- OpenRouter agent plugin for live closed and open-source models through one private API key
- Per-turn provider/model/latency/token/cost telemetry with aggregate run budgets
- Success, step-efficiency, invalid-action, and collision evaluators
- CLI for listing, running, inspecting, and replaying
- Fastify REST control API
- Live WebSocket run-event streaming
- Next.js judge-facing webapp with environment discovery, live runs, replay, benchmarks, Codex environment builder, and docs
- Codex App Server environment generation in isolated per-build workspaces
- Persisted build activity, refinement, validation, preview, explicit approval, and restart-safe dynamic registration
- Integration tests for the complete execution path

The curated manual is available in the running app at `http://localhost:3000/docs`. It includes the platform overview, architecture, CLI, API, environment-builder workflow, and illustrated guides for all six showcase worlds.

## Getting started

Requirements:

- Node.js 22 or newer
- pnpm 10 or newer

Install and verify:

```bash
pnpm install
pnpm check
```

Run the architectural proof:

```bash
pnpm arena run headless-grid --agent scripted-agent
```

Run a Royal Chess match:

```bash
pnpm arena run royal-chess-v1 --agent royal-greedy --opponent royal-positional --max-steps 80
```

Run the offline BioCraft protein-mutation challenge:

```bash
pnpm arena run biocraft-v1 --agent biocraft-researcher --max-steps 16
```

Run the offline ChemCraft molecular-optimization challenge:

```bash
pnpm arena run chemcraft-v1 --agent chemcraft-researcher --max-steps 12
```

Run a four-fighter Agent Rumble match:

```bash
pnpm arena run agent-rumble-v1 --agent rumble-tactician --max-steps 140
```

Run PersonaCraft's deterministic Grand AI Council:

```bash
pnpm arena run personacraft-v1 --agent council-strategist --max-steps 40
```

Run the Physical AI Warehouse Rescue Relay:

```bash
pnpm arena run physical-ai-mission-lab-v1 --agent mission-coordinator --max-steps 24
```

ChemCraft uses the project-local Python worker under `services/chemcraft-worker`.
Install its pinned open-source dependency if the vendored runtime is unavailable:

```bash
python -m pip install --target services/chemcraft-worker/vendor -r services/chemcraft-worker/requirements.txt
```

Inspect persisted runs:

```bash
pnpm arena runs
pnpm arena inspect <run-id>
pnpm arena replay <run-id>
```

Run data is stored under `.arena/runs/`.

## Run real models through OpenRouter

Copy .env.example to .env.local and add OPENROUTER_API_KEY. ArenaOS registers
its curated judge roster automatically: GPT-5.5, Claude Opus 4.8, Grok 4.5,
DeepSeek V4 Pro, Kimi K3, Llama 4 Maverick, and OpenRouter Auto. Use
OPENROUTER_MODELS only to append optional extra comma-separated model slugs.

The API key is loaded only by the Fastify API and CLI. It is never returned by
GET /api/agents, written into run records, or exposed through a
NEXT_PUBLIC_ variable.

List the registered live agents:

    pnpm arena agents

Run one from the CLI:

    pnpm arena run headless-grid --agent openrouter:openrouter/auto --max-tokens 10000 --max-cost-usd 1

Every showcase environment exposes the same live agents in its launcher.
Multi-agent worlds permit an independent controller for each AI participant.

## Build environments with Codex

Add a separate OpenAI key to `.env.local` (the builder never reuses the
OpenRouter credential):

```text
OPENAI_API_KEY=your-openai-api-key
OPENAI_CODEX_MODEL=gpt-5.6-sol
```

Restart `pnpm dev`, then open `http://localhost:3000/build`. Codex edits only a
per-build generated package workspace. ArenaOS validates its manifest, action
schema, path safety, dependency allowlist, lifecycle, snapshots, and deterministic
replay. The environment is not copied into the generated registry until you click
**Approve & Register**.

Generated build records and approved packages are stored under
`.arena/environment-builds/` and `.arena/generated-environments/`. Approved
environments are restored into the registry when the API restarts.

## Run the judge-facing webapp

Start the complete local stack:

```bash
pnpm dev
```

Open `http://localhost:3000`. The Next.js app proxies REST requests to Fastify,
and live run events stream over WebSocket.

The API listens on `http://127.0.0.1:4000` by default. Useful endpoints include:

```text
GET  /api/health
GET  /api/environments
GET  /api/agents
GET  /api/openrouter/status
GET  /api/environment-builds/status
POST /api/environment-builds
GET  /api/environment-builds/:buildId
POST /api/environment-builds/:buildId/messages
POST /api/environment-builds/:buildId/cancel
POST /api/environment-builds/:buildId/approve
GET  /api/environment-builds/:buildId/artifacts
GET  /api/environment-builds/:buildId/preview
GET  /api/evaluators
POST /api/runs
POST /api/runs/:runId/actions
GET  /api/runs
GET  /api/runs/:runId
GET  /api/runs/:runId/events
GET  /api/runs/:runId/replay
WS   /ws/runs/:runId
WS   /ws/environment-builds/:buildId
```

## Architecture

```text
@arena/contracts
      |
      v
@arena/core
  registries
  plugin manager
  event bus
  run storage
  local runtime
  orchestrator
      |
      +--------------------+
      |                    |
      v                    v
environment plugins   agent/evaluator plugins
      |
      v
CLI + Fastify API + WebSocket + Next.js judge experience
```

The orchestrator only resolves implementations through registries. It does not import Headless Grid or the scripted agent, which keeps the platform core independent of environment technology.

## Web routes

```text
/                              platform landing page
/environments                  registered environment gallery
/environments/:environmentId   environment detail and real run launcher
/runs                          persisted run history
/runs/:runId                   live workspace and stored replay
/benchmarks                    authentic aggregation from completed runs
/build                         Codex-powered environment builder and approval workbench
/docs/*                        platform and integration documentation
```

Royal Chess Arena, BioCraft, ChemCraft, Agent Rumble, PersonaCraft, and Physical AI Mission Lab are the six showcase environments.
Headless Grid remains the compact reference environment for learning and testing the platform architecture.

Production container boundaries and the later AWS deployment shape are documented
in `DEPLOYMENT.md`.

## Railway container

ArenaOS also ships as one Railway-ready image containing the Next.js experience,
Fastify control plane, same-origin WebSocket gateway, Python/RDKit worker, and Codex
CLI:

```text
ghcr.io/amanweb70/arenaos:latest
```

The image is built from `Dockerfile.railway` and published by GitHub Actions. See
`DEPLOYMENT.md` for the `/data` volume, health check, variables, and Railway setup.
