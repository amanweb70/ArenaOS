"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Html, OrbitControls, RoundedBox, Text } from "@react-three/drei";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { PhysicalAIObject, PhysicalAIRobot, PhysicalAIState } from "@/lib/types";

type CameraMode = "broadcast" | "overhead" | "robot" | "arm";

export function PhysicalAIMissionScene({
  state,
  compact = false,
  reducedMotion = false,
  cameraMode = "broadcast"
}: {
  state: PhysicalAIState;
  compact?: boolean;
  reducedMotion?: boolean;
  cameraMode?: CameraMode;
}) {
  return (
    <Canvas
      shadows={!compact}
      dpr={[1, compact ? 1.3 : 1.75]}
      camera={{ position: compact ? [13, 6.8, 15] : [14, 6.8, 16], fov: 43 }}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.08 }}
    >
      <color attach="background" args={["#06090b"]} />
      <fog attach="fog" args={["#06090b", 19, 36]} />
      <ambientLight intensity={0.58} color="#b9d7dd" />
      <hemisphereLight args={["#d8f1f5", "#17120f", 0.9]} />
      <directionalLight castShadow={!compact} position={[5, 14, 7]} intensity={3.2} color="#fff1d5" />
      <pointLight position={[-7, 5, -3]} intensity={48} distance={15} color="#4ee4ff" />
      <pointLight position={[7, 5, 3]} intensity={58} distance={15} color="#ff724f" />
      <CameraRig mode={cameraMode} compact={compact} />
      <Factory state={state} compact={compact} />
      {state.robots.map((robot) => robot.type === "mobile" ? (
        <MobileRobot
          key={robot.id}
          robot={robot}
          active={robot.assignedParticipantId === state.activeParticipantId}
          reducedMotion={reducedMotion}
          compact={compact}
        />
      ) : (
        <IndustrialArm
          key={robot.id}
          robot={robot}
          active={state.recentEvents.some((event) => event.type === "station" || event.targetId === robot.id)}
          compact={compact}
          reducedMotion={reducedMotion}
        />
      ))}
      {state.objects.map((object) => <MissionProp object={object} key={object.id} />)}
      {!compact && cameraMode === "broadcast" && (
        <OrbitControls makeDefault minDistance={9} maxDistance={27} maxPolarAngle={1.45} target={[0, 1.1, 0]} />
      )}
      <Environment preset="warehouse" />
    </Canvas>
  );
}

function CameraRig({ mode, compact }: { mode: CameraMode; compact: boolean }) {
  const { camera } = useThree();
  const target = useMemo(() => ({
    position: new THREE.Vector3(...(
      mode === "overhead" ? [0, 18.5, 0.01] :
      mode === "robot" ? [-6.8, 3.2, -6.2] :
      mode === "arm" ? [10.5, 5.8, 8.5] :
      compact ? [13, 6.8, 15] : [14, 6.8, 16]
    ) as [number, number, number]),
    lookAt: new THREE.Vector3(...(
      mode === "robot" ? [-1, 0.7, 0] :
      mode === "arm" ? [4.8, 1.8, 2.2] : [0, 0.8, 0]
    ) as [number, number, number])
  }), [compact, mode]);
  useFrame(() => {
    if (mode === "broadcast") return;
    camera.position.lerp(target.position, 0.075);
    camera.lookAt(target.lookAt);
  });
  return null;
}

function Factory({ state, compact }: { state: PhysicalAIState; compact: boolean }) {
  return (
    <group>
      <mesh receiveShadow position={[0, -0.18, 0]}>
        <boxGeometry args={[18, 0.34, 14]} />
        <meshStandardMaterial color="#182124" metalness={0.35} roughness={0.78} />
      </mesh>
      <FloorMarkings />
      <FactoryShell />
      <StorageRack x={-6.8} z={1.6} color="#e56f46" />
      <StorageRack x={-4.7} z={1.6} color="#de9f46" />
      <StorageRack x={-6.8} z={-2.2} color="#4f9db0" />
      <StorageRack x={-4.7} z={-2.2} color="#77858b" />
      <Conveyor damaged={state.objects.find((object) => object.id === "conveyor-01")?.state === "damaged"} />
      <ControlCell />
      <ZoneRing x={6} z={-4} radius={1.6} color="#67f7a0" label="EXTRACTION E1" />
      <ZoneRing x={-5} z={4} radius={1.45} color="#57def1" label="CHARGE C1" />
      <ZoneRing x={-3.5} z={2.1} radius={1.15} color="#f4c85c" label="CLEARANCE" />
      <ZoneRing x={3} z={0.2} radius={1.35} color="#ff525b" label="THERMAL HAZARD" filled />
      {!compact && (
        <Html position={[-8.1, 5.2, -5.8]} center transform distanceFactor={11}>
          <div className="physical-world-label">FACTORY CELL 06 / {state.phase.toUpperCase()}</div>
        </Html>
      )}
    </group>
  );
}

function FloorMarkings() {
  return (
    <group position-y={0.005}>
      {Array.from({ length: 12 }, (_, index) => (
        <mesh position={[-7.7 + index * 1.4, 0, 0]} rotation-x={-Math.PI / 2} key={`x-${index}`}>
          <planeGeometry args={[0.018, 13.3]} /><meshBasicMaterial color="#2b3b3f" />
        </mesh>
      ))}
      {Array.from({ length: 9 }, (_, index) => (
        <mesh position={[0, 0, -6 + index * 1.5]} rotation-x={-Math.PI / 2} key={`z-${index}`}>
          <planeGeometry args={[17.5, 0.018]} /><meshBasicMaterial color="#2b3b3f" />
        </mesh>
      ))}
      <mesh position={[2.8, 0.012, -2.5]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[7.2, 0.12]} /><meshBasicMaterial color="#e5a94f" />
      </mesh>
      {Array.from({ length: 8 }, (_, index) => (
        <mesh position={[1.1 + index * 0.55, 0.014, 1.65]} rotation={[-Math.PI / 2, 0, -0.55]} key={`hazard-${index}`}>
          <planeGeometry args={[0.16, 2.7]} /><meshBasicMaterial color={index % 2 ? "#15191a" : "#eead3e"} />
        </mesh>
      ))}
    </group>
  );
}

function FactoryShell() {
  return (
    <group>
      <mesh receiveShadow position={[0, 3.2, -6.85]}><boxGeometry args={[18, 6.4, 0.22]} /><meshStandardMaterial color="#172126" metalness={0.5} roughness={0.58} /></mesh>
      <mesh receiveShadow position={[-8.85, 3.2, 0]}><boxGeometry args={[0.22, 6.4, 14]} /><meshStandardMaterial color="#151e22" metalness={0.5} roughness={0.6} /></mesh>
      {[-8, -4, 0, 4, 8].map((x) => <mesh castShadow position={[x, 3.35, -6.55]} key={`column-${x}`}><boxGeometry args={[0.24, 6.7, 0.35]} /><meshStandardMaterial color="#536166" metalness={0.88} roughness={0.26} /></mesh>)}
      {[-5.5, -2, 1.5, 5].map((z) => (
        <group position={[0, 7.8, z]} key={`truss-${z}`}>
          <mesh castShadow><boxGeometry args={[17.6, 0.18, 0.22]} /><meshStandardMaterial color="#46565b" metalness={0.9} /></mesh>
          {[-6, -2, 2, 6].map((x) => <mesh position={[x, -0.22, 0]} rotation-z={x % 4 ? 0.6 : -0.6} key={x}><boxGeometry args={[2.4, 0.1, 0.12]} /><meshStandardMaterial color="#59686c" metalness={0.85} /></mesh>)}
        </group>
      ))}
      {[-5.5, -1.8, 1.9, 5.6].map((x) => (
        <mesh position={[x, 5.75, -6.3]} key={`light-${x}`}><boxGeometry args={[2.2, 0.09, 0.34]} /><meshStandardMaterial color="#eefeff" emissive="#b7f4ff" emissiveIntensity={2.6} /></mesh>
      ))}
      <group position={[0, 5.15, -6.45]}>
        <mesh><cylinderGeometry args={[0.13, 0.13, 15.5, 16]} /><meshStandardMaterial color="#a3533d" metalness={0.75} /></mesh>
        {[-6, -2, 2, 6].map((x) => <mesh position={[0, 0, x]} rotation-x={Math.PI / 2} key={x}><cylinderGeometry args={[0.17, 0.17, 0.32, 16]} /><meshStandardMaterial color="#d26848" /></mesh>)}
      </group>
    </group>
  );
}

function StorageRack({ x, z, color }: { x: number; z: number; color: string }) {
  return (
    <group position={[x, 1.6, z]}>
      {[0, 1.25, 2.5].map((y) => <mesh castShadow position={[0, y - 1.25, 0]} key={y}><boxGeometry args={[1.55, 0.11, 3.1]} /><meshStandardMaterial color="#4b5a5f" metalness={0.88} roughness={0.24} /></mesh>)}
      {[-0.68, 0.68].flatMap((dx) => [-1.38, 1.38].map((dz) => <mesh castShadow position={[dx, 0, dz]} key={`${dx}-${dz}`}><boxGeometry args={[0.12, 3.25, 0.12]} /><meshStandardMaterial color="#68777b" metalness={0.9} /></mesh>))}
      {[-0.58, 0.1, 0.72].map((y, index) => <RoundedBox castShadow args={[1.18, 0.7, 1.02]} radius={0.05} position={[0, y, index % 2 ? 0.75 : -0.72]} key={y}><meshStandardMaterial color={index === 1 ? color : "#706a5d"} roughness={0.72} /></RoundedBox>)}
    </group>
  );
}

function Conveyor({ damaged }: { damaged: boolean }) {
  return (
    <group position={[0, 0.48, -1]}>
      <RoundedBox castShadow args={[5.6, 0.72, 1.45]} radius={0.12}><meshStandardMaterial color="#202c30" metalness={0.75} roughness={0.32} /></RoundedBox>
      <mesh position={[0, 0.42, 0]}><boxGeometry args={[5.15, 0.08, 1.12]} /><meshStandardMaterial color="#111719" roughness={0.82} /></mesh>
      {Array.from({ length: 10 }, (_, index) => <mesh rotation-z={Math.PI / 2} position={[-2.32 + index * 0.52, 0.45, 0]} key={index}><cylinderGeometry args={[0.115, 0.115, 1.08, 16]} /><meshStandardMaterial color={damaged && index === 5 ? "#cf5946" : "#8c999d"} metalness={0.92} roughness={0.18} /></mesh>)}
      {[-2.35, 2.35].map((x) => <group position={[x, -0.1, 0]} key={x}><mesh><boxGeometry args={[0.16, 1.05, 1.1]} /><meshStandardMaterial color="#4a595d" metalness={0.82} /></mesh></group>)}
      <group position={[1.55, 1.18, 0]}>
        <mesh><boxGeometry args={[0.15, 1.7, 1.85]} /><meshStandardMaterial color="#d5dadd" metalness={0.8} /></mesh>
        <mesh position={[0, 0.52, 0]}><boxGeometry args={[0.22, 0.16, 1.55]} /><meshStandardMaterial color="#59e9fa" emissive="#229caf" emissiveIntensity={2} /></mesh>
      </group>
    </group>
  );
}

function ControlCell() {
  return (
    <group position={[7.45, 1.45, -0.4]}>
      {[-0.85, 0.85].map((z) => <RoundedBox args={[1.05, 2.8, 1.25]} radius={0.08} position={[0, 0, z]} key={z}><meshStandardMaterial color="#263339" metalness={0.62} roughness={0.38} /></RoundedBox>)}
      {[-0.85, 0.85].map((z) => <group position={[-0.54, 0.35, z]} key={`screen-${z}`}><mesh rotation-y={Math.PI / 2}><planeGeometry args={[0.74, 0.9]} /><meshStandardMaterial color="#09212a" emissive="#1abbd3" emissiveIntensity={1.1} /></mesh></group>)}
      <mesh position={[-0.58, -0.58, 0.85]} rotation-y={Math.PI / 2}><circleGeometry args={[0.09, 20]} /><meshBasicMaterial color="#76f5a4" /></mesh>
    </group>
  );
}

function ZoneRing({ x, z, radius, color, label, filled = false }: { x: number; z: number; radius: number; color: string; label: string; filled?: boolean }) {
  return (
    <group position={[x, 0.035, z]}>
      <mesh rotation-x={Math.PI / 2}><ringGeometry args={[radius - 0.09, radius, 64]} /><meshBasicMaterial color={color} transparent opacity={0.9} side={THREE.DoubleSide} /></mesh>
      {filled && <mesh rotation-x={Math.PI / 2} position-y={-0.005}><circleGeometry args={[radius, 48]} /><meshBasicMaterial color={color} transparent opacity={0.09} /></mesh>}
      <Text rotation-x={-Math.PI / 2} position={[0, 0.01, radius + 0.23]} fontSize={0.16} color={color} anchorX="center">{label}</Text>
    </group>
  );
}

function MobileRobot({ robot, active, reducedMotion, compact }: { robot: PhysicalAIRobot; active: boolean; reducedMotion: boolean; compact: boolean }) {
  const group = useRef<THREE.Group>(null);
  const beacon = useRef<THREE.Mesh>(null);
  const target = useMemo(() => new THREE.Vector3(robot.pose.x, 0.12, robot.pose.z), [robot.pose.x, robot.pose.z]);
  useFrame(({ clock }) => {
    if (!group.current) return;
    if (reducedMotion) group.current.position.copy(target);
    else group.current.position.lerp(target, 0.09);
    group.current.rotation.y = THREE.MathUtils.lerp(group.current.rotation.y, robot.pose.heading, 0.09);
    if (beacon.current) beacon.current.rotation.y = clock.elapsedTime * 2.8;
  });
  return (
    <group ref={group} position={[robot.pose.x, 0.12, robot.pose.z]} rotation-y={robot.pose.heading}>
      {active && <pointLight position={[0, 1.55, 0]} intensity={42} distance={4.5} color={robot.color} />}
      <RoundedBox castShadow args={[1.45, 0.48, 1.75]} radius={0.16} position={[0, 0.45, 0]}><meshStandardMaterial color="#172126" metalness={0.86} roughness={0.23} /></RoundedBox>
      <mesh position={[0, 0.53, 0.88]}><boxGeometry args={[1.22, 0.2, 0.14]} /><meshStandardMaterial color={robot.color} emissive={robot.color} emissiveIntensity={0.55} /></mesh>
      {[-0.68, 0.68].flatMap((x) => [-0.58, 0, 0.58].map((z) => <mesh castShadow rotation-z={Math.PI / 2} position={[x, 0.3, z]} key={`${x}-${z}`}><cylinderGeometry args={[0.255, 0.255, 0.18, 20]} /><meshStandardMaterial color="#080b0d" roughness={0.72} /><mesh position={[0, 0.1, 0]}><cylinderGeometry args={[0.13, 0.13, 0.185, 16]} /><meshStandardMaterial color="#68767a" metalness={0.82} /></mesh></mesh>))}
      <RoundedBox castShadow args={[0.95, 0.52, 0.9]} radius={0.12} position={[0, 0.88, -0.08]}><meshStandardMaterial color="#2a383e" metalness={0.68} roughness={0.25} /></RoundedBox>
      <mesh position={[0, 1.2, -0.05]}><cylinderGeometry args={[0.085, 0.1, 0.48, 16]} /><meshStandardMaterial color="#a5b8bc" metalness={0.88} /></mesh>
      <mesh ref={beacon} position={[0, 1.48, -0.05]}><cylinderGeometry args={[0.25, 0.25, 0.11, 24]} /><meshStandardMaterial color="#101a1e" metalness={0.76} /><mesh position={[0, 0.07, 0]}><torusGeometry args={[0.2, 0.035, 8, 28]} /><meshStandardMaterial color={robot.color} emissive={robot.color} emissiveIntensity={2.4} /></mesh></mesh>
      {[-0.17, 0.17].map((x) => <mesh position={[x, 1.27, 0.14]} key={x}><sphereGeometry args={[0.075, 16, 12]} /><meshStandardMaterial color="#dffcff" emissive={robot.color} emissiveIntensity={2.3} /></mesh>)}
      {[-0.32, 0.32].map((x) => <mesh position={[x, 0.25, 1.18]} key={`fork-${x}`}><boxGeometry args={[0.12, 0.1, 0.72]} /><meshStandardMaterial color="#bcc5c6" metalness={0.92} /></mesh>)}
      {robot.payloadObjectId && <PackageCase position={[0, 1.38, 0.15]} />}
      {!compact && <Html center position={[0, 1.95, 0]}><div className={`physical-robot-label ${active ? "active" : ""}`}><b>{robot.displayName}</b><span>{robot.battery.toFixed(0)}% · {robot.status}</span></div></Html>}
    </group>
  );
}

function IndustrialArm({ robot, active, compact, reducedMotion }: { robot: PhysicalAIRobot; active: boolean; compact: boolean; reducedMotion: boolean }) {
  const shoulder = useRef<THREE.Group>(null);
  const elbow = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (reducedMotion || !active) return;
    if (shoulder.current) shoulder.current.rotation.z = -0.42 + Math.sin(clock.elapsedTime * 1.8) * 0.12;
    if (elbow.current) elbow.current.rotation.z = 1.02 + Math.sin(clock.elapsedTime * 1.8 + 0.8) * 0.16;
  });
  return (
    <group position={[robot.pose.x, 0, robot.pose.z]} rotation-y={robot.pose.heading}>
      <mesh castShadow position={[0, 0.28, 0]}><cylinderGeometry args={[0.72, 0.9, 0.56, 32]} /><meshStandardMaterial color="#26343a" metalness={0.88} roughness={0.24} /></mesh>
      <mesh position={[0, 0.59, 0]}><torusGeometry args={[0.52, 0.11, 12, 32]} /><meshStandardMaterial color={active ? "#75f69c" : "#ff7650"} emissive={active ? "#2a7f49" : "#762c1c"} emissiveIntensity={1.2} /></mesh>
      <group ref={shoulder} rotation-z={-0.42} position={[0, 0.7, 0]}>
        <mesh castShadow position={[0, 1.32, 0]}><boxGeometry args={[0.56, 2.65, 0.66]} /><meshStandardMaterial color="#dce4e4" metalness={0.7} roughness={0.22} /></mesh>
        <mesh position={[0, 2.58, 0]}><sphereGeometry args={[0.42, 24, 16]} /><meshStandardMaterial color="#37464b" metalness={0.82} /></mesh>
        <group ref={elbow} rotation-z={1.02} position={[0, 2.58, 0]}>
          <mesh castShadow position={[0, 1.05, 0]}><boxGeometry args={[0.48, 2.1, 0.58]} /><meshStandardMaterial color="#f18a59" metalness={0.58} roughness={0.28} /></mesh>
          <mesh position={[0, 2.08, 0]}><sphereGeometry args={[0.32, 20, 14]} /><meshStandardMaterial color="#27353a" metalness={0.85} /></mesh>
          <group position={[0, 2.45, 0]}>
            <mesh><boxGeometry args={[0.62, 0.34, 0.72]} /><meshStandardMaterial color="#172125" metalness={0.9} /></mesh>
            {[-0.22, 0.22].map((x) => <mesh position={[x, -0.34, 0]} key={x}><boxGeometry args={[0.11, 0.55, 0.16]} /><meshStandardMaterial color="#d7dfdf" metalness={0.9} /></mesh>)}
          </group>
        </group>
      </group>
      {!compact && <Html center position={[0, 4.8, 0]}><div className={`physical-robot-label ${active ? "active" : ""}`}><b>XR-7 TRANSFER ARM</b><span>{active ? "TOP-GRASP ACTIVE" : "CELL READY"}</span></div></Html>}
    </group>
  );
}

function PackageCase({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <RoundedBox castShadow args={[0.78, 0.62, 0.78]} radius={0.07}><meshStandardMaterial color="#f4ad45" metalness={0.38} roughness={0.4} emissive="#6f3300" emissiveIntensity={0.55} /></RoundedBox>
      <mesh position={[0, 0.32, 0]}><boxGeometry args={[0.36, 0.06, 0.42]} /><meshStandardMaterial color="#fff2c3" emissive="#e9bc52" emissiveIntensity={1.2} /></mesh>
      <mesh position={[0, 0, 0.4]}><planeGeometry args={[0.45, 0.23]} /><meshBasicMaterial color="#171b1b" /></mesh>
    </group>
  );
}

function MissionProp({ object }: { object: PhysicalAIObject }) {
  if (object.type === "station" || object.type === "conveyor" || (object.type === "package" && object.state === "carried")) return null;
  if (object.type === "hazard") return (
    <group position={[object.pose.x, 0.16, object.pose.z]}>
      <mesh rotation-x={-Math.PI / 2}><circleGeometry args={[0.72, 36]} /><meshBasicMaterial color="#ff3948" transparent opacity={0.22} /></mesh>
      <mesh position={[0, 0.25, 0]}><cylinderGeometry args={[0.34, 0.46, 0.5, 20]} /><meshStandardMaterial color="#262d2e" metalness={0.78} /></mesh>
      <mesh position={[0, 0.57, 0]}><coneGeometry args={[0.24, 0.58, 18]} /><meshStandardMaterial color="#ffc34d" emissive="#ff3c45" emissiveIntensity={1.4} /></mesh>
      <pointLight position={[0, 0.9, 0]} intensity={22} distance={3} color="#ff3d45" />
    </group>
  );
  if (object.type === "package") return <PackageCase position={[object.pose.x, 0.38, object.pose.z]} />;
  return (
    <group position={[object.pose.x, 0.55, object.pose.z]} rotation-y={object.pose.heading}>
      <mesh castShadow position={[0, -0.48, 0]}><boxGeometry args={[1.35, 0.12, 1.35]} /><meshStandardMaterial color="#66513d" roughness={0.76} /></mesh>
      <RoundedBox castShadow args={[1.14, 1.02, 1.14]} radius={0.055}><meshStandardMaterial color={object.state === "cleared" ? "#617176" : "#bc5a43"} metalness={0.3} roughness={0.52} /></RoundedBox>
      {[-0.42, 0.42].map((x) => <mesh position={[x, 0, 0.58]} key={x}><boxGeometry args={[0.09, 0.9, 0.04]} /><meshStandardMaterial color="#d29358" /></mesh>)}
      <Text position={[0, 0.05, 0.61]} fontSize={0.2} color="#fff0d0" anchorX="center">O2</Text>
    </group>
  );
}

export function isPhysicalAIState(value: unknown): value is PhysicalAIState {
  return Boolean(value && typeof value === "object" && (value as PhysicalAIState).missionId === "warehouse-rescue-relay-v1" && Array.isArray((value as PhysicalAIState).robots));
}
