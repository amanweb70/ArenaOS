import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { existsSync } from "node:fs";
import { cp, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { createInterface } from "node:readline";
import { Ajv } from "ajv";
import type { ArenaSystem } from "@arena/core";
import {
  createGeneratedEnvironmentFactory,
  type GeneratedEnvironmentManifest,
  type GeneratedEnvironmentState
} from "@arena/plugin-generated-environment";

export type EnvironmentBuildStatus =
  | "created"
  | "generating"
  | "validating"
  | "awaiting_approval"
  | "approved"
  | "failed"
  | "cancelled";

export interface EnvironmentBuildRequest {
  prompt: string;
  category?: string;
  visualStyle?: string;
  mechanics?: string;
  agents?: string;
  scoring?: string;
}

export interface EnvironmentBuildEvent {
  id: string;
  type: string;
  timestamp: string;
  message: string;
  data?: Record<string, unknown>;
}

export interface ValidationCheck {
  id: string;
  label: string;
  status: "passed" | "failed";
  detail: string;
}

export interface EnvironmentBuildRecord {
  id: string;
  status: EnvironmentBuildStatus;
  request: EnvironmentBuildRequest;
  createdAt: string;
  updatedAt: string;
  threadId?: string;
  environmentId?: string;
  error?: string;
  events: EnvironmentBuildEvent[];
  validation: ValidationCheck[];
}

export interface EnvironmentBuildArtifact {
  path: string;
  mediaType: string;
  content: string;
}

export interface EnvironmentBuildPreview {
  manifest: GeneratedEnvironmentManifest;
  state: GeneratedEnvironmentState;
}

export interface CodexBuildRunOptions {
  workspace: string;
  prompt: string;
  threadId?: string;
  signal: AbortSignal;
  onEvent: (event: { type: string; message: string; data?: Record<string, unknown> }) => void;
}

export interface CodexBuildRunner {
  run(options: CodexBuildRunOptions): Promise<{ threadId: string }>;
  isConfigured(): boolean;
}

interface JsonRpcMessage {
  id?: number | string;
  method?: string;
  params?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: { code?: number; message?: string };
}

export class CodexAppServerRunner implements CodexBuildRunner {
  constructor(
    private readonly options: {
      apiKey?: string;
      binary?: string;
      model?: string;
      timeoutMs?: number;
    } = {}
  ) {}

  isConfigured(): boolean {
    return Boolean(this.options.apiKey ?? process.env.OPENAI_API_KEY);
  }

  async run(options: CodexBuildRunOptions): Promise<{ threadId: string }> {
    const apiKey = this.options.apiKey ?? process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is not configured on the ArenaOS API server.");
    }
    const binary = this.options.binary ?? process.env.CODEX_BINARY ?? "codex";
    const model = this.options.model ?? process.env.OPENAI_CODEX_MODEL ?? "gpt-5.6-sol";
    const launch = resolveCodexLaunch(binary);
    const child = spawn(launch.command, [...launch.arguments, "app-server"], {
      cwd: options.workspace,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      env: safeCodexEnvironment(apiKey, options.workspace)
    });
    const client = new AppServerClient(child, options.onEvent);
    const timeout = setTimeout(
      () => client.abort(new Error("Codex environment build timed out.")),
      this.options.timeoutMs ?? 12 * 60_000
    );
    const onAbort = () => client.interrupt();
    options.signal.addEventListener("abort", onAbort, { once: true });
    try {
      await client.request("initialize", {
        clientInfo: { name: "arena_os", title: "ArenaOS Environment Builder", version: "0.1.0" }
      });
      client.notify("initialized", {});
      const threadResponse = options.threadId
        ? await client.request("thread/resume", { threadId: options.threadId })
        : await client.request("thread/start", {
            model,
            cwd: options.workspace,
            approvalPolicy: "never",
            sandbox: "workspace-write"
          });
      const thread = threadResponse.thread as { id?: string } | undefined;
      const threadId = thread?.id ?? options.threadId;
      if (!threadId) throw new Error("Codex App Server did not return a thread id.");
      options.onEvent({ type: "environment_build.codex_started", message: `Codex started with ${model}.`, data: { threadId, model } });
      await client.startTurn(threadId, options.prompt);
      return { threadId };
    } catch (error) {
      throw normalizeCodexLaunchError(error, launch.displayName);
    } finally {
      clearTimeout(timeout);
      options.signal.removeEventListener("abort", onAbort);
      client.close();
    }
  }
}

class AppServerClient {
  readonly #pending = new Map<number, { resolve: (value: Record<string, unknown>) => void; reject: (error: Error) => void }>();
  readonly #turns = new Map<string, { resolve: () => void; reject: (error: Error) => void }>();
  readonly #completedTurns = new Map<string, Error | null>();
  #nextId = 1;
  #closed = false;

  constructor(
    private readonly child: ChildProcessWithoutNullStreams,
    private readonly onEvent: CodexBuildRunOptions["onEvent"]
  ) {
    const lines = createInterface({ input: child.stdout });
    lines.on("line", (line) => this.handleLine(line));
    child.stderr.on("data", (chunk) => {
      const message = String(chunk).trim();
      if (/failed to (?:load models cache|renew cache TTL): missing field `supports_reasoning_summaries`/.test(message)) return;
      if (message) onEvent({ type: "environment_build.command_output", message });
    });
    child.on("error", (error) => this.abort(error));
    child.on("exit", (code) => {
      if (!this.#closed && code !== 0) this.abort(new Error(`Codex App Server exited with code ${code}.`));
    });
  }

  request(method: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
    const id = this.#nextId++;
    const response = new Promise<Record<string, unknown>>((resolvePromise, reject) => this.#pending.set(id, { resolve: resolvePromise, reject }));
    this.send({ id, method, params });
    return response;
  }

  notify(method: string, params: Record<string, unknown>): void {
    this.send({ method, params });
  }

  async startTurn(threadId: string, prompt: string): Promise<void> {
    const response = await this.request("turn/start", {
      threadId,
      input: [{ type: "text", text: prompt }]
    });
    const turn = response.turn as { id?: string } | undefined;
    if (!turn?.id) throw new Error("Codex App Server did not return a turn id.");
    const completed = this.#completedTurns.get(turn.id);
    if (completed !== undefined) {
      this.#completedTurns.delete(turn.id);
      if (completed) throw completed;
      return;
    }
    return new Promise((resolvePromise, reject) => this.#turns.set(turn.id!, { resolve: resolvePromise, reject }));
  }

  interrupt(): void {
    for (const turnId of this.#turns.keys()) this.notify("turn/interrupt", { turnId });
    this.abort(new Error("Environment build cancelled."));
  }

  abort(error: Error): void {
    for (const pending of this.#pending.values()) pending.reject(error);
    for (const turn of this.#turns.values()) turn.reject(error);
    this.#pending.clear();
    this.#turns.clear();
    this.close();
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.child.stdin.end();
    if (!this.child.killed) this.child.kill();
  }

  private send(message: JsonRpcMessage): void {
    if (this.#closed) throw new Error("Codex App Server connection is closed.");
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private handleLine(line: string): void {
    let message: JsonRpcMessage;
    try { message = JSON.parse(line) as JsonRpcMessage; }
    catch { this.onEvent({ type: "environment_build.command_output", message: line }); return; }
    if (message.id !== undefined && !message.method) {
      const pending = this.#pending.get(Number(message.id));
      if (!pending) return;
      this.#pending.delete(Number(message.id));
      if (message.error) pending.reject(new Error(message.error.message ?? "Codex App Server request failed."));
      else pending.resolve(message.result ?? {});
      return;
    }
    if (message.id !== undefined && message.method) {
      this.send({ id: message.id, error: { code: -32000, message: "ArenaOS build workers do not grant interactive approvals." } });
      this.onEvent({ type: "environment_build.approval_required", message: `Codex requested blocked capability: ${message.method}` });
      return;
    }
    if (!message.method) return;
    const params = message.params ?? {};
    if (message.method === "turn/completed") {
      const turn = params.turn as { id?: string; status?: string; error?: { message?: string } } | undefined;
      const pending = turn?.id ? this.#turns.get(turn.id) : undefined;
      if (turn?.id) this.#turns.delete(turn.id);
      if (pending) {
        if (turn?.status === "failed") pending.reject(new Error(turn.error?.message ?? "Codex turn failed."));
        else pending.resolve();
      } else if (turn?.id) {
        this.#completedTurns.set(turn.id, turn.status === "failed" ? new Error(turn.error?.message ?? "Codex turn failed.") : null);
      }
      return;
    }
    const item = params.item as { type?: string; command?: string; changes?: unknown; text?: string; status?: string } | undefined;
    if (message.method === "item/started" && item?.type === "commandExecution") {
      this.onEvent({ type: "environment_build.command_started", message: item.command ?? "Codex started a command." });
    } else if (message.method === "item/completed" && item?.type === "commandExecution") {
      this.onEvent({ type: "environment_build.command_completed", message: item.command ?? "Codex completed a command.", data: { status: item.status } });
    } else if (message.method === "item/completed" && item?.type === "fileChange") {
      this.onEvent({ type: "environment_build.file_changed", message: "Codex updated environment artifacts." });
    } else if (message.method === "item/completed" && item?.type === "agentMessage" && item.text) {
      this.onEvent({ type: "environment_build.plan_updated", message: item.text.slice(0, 800) });
    }
  }
}

export class EnvironmentBuildService {
  readonly #events = new EventEmitter();
  readonly #controllers = new Map<string, AbortController>();
  readonly #writes = new Map<string, Promise<void>>();
  readonly #ajv = new Ajv({ allErrors: true, strict: false });
  readonly #root: string;

  constructor(
    private readonly system: ArenaSystem,
    private readonly runner: CodexBuildRunner = new CodexAppServerRunner(),
    root = resolve(process.cwd(), ".arena", "environment-builds"),
    private readonly registryRoot = resolve(process.cwd(), ".arena", "generated-environments")
  ) {
    this.#root = resolve(root);
  }

  status(): { configured: boolean; model: string; keyExposed: false; isolation: string } {
    return {
      configured: this.runner.isConfigured(),
      model: process.env.OPENAI_CODEX_MODEL ?? "gpt-5.6-sol",
      keyExposed: false,
      isolation: "workspace-write / network disabled / explicit approval"
    };
  }

  async loadApproved(): Promise<void> {
    await this.recoverInterruptedBuilds();
    await mkdir(this.registryRoot, { recursive: true });
    for (const entry of await readdir(this.registryRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      try {
        const manifest = await this.readManifest(join(this.registryRoot, entry.name, "environment.json"));
        if (!this.system.registries.environments.has(manifest.id)) {
          this.system.registries.environments.register(manifest.id, createGeneratedEnvironmentFactory(manifest));
        }
      } catch {
        // Invalid generated packages never prevent the API from starting.
      }
    }
  }

  async create(request: EnvironmentBuildRequest): Promise<EnvironmentBuildRecord> {
    const normalized = normalizeRequest(request);
    const now = new Date().toISOString();
    const record: EnvironmentBuildRecord = {
      id: randomUUID(), status: "created", request: normalized,
      createdAt: now, updatedAt: now, events: [], validation: []
    };
    await this.writeRecord(record);
    await this.emit(record, "environment_build.created", "Build workspace created.");
    void this.execute(record.id, false).catch(() => undefined);
    return this.getRequired(record.id);
  }

  async list(): Promise<EnvironmentBuildRecord[]> {
    await mkdir(this.#root, { recursive: true });
    const records: EnvironmentBuildRecord[] = [];
    for (const entry of await readdir(this.#root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      try { records.push(await this.getRequired(entry.name)); } catch { /* ignore incomplete folders */ }
    }
    return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async get(id: string): Promise<EnvironmentBuildRecord | undefined> {
    assertIdentifier(id);
    try { return JSON.parse(await readFile(join(this.#root, id, "build.json"), "utf8")) as EnvironmentBuildRecord; }
    catch (error) { if (isNotFound(error)) return undefined; throw error; }
  }

  async refine(id: string, message: string): Promise<EnvironmentBuildRecord> {
    const record = await this.getRequired(id);
    if (!["awaiting_approval", "failed"].includes(record.status)) throw conflict("Only completed or failed builds can be refined.");
    if (!message.trim()) throw badRequest("A refinement message is required.");
    try { JSON.parse(await readFile(this.manifestPath(id), "utf8")); }
    catch { await this.createTemplate(id, record.request); }
    record.request.prompt += `\n\nRefinement request:\n${message.trim()}`;
    record.status = "created";
    record.error = undefined;
    record.validation = [];
    await this.writeRecord(record);
    await this.emit(record, "environment_build.created", "Refinement queued.", { refinement: message.trim() });
    void this.execute(id, true).catch(() => undefined);
    return this.getRequired(id);
  }

  async cancel(id: string): Promise<EnvironmentBuildRecord> {
    const record = await this.getRequired(id);
    if (["approved", "cancelled"].includes(record.status)) return record;
    this.#controllers.get(id)?.abort();
    record.status = "cancelled";
    record.error = undefined;
    await this.emit(record, "environment_build.cancelled", "Build cancelled by user.");
    return record;
  }

  async approve(id: string): Promise<EnvironmentBuildRecord> {
    const record = await this.getRequired(id);
    if (record.status !== "awaiting_approval") throw conflict("The build must pass validation before approval.");
    const manifest = await this.readManifest(this.manifestPath(id));
    const destination = safeChild(this.registryRoot, manifest.id);
    await rm(destination, { recursive: true, force: true });
    await cp(this.workspace(id), destination, { recursive: true });
    if (this.system.registries.environments.has(manifest.id)) this.system.registries.environments.unregister(manifest.id);
    this.system.registries.environments.register(manifest.id, createGeneratedEnvironmentFactory(manifest));
    record.status = "approved";
    record.environmentId = manifest.id;
    await this.emit(record, "environment_build.approved", `${manifest.name} was registered in ArenaOS.`, { environmentId: manifest.id });
    return record;
  }

  async artifacts(id: string): Promise<EnvironmentBuildArtifact[]> {
    await this.getRequired(id);
    const workspace = this.workspace(id);
    const files = await walk(workspace);
    return Promise.all(files.map(async (path) => ({
      path: relative(workspace, path).split(sep).join("/"),
      mediaType: path.endsWith(".json") ? "application/json" : "text/plain",
      content: await readFile(path, "utf8")
    })));
  }

  async preview(id: string): Promise<EnvironmentBuildPreview> {
    const record = await this.getRequired(id);
    if (!["awaiting_approval", "approved"].includes(record.status)) throw conflict("Preview is available after validation passes.");
    const manifest = await this.readManifest(this.manifestPath(id));
    const environment = createGeneratedEnvironmentFactory(manifest).create();
    await environment.initialize({ episodeId: `preview-${id}`, seed: 0 });
    const reset = await environment.reset({ episodeId: `preview-${id}`, seed: 0 });
    await environment.close();
    return { manifest, state: reset.state as GeneratedEnvironmentState };
  }

  subscribe(id: string, handler: (event: EnvironmentBuildEvent) => void): () => void {
    const topic = `build:${id}`;
    this.#events.on(topic, handler);
    return () => this.#events.off(topic, handler);
  }

  private async execute(id: string, refinement: boolean): Promise<void> {
    const record = await this.getRequired(id);
    const controller = new AbortController();
    this.#controllers.set(id, controller);
    try {
      if (!refinement) await this.createTemplate(id, record.request);
      record.status = "generating";
      await this.writeRecord(record);
      const result = await this.runner.run({
        workspace: this.workspace(id),
        threadId: refinement ? record.threadId : undefined,
        prompt: buildCodexPrompt(record.request, refinement),
        signal: controller.signal,
        onEvent: (event) => {
          void this.emit(record, event.type, event.message, event.data).catch((error) => controller.abort(error));
        }
      });
      record.threadId = result.threadId;
      record.status = "validating";
      await this.emit(record, "environment_build.validation_started", "ArenaOS validation started.");
      record.validation = await this.validate(id);
      const failure = record.validation.find((check) => check.status === "failed");
      if (failure) throw new Error(`Validation failed: ${failure.detail}`);
      const manifest = await this.readManifest(this.manifestPath(id));
      record.environmentId = manifest.id;
      record.status = "awaiting_approval";
      await this.emit(record, "environment_build.preview_ready", "Validated preview is ready.", { environmentId: manifest.id });
      await this.emit(record, "environment_build.completed", "Build passed every validation gate and awaits approval.");
      await this.emit(record, "environment_build.approval_required", "Review the preview and explicitly register this environment.");
    } catch (error) {
      if (record.status === "cancelled" || controller.signal.aborted) {
        record.status = "cancelled";
        try { await this.writeRecord(record); } catch { /* A full disk must not terminate the API process. */ }
      } else {
        record.status = "failed";
        record.error = error instanceof Error ? error.message : String(error);
        try { await this.emit(record, "environment_build.validation_failed", record.error); }
        catch { /* Startup recovery will reconcile the persisted record. */ }
      }
    } finally {
      this.#controllers.delete(id);
    }
  }

  private async recoverInterruptedBuilds(): Promise<void> {
    await mkdir(this.#root, { recursive: true });
    for (const entry of await readdir(this.#root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      try {
        const record = await this.getRequired(entry.name);
        if (!["created", "generating", "validating"].includes(record.status)) continue;
        record.status = "failed";
        record.error = "ArenaOS restarted before this build completed. Retry the build to continue safely.";
        record.events.push({
          id: randomUUID(),
          type: "environment_build.validation_failed",
          timestamp: new Date().toISOString(),
          message: record.error
        });
        await this.writeRecord(record);
      } catch {
        // A malformed or unwritable record must not prevent API startup.
      }
    }
  }

  private async validate(id: string): Promise<ValidationCheck[]> {
    const checks: ValidationCheck[] = [];
    const add = (checkId: string, label: string, action: () => Promise<string> | string) => Promise.resolve().then(action).then(
      (detail) => checks.push({ id: checkId, label, status: "passed", detail }),
      (error) => checks.push({ id: checkId, label, status: "failed", detail: error instanceof Error ? error.message : String(error) })
    );
    let manifest: GeneratedEnvironmentManifest | undefined;
    await add("files", "Required package files", async () => {
      for (const file of ["environment.json", "README.md", "package.json", "src/index.ts", "tests/environment.test.ts"]) {
        if (!existsSync(safeChild(this.workspace(id), file))) throw new Error(`Missing required artifact: ${file}`);
      }
      return "Canonical package structure is complete.";
    });
    await add("schema", "Manifest and schemas", async () => {
      manifest = await this.readManifest(this.manifestPath(id));
      return "Manifest matches the generated-environment-v1 contract.";
    });
    if (!manifest) return checks;
    await add("paths", "Reachable deterministic world", () => {
      if (!hasPath(manifest!)) throw new Error("No legal path exists from the start to the goal.");
      return "Start-to-goal path exists and all coordinates are safe.";
    });
    await add("dependencies", "Dependency allowlist", async () => {
      const pkg = JSON.parse(await readFile(safeChild(this.workspace(id), "package.json"), "utf8")) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
      if (Object.keys(pkg.dependencies ?? {}).length || Object.keys(pkg.devDependencies ?? {}).length) throw new Error("Generated packages may not add dependencies in this milestone.");
      return "No untrusted dependencies requested.";
    });
    await add("smoke", "Lifecycle smoke test", async () => {
      const environment = createGeneratedEnvironmentFactory(manifest!).create();
      await environment.initialize({ episodeId: `validation-${id}`, seed: 0 });
      await environment.reset({ episodeId: `validation-${id}`, seed: 0 });
      const action = { id: randomUUID(), type: "wait", arguments: {} };
      const validate = this.#ajv.compile(environment.getActionSchema());
      if (!validate(action)) throw new Error(this.#ajv.errorsText(validate.errors));
      const result = await environment.step(action);
      if (!result.state || result.observation.step !== 1) throw new Error("Environment lifecycle did not advance deterministically.");
      await environment.close();
      return "Initialize, reset, action validation, step, snapshot, and close passed.";
    });
    await add("replay", "Deterministic replay", async () => {
      const first = await replayDigest(manifest!);
      const second = await replayDigest(manifest!);
      if (JSON.stringify(first) !== JSON.stringify(second)) throw new Error("Identical actions produced different state histories.");
      return "Repeated action sequence produced identical snapshots.";
    });
    return checks;
  }

  private async createTemplate(id: string, request: EnvironmentBuildRequest): Promise<void> {
    const workspace = this.workspace(id);
    await mkdir(join(workspace, "src"), { recursive: true });
    await mkdir(join(workspace, "tests"), { recursive: true });
    const slug = slugify(request.prompt.split(/\s+/).slice(0, 5).join(" "));
    const manifest = defaultManifest(`${slug || "generated-world"}-v1`, request);
    await Promise.all([
      writeFile(join(workspace, "environment.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8"),
      writeFile(join(workspace, "README.md"), `# ${manifest.name}\n\nCodex-generated ArenaOS environment package.\n`, "utf8"),
      writeFile(join(workspace, "package.json"), `${JSON.stringify({ name: `@arena/generated-${slug}`, version: "0.1.0", private: true, type: "module" }, null, 2)}\n`, "utf8"),
      writeFile(join(workspace, "src", "index.ts"), "// Runtime code is supplied by ArenaOS after manifest validation.\nexport { default as manifest } from \"../environment.json\" with { type: \"json\" };\n", "utf8"),
      writeFile(join(workspace, "tests", "environment.test.ts"), "// ArenaOS runs schema, lifecycle, pathfinding, and deterministic replay validation before registration.\n", "utf8")
    ]);
  }

  private workspace(id: string): string { assertIdentifier(id); return join(this.#root, id, "workspace"); }
  private manifestPath(id: string): string { return join(this.workspace(id), "environment.json"); }
  private async getRequired(id: string): Promise<EnvironmentBuildRecord> { const record = await this.get(id); if (!record) throw notFound(`Environment build \"${id}\" was not found.`); return record; }
  private async writeRecord(record: EnvironmentBuildRecord): Promise<void> {
    record.updatedAt = new Date().toISOString();
    const folder = safeChild(this.#root, record.id);
    const content = `${JSON.stringify(record, null, 2)}\n`;
    const previous = this.#writes.get(record.id) ?? Promise.resolve();
    const next = previous.then(async () => {
      await mkdir(folder, { recursive: true });
      const target = join(folder, "build.json");
      const temporary = join(folder, `build.${randomUUID()}.tmp`);
      await writeFile(temporary, content, "utf8");
      await replaceFile(temporary, target);
    });
    this.#writes.set(record.id, next);
    try { await next; }
    finally { if (this.#writes.get(record.id) === next) this.#writes.delete(record.id); }
  }
  private async emit(record: EnvironmentBuildRecord, type: string, message: string, data?: Record<string, unknown>): Promise<void> {
    const event = { id: randomUUID(), type, timestamp: new Date().toISOString(), message, data } satisfies EnvironmentBuildEvent;
    record.events.push(event);
    await this.writeRecord(record);
    this.#events.emit(`build:${record.id}`, event);
  }
  private async readManifest(path: string): Promise<GeneratedEnvironmentManifest> {
    const value = JSON.parse(await readFile(path, "utf8")) as unknown;
    const validate = this.#ajv.compile(manifestSchema);
    if (!validate(value)) throw new Error(this.#ajv.errorsText(validate.errors));
    const manifest = value as unknown as GeneratedEnvironmentManifest;
    assertManifestCoordinates(manifest);
    return manifest;
  }
}

function buildCodexPrompt(request: EnvironmentBuildRequest, refinement: boolean): string {
  const suggestedId = `${slugify(request.prompt.split(/\s+/).slice(0, 5).join(" ")) || "generated-world"}-v1`;
  const canonicalExample = JSON.stringify(defaultManifest(suggestedId, request), null, 2);
  return `${refinement ? "Refine" : "Build"} the ArenaOS environment in this isolated workspace.

User brief: ${request.prompt}
Category: ${request.category ?? "interactive reasoning"}
Visual direction: ${request.visualStyle ?? "clean ArenaOS visual language"}
Mechanics: ${request.mechanics ?? "deterministic navigation challenge"}
Agent behavior: ${request.agents ?? "single agent using move or wait"}
Scoring: ${request.scoring ?? "reward goal completion and penalize collisions"}

Security and acceptance contract:
- You are inside a generated package workspace. Never access parent directories, network services, credentials, or the ArenaOS source tree.
- Modify only environment.json and README.md. Do not add dependencies, executables, scripts, symlinks, or binary files.
- Keep schemaVersion exactly 1 and keep the action space compatible with move/wait.
- environment.json must use exactly the keys and nesting shown in the canonical manifest below. Replace values as needed, but never add, remove, or rename keys.
- The world must be 3-16 cells wide/high, positions must be unique and in bounds, and a legal path must connect start to goal.
- Keep the id lowercase kebab-case ending in -v1, version 0.1.0, colors as six-digit hex values, and glyphs to one visible character.
- Make the result distinctive and faithful to the brief while staying deterministic and replayable.
- Re-read environment.json before finishing and ensure it is valid JSON. Summarize the design when done.

Canonical manifest shape:
${canonicalExample}`;
}

function defaultManifest(id: string, request: EnvironmentBuildRequest): GeneratedEnvironmentManifest {
  return {
    schemaVersion: 1, id, name: titleCase(id.replace(/-v1$/, "")), version: "0.1.0",
    description: request.prompt.slice(0, 240), instructions: "Reach the goal while avoiding blocked cells.",
    category: request.category ?? "interactive reasoning", tags: ["generated", "deterministic", "grid"],
    visual: { style: request.visualStyle ?? "editorial", accent: "#39ff88", background: "#0b0f0d", agentGlyph: "A", goalGlyph: "◆" },
    world: { width: 7, height: 7, start: { x: 0, y: 0 }, goal: { x: 6, y: 6 }, obstacles: [{ x: 2, y: 0 }, { x: 2, y: 1 }, { x: 2, y: 2 }, { x: 4, y: 4 }, { x: 4, y: 5 }] },
    mechanics: { maxSteps: 32, moveReward: -0.01, collisionPenalty: -0.1, goalReward: 1 }
  };
}

const positionSchema = { type: "object", required: ["x", "y"], additionalProperties: false, properties: { x: { type: "integer", minimum: 0, maximum: 15 }, y: { type: "integer", minimum: 0, maximum: 15 } } };
const manifestSchema = {
  type: "object", additionalProperties: false,
  required: ["schemaVersion", "id", "name", "version", "description", "instructions", "category", "tags", "visual", "world", "mechanics"],
  properties: {
    schemaVersion: { const: 1 }, id: { type: "string", pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*-v1$", maxLength: 64 },
    name: { type: "string", minLength: 2, maxLength: 80 }, version: { const: "0.1.0" }, description: { type: "string", minLength: 10, maxLength: 500 },
    instructions: { type: "string", minLength: 10, maxLength: 500 }, category: { type: "string", minLength: 2, maxLength: 60 },
    tags: { type: "array", minItems: 1, maxItems: 8, uniqueItems: true, items: { type: "string", pattern: "^[a-z0-9-]+$", maxLength: 30 } },
    visual: { type: "object", additionalProperties: false, required: ["style", "accent", "background", "agentGlyph", "goalGlyph"], properties: { style: { type: "string", minLength: 2, maxLength: 100 }, accent: { type: "string", pattern: "^#[0-9a-fA-F]{6}$" }, background: { type: "string", pattern: "^#[0-9a-fA-F]{6}$" }, agentGlyph: { type: "string", minLength: 1, maxLength: 2 }, goalGlyph: { type: "string", minLength: 1, maxLength: 2 } } },
    world: { type: "object", additionalProperties: false, required: ["width", "height", "start", "goal", "obstacles"], properties: { width: { type: "integer", minimum: 3, maximum: 16 }, height: { type: "integer", minimum: 3, maximum: 16 }, start: positionSchema, goal: positionSchema, obstacles: { type: "array", maxItems: 100, items: positionSchema } } },
    mechanics: { type: "object", additionalProperties: false, required: ["maxSteps", "moveReward", "collisionPenalty", "goalReward"], properties: { maxSteps: { type: "integer", minimum: 4, maximum: 250 }, moveReward: { type: "number", minimum: -10, maximum: 10 }, collisionPenalty: { type: "number", minimum: -100, maximum: 0 }, goalReward: { type: "number", minimum: 0.01, maximum: 100 } } }
  }
};

function normalizeRequest(request: EnvironmentBuildRequest): EnvironmentBuildRequest {
  if (!request?.prompt?.trim() || request.prompt.trim().length < 12) throw badRequest("Describe the environment in at least 12 characters.");
  if (request.prompt.length > 6000) throw badRequest("Environment descriptions are limited to 6,000 characters.");
  return Object.fromEntries(Object.entries(request).filter(([, value]) => typeof value === "string" && value.trim()).map(([key, value]) => [key, (value as string).trim()])) as unknown as EnvironmentBuildRequest;
}
function assertManifestCoordinates(manifest: GeneratedEnvironmentManifest): void {
  const positions = [manifest.world.start, manifest.world.goal, ...manifest.world.obstacles];
  const seen = new Set<string>();
  for (const position of positions) {
    if (position.x >= manifest.world.width || position.y >= manifest.world.height) throw new Error(`Position ${position.x},${position.y} is outside the world.`);
    const key = `${position.x},${position.y}`;
    if (seen.has(key)) throw new Error(`Position ${key} is duplicated.`);
    seen.add(key);
  }
}
function hasPath(manifest: GeneratedEnvironmentManifest): boolean {
  const blocked = new Set(manifest.world.obstacles.map((p) => `${p.x},${p.y}`));
  const queue = [manifest.world.start]; const seen = new Set([`${manifest.world.start.x},${manifest.world.start.y}`]);
  while (queue.length) {
    const point = queue.shift()!;
    if (point.x === manifest.world.goal.x && point.y === manifest.world.goal.y) return true;
    for (const next of [{ x: point.x + 1, y: point.y }, { x: point.x - 1, y: point.y }, { x: point.x, y: point.y + 1 }, { x: point.x, y: point.y - 1 }]) {
      const key = `${next.x},${next.y}`;
      if (next.x < 0 || next.y < 0 || next.x >= manifest.world.width || next.y >= manifest.world.height || blocked.has(key) || seen.has(key)) continue;
      seen.add(key); queue.push(next);
    }
  }
  return false;
}
async function replayDigest(manifest: GeneratedEnvironmentManifest): Promise<unknown[]> {
  const env = createGeneratedEnvironmentFactory(manifest).create(); const episodeId = "determinism-check";
  await env.initialize({ episodeId, seed: 42 }); await env.reset({ episodeId, seed: 42 });
  const states: unknown[] = [];
  for (const direction of ["east", "south", "east"] as const) states.push((await env.step({ id: direction, type: "move", arguments: { direction } })).state);
  await env.close(); return states;
}
function safeCodexEnvironment(apiKey: string, workspace: string): NodeJS.ProcessEnv {
  const pick = (name: string) => process.env[name];
  return { PATH: pick("PATH"), Path: pick("Path"), SystemRoot: pick("SystemRoot"), ComSpec: pick("ComSpec"), TEMP: pick("TEMP"), TMP: pick("TMP"), USERPROFILE: pick("USERPROFILE"), HOME: pick("HOME"), CODEX_HOME: pick("CODEX_HOME"), OPENAI_API_KEY: apiKey, ARENA_GENERATED_WORKSPACE: workspace };
}
function resolveCodexLaunch(binary: string): { command: string; arguments: string[]; displayName: string } {
  const localCli = resolve(process.cwd(), "node_modules", "@openai", "codex", "bin", "codex.js");
  const configured = binary.trim();
  const isGenericCommand = configured.toLowerCase() === "codex" || configured.toLowerCase() === "codex.exe";

  // The Microsoft Store Codex executable lives under WindowsApps and cannot be
  // spawned by ordinary child processes on some Windows installations. Prefer
  // the declared, project-local CLI when the configuration uses a generic name.
  if (isGenericCommand && existsSync(localCli)) {
    return { command: process.execPath, arguments: [localCli], displayName: localCli };
  }
  if (configured.toLowerCase().endsWith(".js")) {
    return { command: process.execPath, arguments: [resolve(configured)], displayName: configured };
  }
  return { command: configured, arguments: [], displayName: configured };
}
function normalizeCodexLaunchError(error: unknown, binary: string): Error {
  if (error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "EPERM") {
    return new Error(
      `Windows blocked the Codex executable (${binary}). Install the project-local @openai/codex CLI or set CODEX_BINARY to an accessible executable.`
    );
  }
  return error instanceof Error ? error : new Error(String(error));
}
async function walk(root: string): Promise<string[]> { const output: string[] = []; for (const entry of await readdir(root, { withFileTypes: true })) { const path = join(root, entry.name); if (entry.isSymbolicLink()) throw new Error("Generated artifacts may not contain symbolic links."); if (entry.isDirectory()) output.push(...await walk(path)); else if (entry.isFile()) output.push(path); } return output; }
function safeChild(root: string, child: string): string { const path = resolve(root, child); if (dirname(path) !== resolve(root) && !path.startsWith(`${resolve(root)}${sep}`)) throw badRequest("Invalid generated path."); return path; }
function assertIdentifier(value: string): void { if (!/^[a-zA-Z0-9-]+$/.test(value)) throw badRequest("Invalid build identifier."); }
function slugify(value: string): string { return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48); }
function titleCase(value: string): string { return value.split("-").map((part) => part ? part[0]!.toUpperCase() + part.slice(1) : "").join(" "); }
function isNotFound(error: unknown): boolean { return error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT"; }
async function replaceFile(source: string, target: string): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try { await rename(source, target); return; }
    catch (error) {
      const code = error instanceof Error && "code" in error ? (error as NodeJS.ErrnoException).code : undefined;
      if (!(["EPERM", "EACCES", "EBUSY"].includes(code ?? "")) || attempt === 19) throw error;
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 5 + attempt * 3));
    }
  }
}
function httpError(message: string, statusCode: number): Error { return Object.assign(new Error(message), { statusCode }); }
function badRequest(message: string): Error { return httpError(message, 400); }
function notFound(message: string): Error { return httpError(message, 404); }
function conflict(message: string): Error { return httpError(message, 409); }
