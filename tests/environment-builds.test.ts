import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createArenaSystem } from "@arena/core";
import {
  EnvironmentBuildService,
  type CodexBuildRunner,
  type CodexBuildRunOptions,
  type EnvironmentBuildRecord
} from "../apps/api/src/environment-builds.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("Codex environment build pipeline", () => {
  it("generates, validates, previews, approves, and restores a safe environment", async () => {
    const root = await workspace();
    const system = createArenaSystem();
    const runner = new ManifestRunner();
    const builds = new EnvironmentBuildService(system, runner, join(root, "builds"), join(root, "registry"));

    const created = await builds.create({
      prompt: "A moon archive where an agent navigates quiet stacks to recover a lost star map.",
      category: "navigation",
      visualStyle: "moonlit archive"
    });
    expect(created.status).toBe("created");

    const validated = await waitFor(builds, created.id, "awaiting_approval");
    expect(validated.validation).toHaveLength(6);
    expect(validated.validation.every((check) => check.status === "passed")).toBe(true);
    expect(system.registries.environments.has("moon-archive-v1")).toBe(false);

    const preview = await builds.preview(created.id);
    expect(preview.manifest.id).toBe("moon-archive-v1");
    expect(preview.state.agent).toEqual({ x: 0, y: 0 });
    const artifacts = await builds.artifacts(created.id);
    expect(artifacts.map((artifact) => artifact.path)).toContain("environment.json");

    const approved = await builds.approve(created.id);
    expect(approved.status).toBe("approved");
    expect(system.registries.environments.has("moon-archive-v1")).toBe(true);

    const restartedSystem = createArenaSystem();
    const restartedBuilds = new EnvironmentBuildService(restartedSystem, runner, join(root, "builds"), join(root, "registry"));
    await restartedBuilds.loadApproved();
    expect(restartedSystem.registries.environments.has("moon-archive-v1")).toBe(true);
  });

  it("does not register invalid Codex output", async () => {
    const root = await workspace();
    const system = createArenaSystem();
    const builds = new EnvironmentBuildService(system, new InvalidManifestRunner(), join(root, "builds"), join(root, "registry"));
    const created = await builds.create({ prompt: "Create a broken maze specifically to exercise validation safety." });
    const failed = await waitFor(builds, created.id, "failed");
    expect(failed.error).toContain("Validation failed");
    expect(system.registries.environments.list()).toHaveLength(0);
    await expect(builds.approve(created.id)).rejects.toThrow("must pass validation");
  });

  it("recovers an interrupted build as retryable after an API restart", async () => {
    const root = await workspace();
    const buildId = "interrupted-build";
    const buildDirectory = join(root, "builds", buildId);
    await mkdir(buildDirectory, { recursive: true });
    await writeFile(join(buildDirectory, "build.json"), JSON.stringify({
      id: buildId,
      status: "generating",
      request: { prompt: "Build a small arithmetic puzzle." },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      events: [],
      validation: []
    }), "utf8");

    const builds = new EnvironmentBuildService(
      createArenaSystem(),
      new ManifestRunner(),
      join(root, "builds"),
      join(root, "registry")
    );
    await builds.loadApproved();

    const recovered = await builds.get(buildId);
    expect(recovered?.status).toBe("failed");
    expect(recovered?.error).toContain("Retry the build");
    expect(recovered?.events.at(-1)?.type).toBe("environment_build.validation_failed");
  });

  it("restores a corrupt manifest template before retrying a failed build", async () => {
    const root = await workspace();
    const runner = new CorruptThenRepairRunner();
    const builds = new EnvironmentBuildService(
      createArenaSystem(), runner, join(root, "builds"), join(root, "registry")
    );
    const created = await builds.create({ prompt: "Build a friendly arithmetic path puzzle." });
    await waitFor(builds, created.id, "failed");

    await builds.refine(created.id, "Retry with the canonical manifest.");
    const repaired = await waitFor(builds, created.id, "awaiting_approval");
    expect(repaired.validation.every((check) => check.status === "passed")).toBe(true);
  });
});

class ManifestRunner implements CodexBuildRunner {
  isConfigured(): boolean { return true; }
  async run(options: CodexBuildRunOptions): Promise<{ threadId: string }> {
    const path = join(options.workspace, "environment.json");
    const manifest = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
    Object.assign(manifest, {
      id: "moon-archive-v1",
      name: "Moon Archive",
      description: "Recover a lost star map from a deterministic moonlit archive.",
      instructions: "Navigate through the archive shelves and reach the star map goal.",
      category: "navigation",
      tags: ["archive", "navigation", "deterministic"]
    });
    await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    options.onEvent({ type: "environment_build.file_changed", message: "Updated environment.json" });
    return { threadId: options.threadId ?? "test-thread" };
  }
}

class InvalidManifestRunner implements CodexBuildRunner {
  isConfigured(): boolean { return true; }
  async run(options: CodexBuildRunOptions): Promise<{ threadId: string }> {
    const path = join(options.workspace, "environment.json");
    const manifest = JSON.parse(await readFile(path, "utf8")) as { world: { goal: { x: number; y: number } } };
    manifest.world.goal = { x: 99, y: 99 };
    await writeFile(path, JSON.stringify(manifest), "utf8");
    return { threadId: "invalid-thread" };
  }
}

class CorruptThenRepairRunner implements CodexBuildRunner {
  #attempt = 0;
  isConfigured(): boolean { return true; }
  async run(options: CodexBuildRunOptions): Promise<{ threadId: string }> {
    this.#attempt += 1;
    if (this.#attempt === 1) {
      await writeFile(join(options.workspace, "environment.json"), "", "utf8");
      throw new Error("Simulated interrupted write.");
    }
    return new ManifestRunner().run(options);
  }
}

async function workspace(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "arena-build-test-"));
  temporaryDirectories.push(path);
  return path;
}

async function waitFor(
  service: EnvironmentBuildService,
  id: string,
  status: EnvironmentBuildRecord["status"]
): Promise<EnvironmentBuildRecord> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const record = await service.get(id);
    if (record?.status === status) return record;
    if (record?.status === "failed" && status !== "failed") throw new Error(record.error);
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
  }
  throw new Error(`Build did not reach ${status}.`);
}
