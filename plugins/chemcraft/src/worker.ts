import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { delimiter, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const pluginDirectory = fileURLToPath(new URL("..", import.meta.url));
const workspaceDirectory = resolve(pluginDirectory, "..", "..");
const workerDirectory = join(workspaceDirectory, "services", "chemcraft-worker");
const workerPath = join(workerDirectory, "worker.py");
const vendorPath = join(workerDirectory, "vendor");

export type ChemWorkerCapabilities = {
  rdkit: { available: boolean; version?: string };
  python: { available: boolean; version?: string };
  openBabel: { available: boolean; version?: string };
  xtb: { available: boolean; version?: string; methods?: string[] };
  networkAccess: false;
};

export function callChemWorker<T>(
  method: string,
  params: Record<string, unknown> = {},
  timeoutMs = 30_000
): T {
  const request = { id: randomUUID(), method, params };
  const result = spawnSync(findPython(), [workerPath], {
    input: JSON.stringify(request),
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 20 * 1024 * 1024,
    windowsHide: true,
    env: {
      ...process.env,
      PYTHONIOENCODING: "utf-8",
      PYTHONNOUSERSITE: "1",
      PYTHONPATH: [vendorPath, process.env.PYTHONPATH].filter(Boolean).join(delimiter),
      NO_PROXY: "*",
      HTTP_PROXY: "",
      HTTPS_PROXY: ""
    }
  });
  if (result.error) {
    throw new Error(`ChemCraft worker failed to launch: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(
      `ChemCraft worker exited with status ${result.status}: ${result.stderr.trim()}`
    );
  }
  const response = JSON.parse(result.stdout) as {
    id: string;
    ok: boolean;
    result?: T;
    error?: { type: string; message: string };
  };
  if (!response.ok || !response.result) {
    throw new Error(
      `ChemCraft worker ${response.error?.type ?? "error"}: ${
        response.error?.message ?? "unknown failure"
      }`
    );
  }
  return response.result;
}

export function discoverChemCapabilities(): ChemWorkerCapabilities {
  return callChemWorker<ChemWorkerCapabilities>("capabilities");
}

function findPython(): string {
  const explicit = process.env.CHEMCRAFT_PYTHON;
  if (explicit) return explicit;
  const userProfile = process.env.USERPROFILE;
  if (userProfile) {
    const bundled = join(
      userProfile,
      ".cache",
      "codex-runtimes",
      "codex-primary-runtime",
      "dependencies",
      "python",
      "python.exe"
    );
    if (existsSync(bundled)) return bundled;
  }
  return process.platform === "win32" ? "python.exe" : "python3";
}

export const chemWorkerPaths = { workerDirectory, workerPath, vendorPath };
