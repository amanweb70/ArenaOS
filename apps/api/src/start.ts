import { buildArenaApi } from "./server.js";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { resolve } from "node:path";

for (const file of [".env.local", ".env"]) {
  const path = resolve(process.cwd(), file);
  if (existsSync(path)) loadEnvFile(path);
}

const port = Number(process.env.PORT ?? process.env.ARENA_PORT ?? 4000);
const host =
  process.env.ARENA_HOST ??
  (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");
const { app } = await buildArenaApi({ logger: true });

try {
  const address = await app.listen({ port, host });
  app.log.info(`ArenaOS control plane listening at ${address}`);
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
