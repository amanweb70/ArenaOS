"use client";

import type { PhysicalAIState } from "@/lib/types";
import { PhysicalAIMissionScene } from "./physical-ai-scene";

export function PhysicalAIPreview() {
  return (
    <div className="physical-preview">
      <PhysicalAIMissionScene state={previewState} compact reducedMotion />
      <div className="physical-preview-top"><span>PHYSICAL WORLD / 06</span><b>WAREHOUSE RESCUE RELAY</b></div>
      <div className="physical-preview-bottom"><span><i /> REFERENCE MISSION TWIN</span><b>42% COMPLETE</b></div>
    </div>
  );
}

export const previewState: PhysicalAIState = {
  missionId: "warehouse-rescue-relay-v1",
  missionName: "Warehouse Rescue Relay",
  status: "running",
  phase: "execution",
  mode: "single_supervisor",
  seed: 606,
  step: 5,
  sequence: 8,
  simulationTime: 38,
  timeLimitSeconds: 360,
  completionPercent: 42,
  activeParticipantId: "supervisor",
  participantIds: ["supervisor"],
  actedThisCycle: [],
  backend: {
    adapter: "arena-reference",
    connected: true,
    bridgeVersion: "0.1.0",
    protocolVersion: "1.0",
    isaacAvailable: false,
    streamingAvailable: false,
    physicsEngine: "seeded-reference",
    reproducibility: "deterministic-reference",
    disclosure: "Reference mission backend."
  },
  robots: [
    mobile("mobile-01", "ATLAS-01", "#63e9ff", -0.6, 1.4, "supervisor", 87),
    mobile("mobile-02", "ATLAS-02", "#ffb85c", -1.3, -1.7, "supervisor", 91),
    {
      ...mobile("arm-01", "GANTRY ARM", "#9cff70", 5.2, 2.8, undefined, 100),
      type: "fixed_arm",
      capabilities: ["pick", "place", "transfer-package"]
    }
  ],
  objects: [
    object("conveyor-01", "Damaged Conveyor", "conveyor", 0, -1, "damaged", false, true),
    object("obstacle-o2", "Blocked Cargo Crate O2", "obstacle", 0.5, 2.1, "blocking", true, true),
    object("hazard-h1", "Thermal Hazard H1", "hazard", 3, 0.2, "active", false, false),
    object("package-p3", "Priority Package P3", "package", 5, 2.5, "located", true, true),
    object("arm-01", "Gantry Manipulator", "station", 5.2, 2.8, "ready", false, true)
  ],
  zones: [
    { id: "clearance-bay", label: "Clearance", type: "clearance", center: { x: -3.5, z: 2.1 }, radius: 1.2, state: "active" },
    { id: "charger-c1", label: "Charger", type: "charger", center: { x: -5, z: 4 }, radius: 1.5, state: "active" },
    { id: "extraction-e1", label: "Extraction", type: "extraction", center: { x: 6, z: -4 }, radius: 1.6, state: "active" }
  ],
  objectives: [
    { id: "plan", label: "Mission plan", description: "Plan", status: "completed" },
    { id: "inspect", label: "Inspect facility", description: "Inspect", status: "completed" },
    { id: "clear", label: "Clear route", description: "Clear", status: "active" },
    { id: "arm", label: "Operate arm", description: "Arm", status: "pending" },
    { id: "deliver", label: "Extract package", description: "Deliver", status: "pending" }
  ],
  metrics: { collisions: 0, hazardContacts: 0, energyUsed: 11, distanceTravelled: 12, validActions: 5, invalidActions: 0, usefulSignals: 1, duplicateTaskAttempts: 0, recoveries: 0, scoreEstimate: 47 },
  knownObjectIds: ["conveyor-01", "obstacle-o2", "hazard-h1", "package-p3", "arm-01"],
  activeSignals: [],
  recentEvents: [],
  eventHistory: [],
  snapshots: []
};

function mobile(id: string, displayName: string, color: string, x: number, z: number, assignedParticipantId: string | undefined, battery: number) {
  return {
    id, displayName, color, assignedParticipantId, battery,
    type: "mobile" as const,
    pose: { x, y: 0, z, heading: 0 },
    status: "idle",
    capabilities: ["navigate", "inspect", "push", "place", "charge"],
    sensors: { camera: true, depth: true, lidar: false, proximity: true, contact: true },
    stats: { distanceTravelled: 0, energyUsed: 0, actions: 0, invalidActions: 0, collisions: 0, hazardContacts: 0, inspections: 0, recoveryActions: 0 }
  };
}

function object(id: string, label: string, type: PhysicalAIState["objects"][number]["type"], x: number, z: number, state: string, movable: boolean, inspected: boolean) {
  return { id, label, type, pose: { x, y: 0, z, heading: 0 }, state, movable, inspected };
}
