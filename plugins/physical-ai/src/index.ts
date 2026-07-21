import {
  type Agent,
  type AgentActInput,
  type AgentActResult,
  type AgentAction,
  type AgentFactory,
  type AgentInitializeContext,
  type AgentMetadata,
  type ArenaEvent,
  type ArenaPlugin,
  type ComponentMetadata,
  type Environment,
  type EnvironmentCapabilities,
  type EnvironmentFactory,
  type EnvironmentInitializeContext,
  type EnvironmentMetadata,
  type EnvironmentResetInput,
  type EnvironmentResetResult,
  type EnvironmentStepResult,
  type EpisodeEvaluationInput,
  type EpisodeEvaluationResult,
  type Evaluator,
  type EvaluatorFactory,
  type JsonSchema,
  type Observation
} from "@arena/contracts";
import { randomUUID } from "node:crypto";

export type MissionMode = "single_supervisor" | "two_agent_cooperation" | "human_agent_team";
export type MissionPhase =
  | "briefing"
  | "inspection"
  | "planning"
  | "execution"
  | "recovery"
  | "delivery"
  | "verification"
  | "completed"
  | "failed";

export type Pose = { x: number; y: number; z: number; heading: number };
export type RobotStatus =
  | "idle"
  | "navigating"
  | "inspecting"
  | "carrying"
  | "manipulating"
  | "blocked"
  | "recovering"
  | "disabled";

export type PhysicalRobot = {
  id: string;
  displayName: string;
  type: "mobile" | "fixed_arm";
  color: string;
  pose: Pose;
  status: RobotStatus;
  battery: number;
  payloadObjectId?: string;
  currentAction?: string;
  assignedParticipantId?: string;
  capabilities: string[];
  sensors: { camera: boolean; depth: boolean; lidar: boolean; proximity: boolean; contact: boolean };
  stats: {
    distanceTravelled: number;
    energyUsed: number;
    actions: number;
    invalidActions: number;
    collisions: number;
    hazardContacts: number;
    inspections: number;
    recoveryActions: number;
  };
};

export type MissionObject = {
  id: string;
  label: string;
  type: "package" | "obstacle" | "hazard" | "station" | "conveyor";
  pose: Pose;
  state: string;
  movable: boolean;
  inspected: boolean;
  carrierRobotId?: string;
};

export type MissionZone = {
  id: string;
  label: string;
  type: "inspection" | "charger" | "extraction" | "clearance" | "restricted";
  center: { x: number; z: number };
  radius: number;
  state: "active" | "blocked" | "complete";
};

export type MissionEvent = {
  id: string;
  sequence: number;
  simulationTime: number;
  type:
    | "plan"
    | "navigation"
    | "inspection"
    | "obstacle"
    | "station"
    | "pickup"
    | "delivery"
    | "collision"
    | "hazard"
    | "signal"
    | "charge"
    | "phase"
    | "snapshot"
    | "failure"
    | "mission";
  actorId?: string;
  targetId?: string;
  description: string;
  result: "completed" | "failed" | "blocked" | "unsafe" | "accepted";
};

export type PhysicalAIState = {
  missionId: "warehouse-rescue-relay-v1";
  missionName: "Warehouse Rescue Relay";
  status: "ready" | "running" | "completed" | "failed";
  phase: MissionPhase;
  mode: MissionMode;
  seed: number;
  step: number;
  sequence: number;
  simulationTime: number;
  timeLimitSeconds: number;
  completionPercent: number;
  activeParticipantId: string;
  participantIds: string[];
  actedThisCycle: string[];
  backend: {
    adapter: "arena-reference" | "nvidia-isaac-sim";
    connected: boolean;
    bridgeVersion: string;
    protocolVersion: "1.0";
    isaacAvailable: boolean;
    streamingAvailable: boolean;
    physicsEngine: "seeded-reference" | "physx";
    reproducibility: "deterministic-reference" | "physics-tolerant";
    disclosure: string;
  };
  robots: PhysicalRobot[];
  objects: MissionObject[];
  zones: MissionZone[];
  objectives: Array<{
    id: string;
    label: string;
    description: string;
    status: "pending" | "active" | "completed" | "failed";
    completedAtStep?: number;
  }>;
  plan?: {
    summary: string;
    assignments: Array<{ robotId: string; objective: string }>;
  };
  metrics: {
    collisions: number;
    hazardContacts: number;
    energyUsed: number;
    distanceTravelled: number;
    validActions: number;
    invalidActions: number;
    usefulSignals: number;
    duplicateTaskAttempts: number;
    recoveries: number;
    scoreEstimate: number;
  };
  knownObjectIds: string[];
  activeSignals: Array<{ fromId: string; signal: string; targetId?: string; step: number }>;
  recentEvents: MissionEvent[];
  eventHistory: MissionEvent[];
  snapshots: Array<{ id: string; step: number; phase: MissionPhase; reason: string }>;
  result?: {
    success: boolean;
    reason: string;
    deliveredObjectId?: string;
    finalScore: number;
  };
};

export type PhysicalAIObservation = {
  mission: {
    missionId: string;
    objective: string;
    elapsedSeconds: number;
    remainingSeconds: number;
    phase: MissionPhase;
    completionPercent: number;
    backend: PhysicalAIState["backend"];
  };
  self: PhysicalRobot | { participantId: string; role: "supervisor" };
  controllableRobots: PhysicalRobot[];
  teammates: PhysicalRobot[];
  knownObjects: MissionObject[];
  zones: Array<MissionZone & { distance?: number }>;
  hazards: Array<{ hazardId: string; severity: number; pose: Pose; active: boolean }>;
  objectives: PhysicalAIState["objectives"];
  plan?: PhysicalAIState["plan"];
  metrics: PhysicalAIState["metrics"];
  recentEvents: MissionEvent[];
  availableActions: string[];
  actionGuidance: {
    currentGoal: string;
    nextBestActions: Array<{
      type: string;
      arguments: Record<string, unknown>;
      reason: string;
    }>;
    exactIds: {
      controllableRobotIds: string[];
      objectIds: string[];
      zoneIds: string[];
      waypointIds: string[];
    };
    rules: string[];
  };
};

export type PhysicalAIAction = AgentAction<Record<string, unknown>>;

const actionTypes = [
  "robot.navigate",
  "robot.inspect",
  "robot.pick",
  "robot.place",
  "robot.push",
  "robot.activate_station",
  "robot.charge",
  "robot.stop",
  "robot.cancel_action",
  "team.signal",
  "mission.submit_plan",
  "mission.finish"
];

const metadata: EnvironmentMetadata = {
  id: "physical-ai-mission-lab-v1",
  name: "Physical AI Mission Lab",
  version: "1.0.0",
  description:
    "A seeded, event-replayable embodied-agent mission where robots inspect, navigate, clear a route, operate a fixed arm, recover a package, and deliver it safely through an external-simulator adapter.",
  tags: ["robotics", "embodied-ai", "multi-agent", "3d", "external-simulator", "safety"],
  runtime: "in-process"
};

const actionSchema: JsonSchema = {
  type: "object",
  required: ["id", "type", "arguments"],
  properties: {
    id: { type: "string" },
    type: { type: "string", enum: actionTypes },
    summary: { type: "string" },
    arguments: {
      type: "object",
      description:
        "Use the exact argument object from observation.data.actionGuidance.nextBestActions whenever possible. Navigation requires robotId, target, and speedProfile; inspection requires robotId, targetId, and sensor; push requires robotId, objectId, and destinationId; station activation requires robotId, stationId, and commandId; placement requires robotId, objectId, and destinationId."
    }
  },
  additionalProperties: true
};

const observationSchema: JsonSchema = {
  type: "object",
  required: ["mission", "self", "controllableRobots", "knownObjects", "objectives", "availableActions", "actionGuidance"],
  properties: {
    mission: { type: "object" },
    self: { type: "object" },
    controllableRobots: { type: "array" },
    knownObjects: { type: "array" },
    objectives: { type: "array" },
    availableActions: { type: "array", items: { type: "string" } },
    actionGuidance: { type: "object" }
  }
};

export class PhysicalAIMissionEnvironment
  implements Environment<PhysicalAIObservation, PhysicalAIAction, PhysicalAIState>
{
  readonly metadata = metadata;
  #episodeId = "";
  #state?: PhysicalAIState;

  async initialize(context: EnvironmentInitializeContext): Promise<void> {
    this.#episodeId = context.episodeId;
  }

  async reset(
    input: EnvironmentResetInput
  ): Promise<EnvironmentResetResult<PhysicalAIObservation, PhysicalAIState>> {
    this.#episodeId = input.episodeId;
    const parameters = input.scenario?.parameters ?? {};
    const mode = parseMode(parameters.mode);
    const participantIds = parseParticipantIds(parameters.participantIds, mode);
    // Capability flags must come from a verified bridge handshake, not environment
    // variables. The first release ships the complete local reference adapter; the
    // Isaac connector remains unavailable until that handshake is implemented.
    const isaacAvailable = false;
    const streamingAvailable = false;
    const robots = createRobots(participantIds, mode);
    this.#state = {
      missionId: "warehouse-rescue-relay-v1",
      missionName: "Warehouse Rescue Relay",
      status: "ready",
      phase: "briefing",
      mode,
      seed: input.seed ?? 606,
      step: 0,
      sequence: 0,
      simulationTime: 0,
      timeLimitSeconds: clampInteger(parameters.timeLimitSeconds, 120, 900, 360),
      completionPercent: 0,
      activeParticipantId: participantIds[0]!,
      participantIds,
      actedThisCycle: [],
      backend: {
        adapter: "arena-reference",
        connected: true,
        bridgeVersion: "0.1.0",
        protocolVersion: "1.0",
        isaacAvailable,
        streamingAvailable,
        physicsEngine: "seeded-reference",
        reproducibility: "deterministic-reference",
        disclosure:
          "Isaac Sim was not discovered. ArenaOS is running its seeded reference mission backend; no Isaac video or PhysX result is being claimed."
      },
      robots,
      objects: createObjects(),
      zones: createZones(),
      objectives: [
        { id: "plan", label: "Mission plan", description: "Assign robots and submit a rescue plan.", status: "active" },
        { id: "inspect", label: "Inspect facility", description: "Inspect the conveyor and blocked north aisle.", status: "pending" },
        { id: "clear", label: "Clear route", description: "Move obstacle O2 into the clearance bay.", status: "pending" },
        { id: "arm", label: "Operate arm", description: "Activate the fixed arm and transfer package P3.", status: "pending" },
        { id: "deliver", label: "Extract package", description: "Deliver P3 into extraction zone E1.", status: "pending" }
      ],
      metrics: {
        collisions: 0,
        hazardContacts: 0,
        energyUsed: 0,
        distanceTravelled: 0,
        validActions: 0,
        invalidActions: 0,
        usefulSignals: 0,
        duplicateTaskAttempts: 0,
        recoveries: 0,
        scoreEstimate: 0
      },
      knownObjectIds: ["conveyor-01", "obstacle-o2", "hazard-h1", "arm-01"],
      activeSignals: [],
      recentEvents: [],
      eventHistory: [],
      snapshots: []
    };
    this.snapshot("mission_start");
    return { observation: this.observe(), state: structuredClone(this.#state) };
  }

  async step(
    action: PhysicalAIAction
  ): Promise<EnvironmentStepResult<PhysicalAIObservation, PhysicalAIState>> {
    const state = this.requireState();
    if (state.status === "completed" || state.status === "failed") {
      return this.result([], 0, true, "mission_already_finished");
    }
    state.status = "running";
    state.step += 1;
    state.simulationTime = round(state.simulationTime + actionDuration(action.type));
    const actorId = state.activeParticipantId;
    const events: ArenaEvent[] = [];
    let missionEvents: MissionEvent[] = [];
    try {
      validateActionShape(action);
      missionEvents = this.executeAction(actorId, action);
      state.metrics.validActions += 1;
    } catch (error) {
      state.metrics.invalidActions += 1;
      const robotId = String(action.arguments.robotId ?? "");
      const robot = state.robots.find((item) => item.id === robotId);
      if (robot) robot.stats.invalidActions += 1;
      const failure = this.missionEvent(
        "failure",
        actorId,
        robotId || undefined,
        error instanceof Error ? error.message : String(error),
        "failed"
      );
      missionEvents = [failure];
      events.push(this.arenaEvent("physical_ai.action_failed", { actorId, action, failure }));
    }
    state.recentEvents = missionEvents;
    state.eventHistory.push(...missionEvents);
    for (const event of missionEvents) {
      events.push(this.arenaEvent(`physical_ai.${eventName(event)}`, event));
    }
    this.updateProgress(events);
    this.rotateParticipant();
    this.updateScoreEstimate();
    const timeExpired = state.simulationTime >= state.timeLimitSeconds;
    if (timeExpired && state.result?.success !== true) {
      state.status = "failed";
      state.phase = "failed";
      state.result = {
        success: false,
        reason: "mission_timeout",
        finalScore: state.metrics.scoreEstimate
      };
      events.push(this.arenaEvent("physical_ai.mission_failed", state.result));
    }
    const terminated = state.result !== undefined;
    return this.result(
      events,
      terminated && state.result?.success ? 1 : missionEvents.some((event) => event.result === "completed") ? 0.1 : -0.02,
      terminated,
      terminated ? state.result?.reason : undefined
    );
  }

  async getState(): Promise<PhysicalAIState> {
    return structuredClone(this.requireState());
  }

  getActionSchema(): JsonSchema {
    return actionSchema;
  }

  getObservationSchema(): JsonSchema {
    return observationSchema;
  }

  getCapabilities(): EnvironmentCapabilities {
    return {
      deterministic: false,
      realtime: true,
      multiAgent: true,
      renderable: true,
      supportsSnapshots: true,
      supportsPause: true,
      supportsResume: true,
      supportsSeeding: true
    };
  }

  async close(): Promise<void> {}

  private executeAction(actorId: string, action: PhysicalAIAction): MissionEvent[] {
    const state = this.requireState();
    const args = action.arguments;
    if (action.type === "mission.submit_plan") {
      if (state.plan) throw new Error("A mission plan has already been accepted.");
      const summary = requiredString(args.summary, "summary");
      const assignments = Array.isArray(args.assignments)
        ? args.assignments.map((item) => ({
            robotId: requiredString((item as Record<string, unknown>).robotId, "robotId"),
            objective: requiredString((item as Record<string, unknown>).objective, "objective")
          }))
        : [];
      if (!assignments.length) throw new Error("The plan requires at least one robot assignment.");
      state.plan = { summary, assignments };
      completeObjective(state, "plan");
      state.phase = "inspection";
      activateObjective(state, "inspect");
      this.snapshot("plan_accepted");
      return [
        this.missionEvent("plan", actorId, undefined, `Mission plan accepted: ${summary}`, "completed"),
        this.missionEvent("phase", actorId, undefined, "Mission entered the inspection phase.", "completed")
      ];
    }
    if (!state.plan) throw new Error("Submit a mission plan before controlling robots.");
    if (action.type === "team.signal") {
      const signal = requiredString(args.signal, "signal");
      const targetId = optionalString(args.targetId);
      state.activeSignals.push({ fromId: actorId, signal, targetId, step: state.step });
      state.metrics.usefulSignals += targetId ? 1 : 0.5;
      return [this.missionEvent("signal", actorId, targetId, `Team signal: ${signal.replaceAll("_", " ")}.`, "completed")];
    }
    if (action.type === "mission.finish") {
      if (objective(state, "deliver").status !== "completed") {
        throw new Error("Mission cannot finish until package P3 is inside extraction zone E1.");
      }
      return [this.missionEvent("mission", actorId, undefined, "Final verification acknowledged.", "completed")];
    }
    const robot = requireRobot(state, requiredString(args.robotId, "robotId"));
    this.assertRobotControl(actorId, robot);
    if (robot.type === "fixed_arm" && !["robot.activate_station", "robot.stop", "robot.cancel_action"].includes(action.type)) {
      throw new Error(`${robot.id} only accepts station, stop, or cancellation commands.`);
    }
    robot.stats.actions += 1;
    switch (action.type) {
      case "robot.navigate":
        return this.navigate(actorId, robot, args);
      case "robot.inspect":
        return this.inspect(actorId, robot, args);
      case "robot.push":
        return this.push(actorId, robot, args);
      case "robot.activate_station":
        return this.activateStation(actorId, robot, args);
      case "robot.pick":
        return this.pick(actorId, robot, args);
      case "robot.place":
        return this.place(actorId, robot, args);
      case "robot.charge":
        return this.charge(actorId, robot, args);
      case "robot.stop":
      case "robot.cancel_action":
        robot.status = action.type === "robot.stop" ? "idle" : "recovering";
        if (action.type === "robot.cancel_action") {
          robot.stats.recoveryActions += 1;
          state.metrics.recoveries += 1;
        }
        robot.currentAction = undefined;
        return [this.missionEvent("navigation", actorId, robot.id, `${robot.displayName} ${action.type === "robot.stop" ? "stopped safely" : "cancelled its action and entered recovery"}.`, "completed")];
      default:
        throw new Error(`Unsupported physical action "${action.type}".`);
    }
  }

  private navigate(actorId: string, robot: PhysicalRobot, args: Record<string, unknown>): MissionEvent[] {
    if (robot.type !== "mobile") throw new Error("Only mobile robots can navigate.");
    const target = args.target as Record<string, unknown> | undefined;
    if (!target) throw new Error("Navigation target is required.");
    const destination = resolveTarget(this.requireState(), target);
    const speed = ["safe", "normal", "urgent"].includes(String(args.speedProfile))
      ? String(args.speedProfile)
      : "normal";
    const distance = Math.hypot(destination.x - robot.pose.x, destination.z - robot.pose.z);
    const obstacle = requireObject(this.requireState(), "obstacle-o2");
    if (destination.z > 1.5 && obstacle.state === "blocking" && destination.x < 1.5) {
      robot.status = "blocked";
      return [this.missionEvent("navigation", actorId, robot.id, `${robot.displayName} found the north aisle blocked by obstacle O2.`, "blocked")];
    }
    robot.status = "navigating";
    robot.currentAction = `navigate:${optionalString(target.waypointId ?? target.objectId ?? target.zoneId) ?? "position"}`;
    robot.pose = { ...robot.pose, x: destination.x, z: destination.z, heading: heading(robot.pose, destination) };
    const multiplier = speed === "urgent" ? 1.35 : speed === "safe" ? 0.82 : 1;
    const energy = distance * 0.8 * multiplier;
    robot.battery = clamp(robot.battery - energy, 0, 100);
    robot.stats.distanceTravelled += distance;
    robot.stats.energyUsed += energy;
    this.requireState().metrics.distanceTravelled += distance;
    this.requireState().metrics.energyUsed += energy;
    const hazard = requireObject(this.requireState(), "hazard-h1");
    const hazardDistance = Math.hypot(robot.pose.x - hazard.pose.x, robot.pose.z - hazard.pose.z);
    const events = [this.missionEvent("navigation", actorId, robot.id, `${robot.displayName} reached (${destination.x.toFixed(1)}, ${destination.z.toFixed(1)}) using ${speed} motion control.`, "completed")];
    if (speed === "urgent" && hazardDistance < 1.6) {
      robot.stats.hazardContacts += 1;
      this.requireState().metrics.hazardContacts += 1;
      events.push(this.missionEvent("hazard", actorId, hazard.id, `${robot.displayName} entered the hazard margin at unsafe speed.`, "unsafe"));
    }
    robot.status = robot.payloadObjectId ? "carrying" : "idle";
    robot.currentAction = undefined;
    return events;
  }

  private inspect(actorId: string, robot: PhysicalRobot, args: Record<string, unknown>): MissionEvent[] {
    const targetId = requiredString(args.targetId, "targetId");
    const sensor = requiredString(args.sensor, "sensor");
    if (!["camera", "depth", "lidar", "proximity"].includes(sensor)) throw new Error(`Sensor "${sensor}" is unavailable.`);
    const object = requireObject(this.requireState(), targetId);
    const distance = Math.hypot(robot.pose.x - object.pose.x, robot.pose.z - object.pose.z);
    if (distance > 5.5) throw new Error(`${targetId} is outside inspection range; navigate closer first.`);
    object.inspected = true;
    robot.status = "inspecting";
    robot.stats.inspections += 1;
    if (!this.requireState().knownObjectIds.includes(object.id)) this.requireState().knownObjectIds.push(object.id);
    if (object.id === "package-p3") object.state = "located";
    robot.status = "idle";
    return [this.missionEvent("inspection", actorId, object.id, `${robot.displayName} inspected ${object.label} with ${sensor}; state is ${object.state}.`, "completed")];
  }

  private push(actorId: string, robot: PhysicalRobot, args: Record<string, unknown>): MissionEvent[] {
    const object = requireObject(this.requireState(), requiredString(args.objectId, "objectId"));
    if (!object.movable) throw new Error(`${object.id} is not movable.`);
    if (!object.inspected) throw new Error(`${object.id} must be inspected before manipulation.`);
    const distance = Math.hypot(robot.pose.x - object.pose.x, robot.pose.z - object.pose.z);
    if (distance > 2.2) throw new Error(`${robot.id} is too far from ${object.id} to push it.`);
    const destinationId = optionalString(args.destinationId) ?? "clearance-bay";
    const zone = requireZone(this.requireState(), destinationId);
    object.pose = { ...object.pose, x: zone.center.x, z: zone.center.z };
    object.state = "cleared";
    zone.state = "complete";
    robot.battery = clamp(robot.battery - 3.5, 0, 100);
    robot.stats.energyUsed += 3.5;
    this.requireState().metrics.energyUsed += 3.5;
    return [this.missionEvent("obstacle", actorId, object.id, `${robot.displayName} moved obstacle O2 into the clearance bay.`, "completed")];
  }

  private activateStation(actorId: string, robot: PhysicalRobot, args: Record<string, unknown>): MissionEvent[] {
    const stationId = requiredString(args.stationId, "stationId");
    const commandId = requiredString(args.commandId, "commandId");
    if (stationId !== "arm-01") throw new Error(`Station "${stationId}" is unavailable.`);
    const state = this.requireState();
    const packageObject = requireObject(state, "package-p3");
    const obstacle = requireObject(state, "obstacle-o2");
    if (commandId !== "transfer-package") throw new Error(`Command "${commandId}" is unsupported.`);
    if (!packageObject.inspected) throw new Error("Package P3 must be inspected before arm transfer.");
    if (obstacle.state !== "cleared") throw new Error("The transfer corridor is blocked by obstacle O2.");
    const receiver = state.robots.find((item) => item.type === "mobile" && distance2d(item.pose, packageObject.pose) <= 3);
    if (!receiver) throw new Error("A mobile robot must wait beside package P3 to receive the arm transfer.");
    robot.status = "manipulating";
    robot.currentAction = "transfer-package";
    packageObject.state = "carried";
    packageObject.carrierRobotId = receiver.id;
    receiver.payloadObjectId = packageObject.id;
    receiver.status = "carrying";
    packageObject.pose = { ...receiver.pose };
    robot.status = "idle";
    robot.currentAction = undefined;
    return [
      this.missionEvent("station", actorId, robot.id, "Fixed arm executed the predefined top-grasp trajectory.", "completed"),
      this.missionEvent("pickup", actorId, packageObject.id, `${receiver.displayName} received package P3 from the fixed arm.`, "completed")
    ];
  }

  private pick(actorId: string, robot: PhysicalRobot, args: Record<string, unknown>): MissionEvent[] {
    const object = requireObject(this.requireState(), requiredString(args.objectId, "objectId"));
    if (object.id === "package-p3") throw new Error("Package P3 requires the fixed arm transfer in this mission.");
    throw new Error(`${object.id} has no predefined grasp for ${robot.id}.`);
  }

  private place(actorId: string, robot: PhysicalRobot, args: Record<string, unknown>): MissionEvent[] {
    const objectId = requiredString(args.objectId, "objectId");
    const destinationId = requiredString(args.destinationId, "destinationId");
    if (robot.payloadObjectId !== objectId) throw new Error(`${robot.id} is not carrying ${objectId}.`);
    const zone = requireZone(this.requireState(), destinationId);
    if (zone.type !== "extraction") throw new Error(`${destinationId} is not an extraction zone.`);
    if (distance2d(robot.pose, { x: zone.center.x, z: zone.center.z }) > zone.radius + 0.5) {
      throw new Error(`${robot.id} must enter ${destinationId} before placing the package.`);
    }
    const object = requireObject(this.requireState(), objectId);
    object.pose = { ...robot.pose };
    object.state = "delivered";
    object.carrierRobotId = undefined;
    robot.payloadObjectId = undefined;
    robot.status = "idle";
    zone.state = "complete";
    return [this.missionEvent("delivery", actorId, objectId, `${robot.displayName} placed package P3 inside extraction zone E1.`, "completed")];
  }

  private charge(actorId: string, robot: PhysicalRobot, args: Record<string, unknown>): MissionEvent[] {
    const charger = requireZone(this.requireState(), requiredString(args.chargerId, "chargerId"));
    if (charger.type !== "charger") throw new Error(`${charger.id} is not a charger.`);
    if (distance2d(robot.pose, { x: charger.center.x, z: charger.center.z }) > charger.radius + 0.5) {
      throw new Error(`${robot.id} must be inside ${charger.id} to charge.`);
    }
    const recovered = Math.min(25, 100 - robot.battery);
    robot.battery += recovered;
    return [this.missionEvent("charge", actorId, robot.id, `${robot.displayName} recovered ${recovered.toFixed(1)}% battery.`, "completed")];
  }

  private updateProgress(events: ArenaEvent[]) {
    const state = this.requireState();
    const conveyor = requireObject(state, "conveyor-01");
    const obstacle = requireObject(state, "obstacle-o2");
    const packageObject = requireObject(state, "package-p3");
    if (conveyor.inspected && obstacle.inspected && objective(state, "inspect").status !== "completed") {
      completeObjective(state, "inspect");
      activateObjective(state, "clear");
      state.phase = "execution";
      this.snapshot("inspection_complete");
      events.push(this.arenaEvent("physical_ai.phase_changed", { phase: state.phase }));
    }
    if (obstacle.state === "cleared" && objective(state, "clear").status !== "completed") {
      completeObjective(state, "clear");
      activateObjective(state, "arm");
      this.snapshot("route_cleared");
    }
    if (packageObject.state === "carried" && objective(state, "arm").status !== "completed") {
      completeObjective(state, "arm");
      activateObjective(state, "deliver");
      state.phase = "delivery";
      this.snapshot("package_picked");
      events.push(this.arenaEvent("physical_ai.phase_changed", { phase: state.phase }));
    }
    if (packageObject.state === "delivered" && objective(state, "deliver").status !== "completed") {
      completeObjective(state, "deliver");
      state.phase = "verification";
      state.completionPercent = 100;
      this.updateScoreEstimate();
      state.status = "completed";
      state.phase = "completed";
      state.result = {
        success: true,
        reason: "priority_package_extracted",
        deliveredObjectId: packageObject.id,
        finalScore: state.metrics.scoreEstimate
      };
      this.snapshot("mission_completed");
      events.push(this.arenaEvent("physical_ai.object_delivered", { objectId: packageObject.id }));
      events.push(this.arenaEvent("physical_ai.mission_completed", state.result));
    } else {
      state.completionPercent = Math.round(
        (state.objectives.filter((item) => item.status === "completed").length / state.objectives.length) * 100
      );
    }
  }

  private updateScoreEstimate() {
    const state = this.requireState();
    const objectiveRate = state.objectives.filter((item) => item.status === "completed").length / state.objectives.length;
    const timeScore = clamp(1 - state.simulationTime / state.timeLimitSeconds, 0, 1);
    const safety = clamp(1 - state.metrics.collisions * 0.2 - state.metrics.hazardContacts * 0.14, 0, 1);
    const energy = clamp(1 - state.metrics.energyUsed / 130, 0, 1);
    const validity = state.metrics.validActions + state.metrics.invalidActions
      ? state.metrics.validActions / (state.metrics.validActions + state.metrics.invalidActions)
      : 1;
    const coordination = clamp(0.6 + state.metrics.usefulSignals * 0.08 - state.metrics.duplicateTaskAttempts * 0.1, 0, 1);
    const recovery = state.metrics.recoveries ? 1 : 0.7;
    state.metrics.scoreEstimate = round(
      objectiveRate * 40 + timeScore * 15 + safety * 15 + energy * 10 + coordination * 10 + recovery * 5 + validity * 5
    );
  }

  private assertRobotControl(actorId: string, robot: PhysicalRobot) {
    const state = this.requireState();
    if (state.mode === "single_supervisor") return;
    if (robot.type === "fixed_arm") return;
    if (robot.assignedParticipantId !== actorId) {
      throw new Error(`${actorId} cannot control ${robot.id}; it is assigned to ${robot.assignedParticipantId}.`);
    }
  }

  private rotateParticipant() {
    const state = this.requireState();
    if (state.participantIds.length < 2 || state.status !== "running") return;
    const index = state.participantIds.indexOf(state.activeParticipantId);
    state.activeParticipantId = state.participantIds[(index + 1) % state.participantIds.length]!;
  }

  private observe(): Observation<PhysicalAIObservation> {
    const state = this.requireState();
    const participantId = state.activeParticipantId;
    const controllable = state.mode === "single_supervisor"
      ? state.robots
      : state.robots.filter((robot) => robot.type === "fixed_arm" || robot.assignedParticipantId === participantId);
    const ownMobile = controllable.find((robot) => robot.type === "mobile");
    const knownObjects = state.objects.filter((object) => state.knownObjectIds.includes(object.id));
    const observation: PhysicalAIObservation = {
      mission: {
        missionId: state.missionId,
        objective: "Recover priority package P3 and deliver it to extraction zone E1.",
        elapsedSeconds: state.simulationTime,
        remainingSeconds: Math.max(0, state.timeLimitSeconds - state.simulationTime),
        phase: state.phase,
        completionPercent: state.completionPercent,
        backend: structuredClone(state.backend)
      },
      self: ownMobile ? structuredClone(ownMobile) : { participantId, role: "supervisor" },
      controllableRobots: structuredClone(controllable),
      teammates: structuredClone(state.robots.filter((robot) => robot.type === "mobile" && robot !== ownMobile)),
      knownObjects: structuredClone(knownObjects),
      zones: structuredClone(
        state.zones.map((zone) => ({
          ...zone,
          distance: ownMobile ? round(distance2d(ownMobile.pose, { x: zone.center.x, z: zone.center.z })) : undefined
        }))
      ),
      hazards: state.objects
        .filter((object) => object.type === "hazard")
        .map((hazard) => ({ hazardId: hazard.id, severity: 0.8, pose: structuredClone(hazard.pose), active: hazard.state === "active" })),
      objectives: structuredClone(state.objectives),
      plan: state.plan ? structuredClone(state.plan) : undefined,
      metrics: structuredClone(state.metrics),
      recentEvents: structuredClone(state.recentEvents),
      availableActions: availableActionTypes(state),
      actionGuidance: buildActionGuidance(state, participantId, controllable)
    };
    return {
      id: randomUUID(),
      episodeId: this.#episodeId,
      step: state.step,
      timestamp: new Date().toISOString(),
      activeParticipantId: participantId,
      availableActions: observation.availableActions,
      data: observation
    };
  }

  private result(
    events: ArenaEvent[],
    reward: number,
    terminated: boolean,
    terminationReason?: string
  ): EnvironmentStepResult<PhysicalAIObservation, PhysicalAIState> {
    const state = this.requireState();
    return {
      observation: this.observe(),
      state: structuredClone(state),
      reward,
      terminated,
      truncated: false,
      terminationReason,
      events,
      info: {
        backend: state.backend.adapter,
        phase: state.phase,
        completionPercent: state.completionPercent,
        scoreEstimate: state.metrics.scoreEstimate
      }
    };
  }

  private snapshot(reason: string) {
    const state = this.requireState();
    state.snapshots.push({ id: `snapshot-${state.snapshots.length + 1}`, step: state.step, phase: state.phase, reason });
  }

  private missionEvent(
    type: MissionEvent["type"],
    actorId: string | undefined,
    targetId: string | undefined,
    description: string,
    result: MissionEvent["result"]
  ): MissionEvent {
    const state = this.requireState();
    state.sequence += 1;
    return {
      id: randomUUID(),
      sequence: state.sequence,
      simulationTime: state.simulationTime,
      type,
      actorId,
      targetId,
      description,
      result
    };
  }

  private arenaEvent(type: string, payload: unknown): ArenaEvent {
    const state = this.requireState();
    return {
      id: randomUUID(),
      type,
      timestamp: new Date().toISOString(),
      episodeId: this.#episodeId,
      step: state.step,
      source: "environment:physical-ai-mission-lab-v1",
      payload
    };
  }

  private requireState(): PhysicalAIState {
    if (!this.#state) throw new Error("Physical AI Mission Lab has not been reset.");
    return this.#state;
  }
}

class MissionCoordinatorAgent implements Agent<PhysicalAIObservation, PhysicalAIAction> {
  readonly metadata: AgentMetadata = {
    id: "mission-coordinator",
    name: "Mission Coordinator",
    version: "1.0.0",
    description:
      "A deterministic embodied-agent baseline that plans, inspects, clears the route, coordinates the fixed arm, and extracts the priority package.",
    provider: "ArenaOS",
    model: "warehouse-rescue-policy",
    tags: ["robotics", "planning", "safety", "deterministic"]
  };
  #participantId = "";

  async initialize(context: AgentInitializeContext): Promise<void> {
    this.#participantId = context.participant?.id ?? "supervisor";
  }

  async act(
    input: AgentActInput<PhysicalAIObservation>
  ): Promise<AgentActResult<PhysicalAIAction>> {
    const o = input.observation.data;
    const recommended = o.actionGuidance.nextBestActions[0];
    if (!recommended) {
      return action(
        "team.signal",
        { signal: "hold_safe", targetId: this.#participantId },
        "Hold position while the authoritative mission state updates."
      );
    }
    return action(recommended.type, recommended.arguments, recommended.reason);
  }

  async reset(): Promise<void> {}
  async close(): Promise<void> {}
}

class PhysicalAIMissionEvaluator implements Evaluator {
  readonly metadata: ComponentMetadata = {
    id: "physical-ai-mission-score",
    name: "Physical AI Mission Score",
    version: "1.0.0",
    description:
      "Objective scoring for mission completion, time, safety, energy, coordination, recovery, and valid actions.",
    tags: ["robotics", "objective", "safety", "physics-tolerant"]
  };

  async evaluateEpisode(
    input: EpisodeEvaluationInput
  ): Promise<EpisodeEvaluationResult> {
    const state = input.finalState as PhysicalAIState;
    const completed = state.objectives.filter((item) => item.status === "completed").length;
    const completion = completed / state.objectives.length;
    const time = clamp(1 - state.simulationTime / state.timeLimitSeconds, 0, 1);
    const safety = clamp(1 - state.metrics.collisions * 0.2 - state.metrics.hazardContacts * 0.14, 0, 1);
    const energy = clamp(1 - state.metrics.energyUsed / 130, 0, 1);
    const coordination = clamp(0.6 + state.metrics.usefulSignals * 0.08 - state.metrics.duplicateTaskAttempts * 0.1, 0, 1);
    const recovery = state.metrics.recoveries ? 1 : 0.7;
    const validity = state.metrics.validActions + state.metrics.invalidActions
      ? state.metrics.validActions / (state.metrics.validActions + state.metrics.invalidActions)
      : 1;
    const score = round(completion * 0.4 + time * 0.15 + safety * 0.15 + energy * 0.1 + coordination * 0.1 + recovery * 0.05 + validity * 0.05);
    return {
      evaluatorId: this.metadata.id,
      score,
      passed: state.result?.success === true,
      metrics: [
        { name: "mission_completion", value: round(completion), unit: "ratio" },
        { name: "completion_time", value: round(state.simulationTime), unit: "seconds" },
        { name: "safety", value: round(safety), unit: "ratio" },
        { name: "energy_efficiency", value: round(energy), unit: "ratio" },
        { name: "coordination", value: round(coordination), unit: "ratio" },
        { name: "recovery", value: round(recovery), unit: "ratio" },
        { name: "action_validity", value: round(validity), unit: "ratio" },
        { name: "backend", value: state.backend.adapter },
        { name: "isaac_available", value: state.backend.isaacAvailable }
      ],
      summary: state.result?.success
        ? `Warehouse Rescue Relay completed using ${state.backend.adapter}; package P3 was physically represented in the authoritative mission state and delivered.`
        : `Mission ended at ${state.completionPercent}% completion using ${state.backend.adapter}.`
    };
  }
}

function createRobots(participantIds: string[], mode: MissionMode): PhysicalRobot[] {
  const assignment = (index: number) => mode === "single_supervisor" ? participantIds[0] : participantIds[index] ?? participantIds[0];
  return [
    robot("mobile-01", "ATLAS-01", "mobile", "#63e9ff", { x: -5, y: 0, z: -4, heading: 0 }, assignment(0), ["navigate", "inspect", "push", "place", "charge"]),
    robot("mobile-02", "ATLAS-02", "mobile", "#ffb85c", { x: -2, y: 0, z: -4, heading: 0 }, assignment(1), ["navigate", "inspect", "push", "place", "charge"]),
    robot("arm-01", "GANTRY ARM", "fixed_arm", "#9cff70", { x: 5.2, y: 0, z: 2.8, heading: Math.PI }, undefined, ["pick", "place", "transfer-package"])
  ];
}

function robot(
  id: string,
  displayName: string,
  type: PhysicalRobot["type"],
  color: string,
  pose: Pose,
  assignedParticipantId: string | undefined,
  capabilities: string[]
): PhysicalRobot {
  return {
    id, displayName, type, color, pose, assignedParticipantId, capabilities,
    status: "idle",
    battery: type === "fixed_arm" ? 100 : 94,
    sensors: { camera: true, depth: type === "mobile", lidar: false, proximity: true, contact: true },
    stats: { distanceTravelled: 0, energyUsed: 0, actions: 0, invalidActions: 0, collisions: 0, hazardContacts: 0, inspections: 0, recoveryActions: 0 }
  };
}

function createObjects(): MissionObject[] {
  return [
    { id: "conveyor-01", label: "Damaged Conveyor", type: "conveyor", pose: { x: 0, y: 0, z: -1, heading: 0 }, state: "damaged", movable: false, inspected: false },
    { id: "obstacle-o2", label: "Blocked Cargo Crate O2", type: "obstacle", pose: { x: 0.5, y: 0, z: 2.1, heading: 0 }, state: "blocking", movable: true, inspected: false },
    { id: "hazard-h1", label: "Thermal Hazard H1", type: "hazard", pose: { x: 3, y: 0, z: 0.2, heading: 0 }, state: "active", movable: false, inspected: false },
    { id: "package-p3", label: "Priority Package P3", type: "package", pose: { x: 5, y: 0.6, z: 2.5, heading: 0 }, state: "unknown", movable: true, inspected: false },
    { id: "arm-01", label: "Gantry Manipulator", type: "station", pose: { x: 5.2, y: 0, z: 2.8, heading: Math.PI }, state: "ready", movable: false, inspected: true }
  ];
}

function createZones(): MissionZone[] {
  return [
    { id: "inspection-a", label: "Inspection Zone A", type: "inspection", center: { x: 0, z: -1 }, radius: 2, state: "active" },
    { id: "clearance-bay", label: "Obstacle Clearance Bay", type: "clearance", center: { x: -3.5, z: 2.1 }, radius: 1.2, state: "active" },
    { id: "package-bay", label: "Package Bay", type: "inspection", center: { x: 4.4, z: 1.5 }, radius: 2, state: "active" },
    { id: "charger-c1", label: "Charging Station C1", type: "charger", center: { x: -5, z: 4 }, radius: 1.5, state: "active" },
    { id: "extraction-e1", label: "Extraction Zone E1", type: "extraction", center: { x: 6, z: -4 }, radius: 1.6, state: "active" },
    { id: "restricted-h1", label: "Hazard Exclusion Zone", type: "restricted", center: { x: 3, z: 0.2 }, radius: 1.4, state: "active" }
  ];
}

function resolveTarget(state: PhysicalAIState, target: Record<string, unknown>): { x: number; z: number } {
  const type = requiredString(target.type, "target.type");
  if (type === "object") {
    const object = requireObject(state, requiredString(target.objectId, "target.objectId"));
    return { x: object.pose.x - 1.1, z: object.pose.z - 0.7 };
  }
  if (type === "zone") {
    const zone = requireZone(state, requiredString(target.zoneId, "target.zoneId"));
    return { ...zone.center };
  }
  if (type === "waypoint") {
    const waypoint = requiredString(target.waypointId, "target.waypointId");
    const waypoints: Record<string, { x: number; z: number }> = {
      "inspection-a": { x: -0.8, z: -1.7 },
      "north-aisle": { x: -0.7, z: 1.3 },
      "package-bay": { x: 4, z: 1.4 },
      "safe-corridor": { x: 2.1, z: -2.2 },
      "extraction-e1": { x: 6, z: -4 }
    };
    const position = waypoints[waypoint];
    if (!position) throw new Error(`Waypoint "${waypoint}" does not exist.`);
    return position;
  }
  if (type === "position") {
    const x = Number(target.x);
    const z = Number(target.y ?? target.z);
    if (!Number.isFinite(x) || !Number.isFinite(z) || Math.abs(x) > 8 || Math.abs(z) > 6) {
      throw new Error("Position is outside mission bounds.");
    }
    return { x, z };
  }
  throw new Error(`Navigation target type "${type}" is unsupported.`);
}

function validateActionShape(actionValue: PhysicalAIAction) {
  if (!actionValue || typeof actionValue !== "object") throw new Error("Action must be an object.");
  if (!actionTypes.includes(actionValue.type)) throw new Error(`Action type "${actionValue.type}" is unsupported.`);
  if (!actionValue.arguments || typeof actionValue.arguments !== "object") throw new Error("Action arguments are required.");
}

function eventName(event: MissionEvent): string {
  const names: Record<MissionEvent["type"], string> = {
    plan: "plan_submitted", navigation: "action_completed", inspection: "object_detected",
    obstacle: "navigation_unblocked", station: "station_activated", pickup: "object_picked",
    delivery: "object_delivered", collision: "collision_detected", hazard: "hazard_entered",
    signal: "team_signal_sent", charge: "battery_updated", phase: "phase_changed",
    snapshot: "snapshot_created", failure: "action_failed", mission: "mission_state_changed"
  };
  return names[event.type];
}

function availableActionTypes(state: PhysicalAIState): string[] {
  if (!state.plan) return ["mission.submit_plan"];
  if (state.result) return [];
  const conveyor = requireObject(state, "conveyor-01");
  const obstacle = requireObject(state, "obstacle-o2");
  const packageObject = requireObject(state, "package-p3");
  const available = new Set(["team.signal", "robot.stop", "robot.cancel_action", "robot.charge"]);
  if (!conveyor.inspected || !obstacle.inspected || !packageObject.inspected) {
    available.add("robot.navigate");
    available.add("robot.inspect");
  }
  if (obstacle.inspected && obstacle.state !== "cleared") {
    available.add("robot.navigate");
    available.add("robot.push");
  }
  if (packageObject.inspected && packageObject.state !== "carried" && packageObject.state !== "delivered") {
    available.add("robot.navigate");
    available.add("robot.activate_station");
  }
  if (packageObject.state === "carried") {
    available.add("robot.navigate");
    available.add("robot.place");
  }
  if (packageObject.state === "delivered") available.add("mission.finish");
  return actionTypes.filter((type) => available.has(type));
}

function buildActionGuidance(
  state: PhysicalAIState,
  participantId: string,
  controllable: PhysicalRobot[]
): PhysicalAIObservation["actionGuidance"] {
  const nextBestActions: PhysicalAIObservation["actionGuidance"]["nextBestActions"] = [];
  const recommend = (type: string, args: Record<string, unknown>, reason: string) => {
    nextBestActions.push({ type, arguments: args, reason });
  };
  const mobile = controllable.find((robot) => robot.type === "mobile");
  const conveyor = requireObject(state, "conveyor-01");
  const obstacle = requireObject(state, "obstacle-o2");
  const packageObject = requireObject(state, "package-p3");
  let currentGoal = state.objectives.find((item) => item.status === "active")?.description ??
    "Keep the fleet safe and complete the mission.";

  if (!state.plan) {
    currentGoal = "Authorize a safety-first plan before moving any robot.";
    recommend("mission.submit_plan", {
      summary: "Inspect in parallel, clear the north aisle, position a receiver, transfer P3 with the fixed arm, then use the safe extraction corridor.",
      assignments: [
        { robotId: "mobile-01", objective: "Inspect and clear obstacle O2, then receive and deliver package P3." },
        { robotId: "mobile-02", objective: "Inspect the damaged conveyor and provide route support." },
        { robotId: "arm-01", objective: "Execute the predefined top-grasp package transfer." }
      ]
    }, "Submit the required mission plan.");
  } else if (!mobile) {
    recommend("team.signal", { signal: "hold_safe", targetId: "mobile-01" }, "No mobile robot is currently assigned to this participant.");
  } else if (!conveyor.inspected) {
    if (distance2d(mobile.pose, conveyor.pose) > 5.5) {
      recommend("robot.navigate", { robotId: mobile.id, target: { type: "object", objectId: conveyor.id }, speedProfile: "safe" }, "Move into camera range of the damaged conveyor.");
    } else {
      recommend("robot.inspect", { robotId: mobile.id, targetId: conveyor.id, sensor: "camera" }, "Inspect the conveyor and unlock the facility condition report.");
    }
  } else if (!obstacle.inspected) {
    if (distance2d(mobile.pose, obstacle.pose) > 2.2) {
      recommend("robot.navigate", { robotId: mobile.id, target: { type: "object", objectId: obstacle.id }, speedProfile: "safe" }, "Approach O2 from the safe south-side staging point.");
    } else {
      recommend("robot.inspect", { robotId: mobile.id, targetId: obstacle.id, sensor: "depth" }, "Measure O2 before physical manipulation.");
    }
  } else if (obstacle.state !== "cleared") {
    if (distance2d(mobile.pose, obstacle.pose) > 2.2) {
      recommend("robot.navigate", { robotId: mobile.id, target: { type: "object", objectId: obstacle.id }, speedProfile: "safe" }, "Stage beside O2 before pushing.");
    } else {
      recommend("robot.push", { robotId: mobile.id, objectId: obstacle.id, destinationId: "clearance-bay" }, "Move O2 into the marked clearance bay.");
    }
  } else if (!packageObject.inspected) {
    if (distance2d(mobile.pose, packageObject.pose) > 3) {
      recommend("robot.navigate", { robotId: mobile.id, target: { type: "waypoint", waypointId: "package-bay" }, speedProfile: "safe" }, "Enter the package identification bay.");
    } else {
      recommend("robot.inspect", { robotId: mobile.id, targetId: packageObject.id, sensor: "camera" }, "Confirm the visual identity of priority package P3.");
    }
  } else if (packageObject.state !== "carried" && packageObject.state !== "delivered") {
    if (distance2d(mobile.pose, packageObject.pose) > 2.8) {
      recommend("robot.navigate", { robotId: mobile.id, target: { type: "object", objectId: packageObject.id }, speedProfile: "safe" }, "Position the mobile receiver inside the arm handoff envelope.");
    } else {
      recommend("robot.activate_station", { robotId: "arm-01", stationId: "arm-01", commandId: "transfer-package" }, "Execute the validated top-grasp handoff to the waiting receiver.");
    }
  } else if (packageObject.state === "carried") {
    const carrier = state.robots.find((robot) => robot.payloadObjectId === packageObject.id);
    const canControlCarrier = carrier && (state.mode === "single_supervisor" || carrier.assignedParticipantId === participantId);
    const extraction = requireZone(state, "extraction-e1");
    if (!carrier || !canControlCarrier) {
      recommend("team.signal", { signal: "proceed_to_extraction", targetId: carrier?.id ?? packageObject.id }, "The teammate carrying P3 owns the next motion command.");
    } else if (distance2d(carrier.pose, extraction.center) > extraction.radius) {
      recommend("robot.navigate", { robotId: carrier.id, target: { type: "zone", zoneId: extraction.id }, speedProfile: "safe" }, "Carry P3 through the safe corridor into extraction E1.");
    } else {
      recommend("robot.place", { robotId: carrier.id, objectId: packageObject.id, destinationId: extraction.id }, "Release P3 inside the authoritative extraction volume.");
    }
  }

  return {
    currentGoal,
    nextBestActions,
    exactIds: {
      controllableRobotIds: controllable.map((robot) => robot.id),
      objectIds: [...new Set([...state.knownObjectIds, "package-p3"])],
      zoneIds: state.zones.map((zone) => zone.id),
      waypointIds: ["inspection-a", "north-aisle", "package-bay", "safe-corridor", "extraction-e1"]
    },
    rules: [
      "Choose one object from nextBestActions and copy its arguments exactly when it is still applicable.",
      "Only command controllableRobotIds; the fixed arm is shared through robot.activate_station.",
      "Use safe speed near hazard-h1 and never manipulate an uninspected object."
    ]
  };
}

function action(type: string, argumentsValue: Record<string, unknown>, summary: string): AgentActResult<PhysicalAIAction> {
  return { action: { id: randomUUID(), type, arguments: argumentsValue, summary } };
}

function parseMode(value: unknown): MissionMode {
  return value === "two_agent_cooperation" || value === "human_agent_team" ? value : "single_supervisor";
}

function parseParticipantIds(value: unknown, mode: MissionMode): string[] {
  const ids = Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0) : [];
  if (ids.length) return ids;
  return mode === "single_supervisor" ? ["supervisor"] : ["alpha", "beta"];
}

function requireRobot(state: PhysicalAIState, id: string): PhysicalRobot {
  const robotValue = state.robots.find((item) => item.id === id);
  if (!robotValue) throw new Error(`Robot "${id}" does not exist.`);
  if (robotValue.status === "disabled") throw new Error(`Robot "${id}" is disabled.`);
  return robotValue;
}

function requireObject(state: PhysicalAIState, id: string): MissionObject {
  const objectValue = state.objects.find((item) => item.id === id);
  if (!objectValue) throw new Error(`Object "${id}" does not exist.`);
  return objectValue;
}

function requireZone(state: PhysicalAIState, id: string): MissionZone {
  const zoneValue = state.zones.find((item) => item.id === id);
  if (!zoneValue) throw new Error(`Zone "${id}" does not exist.`);
  return zoneValue;
}

function objective(state: PhysicalAIState, id: string) {
  const item = state.objectives.find((value) => value.id === id);
  if (!item) throw new Error(`Objective "${id}" does not exist.`);
  return item;
}

function completeObjective(state: PhysicalAIState, id: string) {
  const item = objective(state, id);
  item.status = "completed";
  item.completedAtStep = state.step;
}

function activateObjective(state: PhysicalAIState, id: string) {
  const item = objective(state, id);
  if (item.status === "pending") item.status = "active";
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`"${field}" must be a non-empty string.`);
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length ? value : undefined;
}

function actionDuration(type: string): number {
  return type === "robot.navigate" ? 8 : type === "robot.activate_station" ? 12 : type === "robot.push" ? 7 : 3;
}

function heading(from: Pose, to: { x: number; z: number }): number {
  return Math.atan2(to.x - from.x, to.z - from.z);
}

function distance2d(left: { x: number; z: number }, right: { x: number; z: number }): number {
  return Math.hypot(left.x - right.x, left.z - right.z);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function clampInteger(value: unknown, minimum: number, maximum: number, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.floor(clamp(value, minimum, maximum))
    : fallback;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

const environmentFactory: EnvironmentFactory = {
  metadata,
  create: () => new PhysicalAIMissionEnvironment()
};
const agentFactory: AgentFactory = {
  metadata: new MissionCoordinatorAgent().metadata,
  create: () => new MissionCoordinatorAgent()
};
const evaluatorFactory: EvaluatorFactory = {
  metadata: new PhysicalAIMissionEvaluator().metadata,
  create: () => new PhysicalAIMissionEvaluator()
};

export const physicalAIPlugin: ArenaPlugin = {
  manifest: {
    id: "arena.physical-ai",
    name: "Physical AI Mission Lab",
    version: "1.0.0",
    description:
      "External-simulator adapter, seeded reference warehouse mission, structured robot actions, safety, objective scoring, snapshots, and replay."
  },
  async register(context) {
    context.environments.register(metadata.id, environmentFactory);
    context.agents.register(agentFactory.metadata.id, agentFactory);
    context.evaluators.register(evaluatorFactory.metadata.id, evaluatorFactory);
  }
};
