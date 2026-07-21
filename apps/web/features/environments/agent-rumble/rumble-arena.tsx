"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, Html, OrbitControls } from "@react-three/drei";
import { forwardRef, useMemo, useRef } from "react";
import * as THREE from "three";
import type { RumbleFighter, RumbleState } from "@/lib/types";

export function RumbleArena({ state, compact = false, reducedMotion = false }: { state: RumbleState; compact?: boolean; reducedMotion?: boolean }) {
  return (
    <Canvas shadows={!compact} dpr={[1, compact ? 1.3 : 1.75]} camera={{ position: compact ? [11, 9, 13] : [13, 10, 15], fov: 40 }} gl={{ antialias: true }}>
      <color attach="background" args={["#9cc9d1"]} />
      <fog attach="fog" args={["#b5d4d2", 20, 39]} />
      <ambientLight intensity={1.35} color="#fff4dd" />
      <hemisphereLight args={["#dff6ff", "#6c4d2e", 1.35]} />
      <directionalLight position={[-8, 15, 7]} intensity={3.7} color="#fff2ca" castShadow={!compact} shadow-mapSize={[1024, 1024]} />
      <CrownfallArena pulse={state.arena.currentPulse} compact={compact} />
      {state.fighters.map((fighter) => (
        <Champion fighter={fighter} active={fighter.id === state.activeParticipantId && state.status !== "completed"} reducedMotion={reducedMotion} compact={compact} key={fighter.id} />
      ))}
      {!compact && <OrbitControls makeDefault minDistance={10} maxDistance={26} minPolarAngle={0.45} maxPolarAngle={1.35} target={[0, 1, 0]} />}
      <Environment preset="sunset" />
    </Canvas>
  );
}

function CrownfallArena({ pulse, compact }: { pulse: number; compact: boolean }) {
  const stands = useMemo(() => Array.from({ length: compact ? 18 : 34 }, (_, index) => {
    const angle = (index / (compact ? 18 : 34)) * Math.PI * 2;
    const radius = 12.2 + (index % 2) * 0.7;
    return { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius, angle, color: ["#a94032", "#246b7a", "#b88b2f", "#4d7b3d"][index % 4]! };
  }), [compact]);
  return (
    <group>
      <mesh receiveShadow position={[0, -0.7, 0]}>
        <cylinderGeometry args={[10.2, 11, 1.35, 48]} />
        <meshStandardMaterial color="#80633f" roughness={0.9} />
      </mesh>
      <mesh receiveShadow position={[0, 0, 0]}>
        <cylinderGeometry args={[9.85, 9.85, 0.16, 64]} />
        <meshStandardMaterial color="#8ca568" roughness={0.95} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.085, 0]} receiveShadow>
        <ringGeometry args={[2.3, 9.4, 64]} />
        <meshStandardMaterial color="#738d54" roughness={1} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.09, 0]}>
        <ringGeometry args={[8.95, 9.28, 64]} />
        <meshStandardMaterial color="#d0b15f" emissive="#e6b64c" emissiveIntensity={0.18 + pulse * 0.12} roughness={0.55} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.095, 0]}>
        <circleGeometry args={[2.2, 8]} />
        <meshStandardMaterial color="#c9b37d" roughness={0.78} />
      </mesh>
      {Array.from({ length: 8 }, (_, index) => {
        const angle = (index / 8) * Math.PI * 2;
        return <mesh key={index} rotation={[-Math.PI / 2, 0, angle]} position={[Math.cos(angle) * 5.75, 0.105, Math.sin(angle) * 5.75]}>
          <planeGeometry args={[0.1, 6.3]} /><meshBasicMaterial color="#d5c18a" transparent opacity={0.7} />
        </mesh>;
      })}
      {stands.map((stand, index) => <group position={[stand.x, 0, stand.z]} rotation-y={-stand.angle + Math.PI / 2} key={index}>
        <mesh castShadow position={[0, 1.1, 0]}><boxGeometry args={[1.8, 2.1, 1.45]} /><meshStandardMaterial color="#8f7b61" roughness={0.9} /></mesh>
        <mesh castShadow position={[0, 2.45, 0]}><coneGeometry args={[1.2, 1.1, 4]} /><meshStandardMaterial color={stand.color} roughness={0.7} /></mesh>
        <mesh position={[0, 1.15, -0.76]}><planeGeometry args={[0.65, 1.15]} /><meshStandardMaterial color={stand.color} side={THREE.DoubleSide} /></mesh>
      </group>)}
      {[[-10.7, -10.7], [10.7, -10.7], [-10.7, 10.7], [10.7, 10.7]].map(([x, z], index) => <CastleTower x={x!} z={z!} color={["#a94032", "#246b7a", "#b88b2f", "#4d7b3d"][index]!} key={index} />)}
    </group>
  );
}

function CastleTower({ x, z, color }: { x: number; z: number; color: string }) {
  return <group position={[x, 0, z]}>
    <mesh castShadow position={[0, 2.1, 0]}><cylinderGeometry args={[1.25, 1.45, 4.2, 8]} /><meshStandardMaterial color="#aa987b" roughness={0.88} /></mesh>
    <mesh castShadow position={[0, 4.45, 0]}><coneGeometry args={[1.55, 2.1, 8]} /><meshStandardMaterial color={color} roughness={0.72} /></mesh>
    <mesh position={[0, 3.7, 0]}><sphereGeometry args={[0.22, 10, 8]} /><meshStandardMaterial color="#e1c56b" metalness={0.55} /></mesh>
  </group>;
}

function Champion({ fighter, active, reducedMotion, compact }: { fighter: RumbleFighter; active: boolean; reducedMotion: boolean; compact: boolean }) {
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const leftArm = useRef<THREE.Group>(null);
  const rightArm = useRef<THREE.Group>(null);
  const leftLeg = useRef<THREE.Group>(null);
  const rightLeg = useRef<THREE.Group>(null);
  const target = useMemo(() => new THREE.Vector3(fighter.position.x, fighter.state === "eliminated" ? -0.25 : 0.58, fighter.position.z), [fighter.position.x, fighter.position.z, fighter.state]);
  useFrame(({ clock }, delta) => {
    if (!root.current || !body.current || !leftArm.current || !rightArm.current || !leftLeg.current || !rightLeg.current) return;
    const t = clock.elapsedTime;
    root.current.position.lerp(target, reducedMotion ? 1 : Math.min(1, delta * (fighter.state === "moving" ? 5.5 : 8.5)));
    const facing = Math.atan2(fighter.facing.x, fighter.facing.z);
    root.current.rotation.y = reducedMotion ? facing : THREE.MathUtils.damp(root.current.rotation.y, facing, 9, delta);
    const gait = reducedMotion ? 0 : Math.sin(t * 10) * (fighter.state === "moving" ? 0.72 : 0.05);
    const strike = fighter.state === "attacking" ? Math.sin(Math.min(1, (t * 2.1) % 1) * Math.PI) : 0;
    leftLeg.current.rotation.x = gait;
    rightLeg.current.rotation.x = -gait;
    leftArm.current.rotation.x = -gait * 0.65;
    rightArm.current.rotation.x = gait * 0.65 - strike * 1.65;
    rightArm.current.rotation.z = fighter.state === "attacking" ? -0.42 : 0;
    leftArm.current.rotation.z = fighter.state === "guarding" ? -1.05 : 0;
    body.current.rotation.z = fighter.state === "dodging" ? Math.sin(t * 7) * 0.32 : fighter.state === "staggered" ? Math.sin(t * 23) * 0.15 : 0;
    body.current.rotation.x = fighter.state === "grappling" ? -0.34 : fighter.state === "eliminated" ? 1.36 : 0;
  });
  const scale = fighter.archetype === "heavy" ? 1.15 : fighter.archetype === "agile" ? 0.9 : 1;
  return <group ref={root} position={target} scale={scale}>
    {active && <mesh rotation-x={-Math.PI / 2} position={[0, -0.5, 0]}><ringGeometry args={[0.72, 0.88, 32]} /><meshBasicMaterial color="#fff0a8" transparent opacity={0.9} /></mesh>}
    <group ref={body}>
      <Cape color={fighter.color} />
      <mesh castShadow position={[0, 0.65, 0]}><capsuleGeometry args={[0.4, 0.65, 8, 14]} /><meshStandardMaterial color={fighter.color} roughness={0.55} /></mesh>
      <mesh castShadow position={[0, 1.38, 0]}><sphereGeometry args={[0.34, 18, 14]} /><meshStandardMaterial color="#e6b982" roughness={0.62} /></mesh>
      <Helmet archetype={fighter.archetype} color={fighter.color} />
      <Arm ref={leftArm} side={-1} color={fighter.color} shield={fighter.archetype !== "agile"} />
      <Arm ref={rightArm} side={1} color={fighter.color} weapon archetype={fighter.archetype} />
      <Leg ref={leftLeg} side={-1} color={fighter.color} />
      <Leg ref={rightLeg} side={1} color={fighter.color} />
      {fighter.statusEffects.includes("impact-flash") && <mesh position={[0, 0.8, 0]}><sphereGeometry args={[0.85, 12, 10]} /><meshBasicMaterial color="#fff4b0" transparent opacity={0.32} wireframe /></mesh>}
      {fighter.abilityCharge >= 100 && <mesh rotation-x={-Math.PI / 2} position={[0, -0.48, 0]}><ringGeometry args={[0.9, 1.05, 32]} /><meshBasicMaterial color={fighter.color} transparent opacity={0.72} /></mesh>}
    </group>
    {!compact && <Html center position={[0, 2.35, 0]} distanceFactor={11}><div className="rumble-world-label" style={{ "--fighter": fighter.color } as React.CSSProperties}><b>{fighter.displayName}</b><span>{Math.ceil(fighter.health)} HP · {fighter.state.toUpperCase()}</span></div></Html>}
  </group>;
}

const Arm = forwardRef<THREE.Group, { side: number; color: string; shield?: boolean; weapon?: boolean; archetype?: RumbleFighter["archetype"] }>(function ArmInner({ side, color, shield, weapon, archetype = "balanced" }, ref) {
  return <group ref={ref} position={[side * 0.52, 0.93, 0]}>
    <mesh castShadow position={[0, -0.29, 0]}><capsuleGeometry args={[0.13, 0.48, 6, 10]} /><meshStandardMaterial color="#d7b17f" roughness={0.65} /></mesh>
    <mesh castShadow position={[0, 0.04, 0]}><sphereGeometry args={[0.22, 12, 10]} /><meshStandardMaterial color={color} roughness={0.5} /></mesh>
    {shield && <mesh castShadow position={[0, -0.3, 0.25]} rotation-x={Math.PI / 2}><cylinderGeometry args={[0.38, 0.34, 0.1, 8]} /><meshStandardMaterial color="#d5b457" metalness={0.45} roughness={0.45} /></mesh>}
    {weapon && <Weapon archetype={archetype} color={color} />}
  </group>;
});

const Leg = forwardRef<THREE.Group, { side: number; color: string }>(function LegInner({ side, color }, ref) {
  return <group ref={ref} position={[side * 0.22, 0.25, 0]}><mesh castShadow position={[0, -0.32, 0]}><capsuleGeometry args={[0.15, 0.48, 6, 10]} /><meshStandardMaterial color="#5a4435" roughness={0.78} /></mesh><mesh castShadow position={[0, -0.64, 0.1]}><boxGeometry args={[0.28, 0.2, 0.48]} /><meshStandardMaterial color={color} roughness={0.62} /></mesh></group>;
});

function Weapon({ archetype, color }: { archetype: RumbleFighter["archetype"]; color: string }) {
  const heavy = archetype === "heavy";
  return <group position={[0, -0.72, 0.05]} rotation-z={-0.25}>
    <mesh position={[0, -0.42, 0]}><cylinderGeometry args={[0.045, 0.045, heavy ? 1.05 : 1.35, 8]} /><meshStandardMaterial color="#63452c" roughness={0.85} /></mesh>
    {heavy ? <mesh castShadow position={[0, -0.98, 0]}><boxGeometry args={[0.65, 0.35, 0.32]} /><meshStandardMaterial color="#52565c" metalness={0.6} roughness={0.42} /></mesh> : <mesh castShadow position={[0, -1.15, 0]} rotation-z={Math.PI / 4}><coneGeometry args={[0.18, 0.48, 4]} /><meshStandardMaterial color={color} metalness={0.55} roughness={0.3} /></mesh>}
  </group>;
}

function Helmet({ archetype, color }: { archetype: RumbleFighter["archetype"]; color: string }) {
  return <group position={[0, 1.53, 0]}><mesh castShadow><sphereGeometry args={[0.37, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62]} /><meshStandardMaterial color="#d9c47d" metalness={0.5} roughness={0.42} /></mesh><mesh position={[0, 0.25, 0]}><coneGeometry args={[archetype === "heavy" ? 0.2 : 0.13, archetype === "agile" ? 0.55 : 0.36, 8]} /><meshStandardMaterial color={color} roughness={0.45} /></mesh></group>;
}

function Cape({ color }: { color: string }) { return <mesh castShadow position={[0, 0.76, -0.31]} rotation-x={-0.12}><planeGeometry args={[0.72, 1.12]} /><meshStandardMaterial color={color} side={THREE.DoubleSide} roughness={0.9} /></mesh>; }

export function isRumbleState(value: unknown): value is RumbleState {
  return Boolean(value && typeof value === "object" && Array.isArray((value as RumbleState).fighters) && ["neon-coliseum", "crownfall-coliseum"].includes((value as RumbleState).arena?.id));
}
