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
