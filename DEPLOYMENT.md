# ArenaOS deployment boundary

The current deployment shape keeps one public origin in front of two services:

```text
Browser
  |
  v
Caddy :80/:443
  |-- /api/* and /ws/* --> Fastify :4000
  `-- everything else --> Next.js :3000
```

This is ready for local container verification and maps cleanly to a single AWS
host for the hackathon. No AWS resources are created by this repository.

## Local production containers

Copy the example environment file and set the domain:

```bash
cp .env.production.example .env.production
docker compose --env-file .env.production -f docker-compose.prod.yml up --build
```

For a local-only check, leave `ARENA_DOMAIN=localhost` and open
`http://localhost`.

Run records live in the `arena-runs` Docker volume. The web container never
executes environments and has no access to that volume.

## AWS target

For the hackathon, the smallest operational target is one EC2 instance with:

- Docker Engine and Compose
- ports 80 and 443 open
- a DNS A record pointing at the instance
- an attached volume or EBS-backed Docker data directory

Set `ARENA_DOMAIN` to the DNS name and start the production Compose file. Caddy
will terminate TLS and proxy WebSocket upgrades. The same images can later move
behind an Application Load Balancer or into ECS without changing the browser API
contract.

## Runtime variables

| Variable | Service | Purpose |
| --- | --- | --- |
| `ARENA_SERVER_URL` | Next.js | Server-side REST rewrite destination |
| `PORT` | Fastify | API listener port, defaults to `4000` |
| `ARENA_HOST` | Fastify | Listener host; production uses `0.0.0.0` |
| `ARENA_STORAGE_DIRECTORY` | Fastify | Durable run-record location |
| `ARENA_DOMAIN` | Caddy | Public hostname |

## Railway single-image deployment

Railway uses the dedicated `Dockerfile.railway` image. This leaves the existing
development commands and Compose deployment unchanged while packaging the complete
platform into one Railway service:

```text
Railway $PORT -> Caddy
  /api/* and /ws/* -> Fastify :4000
  everything else -> Next.js :3000
```

The image also contains Python, RDKit, and the project-local Codex CLI so ChemCraft
and the environment workshop retain their real server-side capabilities.

Build and test locally:

```bash
docker build -f Dockerfile.railway -t arenaos:railway .
docker run --rm -p 8080:8080 -e PORT=8080 \
  -e ARENA_STORAGE_DIRECTORY=/data/runs \
  -v arenaos-data:/data arenaos:railway
```

Open `http://localhost:8080` and verify `http://localhost:8080/api/health`.

### GitHub Container Registry

The `Publish Railway image` workflow publishes these tags from `main`:

```text
ghcr.io/amanweb70/arenaos:latest
ghcr.io/amanweb70/arenaos:sha-<commit>
```

The GHCR package must be public for credential-free Railway pulls. A private GHCR
package requires Railway registry credentials and an eligible Railway plan.

### Railway service

1. Create a Railway project and choose **Docker Image**.
2. Enter `ghcr.io/amanweb70/arenaos:latest`.
3. Add the variables from `railway.env.example`; never define `PORT` yourself.
4. Attach a Railway Volume at `/data`.
5. Configure the health-check path as `/api/health`.
6. Generate a Railway public domain.
7. Keep the service at one replica while it uses the filesystem run repository.

The `/data` mount persists runs, replay frames, Codex build records, and approved
generated environments across deployments. Model-provider keys are runtime Railway
secrets and are never copied into the image.
