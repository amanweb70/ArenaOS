"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, Html, OrbitControls, RoundedBox, Text } from "@react-three/drei";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { CouncilStatement, PersonaCraftState, PersonaDefinition } from "@/lib/types";

export function PersonaCouncilScene({
  state,
  compact = false,
  reducedMotion = false
}: {
  state: PersonaCraftState;
  compact?: boolean;
  reducedMotion?: boolean;
}) {
  return (
    <Canvas
      shadows={!compact}
      dpr={[1, compact ? 1.25 : 1.65]}
      camera={{ position: compact ? [0, 7.2, 15.8] : [0, 7.6, 16.8], fov: 40 }}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.1 }}
    >
      <color attach="background" args={["#05070c"]} />
      <fog attach="fog" args={["#05070c", 18, 36]} />
      <ambientLight intensity={0.72} color="#b9c8e8" />
      <hemisphereLight args={["#b8d7ff", "#160c14", 1.1]} />
      <directionalLight castShadow={!compact} position={[2, 13, 8]} intensity={2.8} color="#fff3df" />
      <DebateStudio state={state} compact={compact} />
      {state.personas.map((persona) => {
        const statement = [...state.transcript].reverse().find((item) => item.speakerId === persona.id);
        return (
          <BroadcastDelegate
            key={persona.id}
            persona={persona}
            statement={statement}
            active={persona.id === state.activeParticipantId && state.status !== "completed"}
            compact={compact}
            reducedMotion={reducedMotion}
          />
        );
      })}
      {!compact && <OrbitControls makeDefault minDistance={12} maxDistance={24} maxPolarAngle={1.42} target={[0, 2.1, -0.5]} />}
      <Environment preset="city" />
    </Canvas>
  );
}

function DebateStudio({ state, compact }: { state: PersonaCraftState; compact: boolean }) {
  const audience = useMemo(() => Array.from({ length: compact ? 34 : 74 }, (_, index) => {
    const side = index % 2 ? 1 : -1;
    const row = Math.floor(index / 18);
    const slot = Math.floor(index / 2) % 9;
    return {
      position: [side * (7.4 + row * 0.72), 0.7 + row * 0.48, -3.5 + slot * 1.15] as [number, number, number],
      color: ["#ed6e9f", "#58d8f0", "#f5bd57", "#9380e8"][index % 4]!
    };
  }), [compact]);
  const reaction = state.audience.dominantReaction.replaceAll("_", " ").toUpperCase();
  return (
    <group>
      <mesh receiveShadow rotation-x={-Math.PI / 2} position={[0, -0.03, 0]}>
        <planeGeometry args={[28, 26]} />
        <meshStandardMaterial color="#11151e" metalness={0.35} roughness={0.52} />
      </mesh>
      <mesh receiveShadow position={[0, 0.16, -0.6]}>
        <boxGeometry args={[14.4, 0.32, 7]} />
        <meshStandardMaterial color="#1b202a" metalness={0.56} roughness={0.28} />
      </mesh>
      <mesh position={[0, 0.34, -0.6]}>
        <boxGeometry args={[13.8, 0.05, 6.45]} />
        <meshStandardMaterial color="#29313e" metalness={0.32} roughness={0.42} />
      </mesh>
      {[-6.4, -2.15, 2.15, 6.4].map((x, index) => (
        <mesh key={x} position={[x, 0.39, -0.55]} rotation-x={-Math.PI / 2}>
          <ringGeometry args={[1.3, 1.43, 48]} />
          <meshBasicMaterial color={state.personas[index]?.color ?? "#55dff4"} transparent opacity={0.74} />
        </mesh>
      ))}
      <group position={[0, 4.75, -4.15]}>
        <RoundedBox args={[12.8, 4.6, 0.34]} radius={0.2} smoothness={4}>
          <meshStandardMaterial color="#080b12" metalness={0.72} roughness={0.18} />
        </RoundedBox>
        <mesh position={[0, 0, 0.2]}>
          <planeGeometry args={[12.25, 4.05]} />
          <meshStandardMaterial color="#102338" emissive="#0b3757" emissiveIntensity={1.25} />
        </mesh>
        <Text position={[0, 0.8, 0.23]} fontSize={0.34} color="#8be8ff" anchorX="center" anchorY="middle">ARENAOS WORLD DEBATE</Text>
        <Text position={[0, 0.14, 0.23]} maxWidth={10.5} textAlign="center" fontSize={0.26} lineHeight={1.3} color="#f8fafc" anchorX="center" anchorY="middle">{state.scenario.topic}</Text>
        <Text position={[0, -1.12, 0.23]} fontSize={0.2} color={state.audience.sentiment >= 50 ? "#71efc0" : "#ff7b91"} anchorX="center" anchorY="middle">AUDIENCE: {reaction}  ·  SENTIMENT {Math.round(state.audience.sentiment)}  ·  CONSENSUS {Math.round(state.world.consensus)}</Text>
      </group>
      <mesh position={[0, 7.25, -4.38]}>
        <boxGeometry args={[15.2, 0.18, 0.18]} />
        <meshStandardMaterial color="#303744" metalness={0.85} roughness={0.2} />
      </mesh>
      {[-6, -3, 0, 3, 6].map((x) => <StudioLamp key={x} x={x} color={x % 2 ? "#ff6fae" : "#72e4ff"} />)}
      {audience.map((member, index) => <AudienceMember key={index} {...member} energy={state.audience.energy} active={index % 7 === state.transcript.length % 7} />)}
      {!compact && <><StudioCamera position={[-7.2, 0, 5.2]} rotation={0.42} /><StudioCamera position={[7.2, 0, 5.2]} rotation={-0.42} /></>}
      <mesh position={[0, 0.45, 3.1]}>
        <boxGeometry args={[5.2, 0.65, 1.15]} />
        <meshStandardMaterial color="#151b25" metalness={0.62} roughness={0.26} />
      </mesh>
      <Text position={[0, 0.55, 3.69]} fontSize={0.23} color="#dce9f8" anchorX="center">COUNCIL NETWORK · LIVE ANALYSIS</Text>
    </group>
  );
}

function StudioLamp({ x, color }: { x: number; color: string }) {
  return <group position={[x, 6.9, -3.9]} rotation-x={0.42}><mesh><cylinderGeometry args={[0.28, 0.38, 0.62, 18]} /><meshStandardMaterial color="#171b23" metalness={0.8} /></mesh><spotLight position={[0, 0.25, 0.1]} angle={0.34} penumbra={0.72} intensity={38} color={color} distance={12} target-position={[0, -4, 3]} /></group>;
}

function StudioCamera({ position, rotation }: { position: [number, number, number]; rotation: number }) {
  return <group position={position} rotation-y={rotation}><mesh position={[0, 2.35, 0]}><boxGeometry args={[0.95, 0.62, 1.25]} /><meshStandardMaterial color="#161a21" metalness={0.76} roughness={0.24} /></mesh><mesh position={[0, 2.35, -0.76]} rotation-x={Math.PI / 2}><cylinderGeometry args={[0.3, 0.42, 0.55, 20]} /><meshPhysicalMaterial color="#22384d" metalness={0.7} roughness={0.05} clearcoat={1} /></mesh>{[-0.35,0.35].map((x)=><mesh key={x} position={[x,0.22,0]} rotation-z={Math.PI/2}><cylinderGeometry args={[0.24,0.24,0.16,16]} /><meshStandardMaterial color="#08090d" /></mesh>)}<mesh position={[0,1.25,0]}><cylinderGeometry args={[0.07,0.1,1.8,10]} /><meshStandardMaterial color="#3c424b" metalness={0.85} /></mesh></group>;
}

function AudienceMember({ position, color, energy, active }: { position: [number, number, number]; color: string; energy: number; active: boolean }) {
  const group = useRef<THREE.Group>(null);
  useFrame(({ clock }) => { if (group.current) group.current.position.y = position[1] + (active ? Math.sin(clock.elapsedTime * 5) * 0.08 * energy / 100 : 0); });
  return <group ref={group} position={position} rotation-y={position[0] > 0 ? -1.2 : 1.2}><mesh position={[0,0.38,0]}><capsuleGeometry args={[0.13,0.42,4,8]} /><meshStandardMaterial color="#252c38" roughness={0.8} /></mesh><mesh position={[0,0.94,0]}><sphereGeometry args={[0.18,12,9]} /><meshStandardMaterial color="#9b705a" roughness={0.72} /></mesh><mesh position={[0,0.38,0.12]}><boxGeometry args={[0.26,0.07,0.03]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={active ? 2.5 : 0.45} /></mesh></group>;
}

function BroadcastDelegate({ persona, statement, active, compact, reducedMotion }: { persona: PersonaDefinition; statement?: CouncilStatement; active: boolean; compact: boolean; reducedMotion: boolean }) {
  const positions: Array<[number, number, number]> = [[-6.4,0.4,-0.45],[-2.15,0.4,-0.65],[2.15,0.4,-0.65],[6.4,0.4,-0.45]];
  const score = Math.round((persona.metrics.influence + persona.metrics.reputation + persona.metrics.publicApproval) / 3);
  return <group position={positions[persona.seat % positions.length]}>
    {active && <><spotLight position={[0,8,2]} angle={0.28} penumbra={0.65} intensity={92} color={persona.color} distance={13} target-position={[0,1,0]} /><mesh rotation-x={-Math.PI/2} position={[0,-0.25,0]}><ringGeometry args={[1.25,1.5,48]} /><meshBasicMaterial color={persona.color} transparent opacity={0.8} /></mesh></>}
    <DelegateDesk persona={persona} active={active} />
    <DetailedPerson persona={persona} active={active} reducedMotion={reducedMotion} />
    {!compact && <Html center position={[0,4.2,0]} distanceFactor={10.5}><div className={`persona-speaker-card ${active ? "active" : ""}`} style={{"--persona":persona.color} as React.CSSProperties}><header><span>{active ? "● ON AIR" : `SEAT ${persona.seat + 1}`}</span><b>{score} PTS</b></header><strong>{persona.displayName}</strong>{active && <p>{statement?.message ?? `${persona.displayName} is taking the floor…`}</p>}<footer><span>LOGIC {Math.round(statement?.scores.logic ?? persona.metrics.logicScore)}</span><span>IMPACT {Math.round(statement?.scores.persuasion ?? persona.metrics.persuasionScore)}</span>{statement && <b>{statement.audienceDelta >= 0 ? "+" : ""}{statement.audienceDelta} AUD</b>}</footer></div></Html>}
  </group>;
}

function DelegateDesk({ persona, active }: { persona: PersonaDefinition; active: boolean }) {
  return <group><RoundedBox args={[2.45,1.25,1.05]} radius={0.16} smoothness={3} position={[0,0.58,0.38]} castShadow><meshStandardMaterial color="#141923" metalness={0.62} roughness={0.28} /></RoundedBox><mesh position={[0,0.72,0.92]}><planeGeometry args={[1.85,0.34]} /><meshStandardMaterial color={persona.color} emissive={persona.color} emissiveIntensity={active ? 2.8 : 0.65} /></mesh><mesh position={[0,1.27,0.14]} rotation-x={-0.12}><boxGeometry args={[2.2,0.08,0.85]} /><meshStandardMaterial color="#4b5667" metalness={0.82} roughness={0.16} /></mesh><mesh position={[-0.62,1.6,0.28]} rotation-z={0.08}><cylinderGeometry args={[0.025,0.035,0.75,10]} /><meshStandardMaterial color="#16191e" metalness={0.8} /></mesh><mesh position={[-0.59,1.97,0.28]}><sphereGeometry args={[0.08,12,8]} /><meshStandardMaterial color="#1c2028" /></mesh></group>;
}

function DetailedPerson({ persona, active, reducedMotion }: { persona: PersonaDefinition; active: boolean; reducedMotion: boolean }) {
  const root = useRef<THREE.Group>(null);
  const leftArm = useRef<THREE.Group>(null);
  const rightArm = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const style = persona.seat % 4;
  const skin = ["#9b654f", "#c5946d", "#a86c48", "#d1a17d"][style]!;
  const hair = ["#5b2924", "#1b1a1b", "#191318", "#3a2c27"][style]!;
  const suit = ["#50213b", "#173b46", "#554019", "#29213f"][style]!;
  useFrame(({ clock }, delta) => {
    const t = clock.elapsedTime;
    if (root.current) root.current.position.y = THREE.MathUtils.lerp(root.current.position.y, active ? 0.2 : 0, Math.min(1, delta * 5));
    if (head.current) head.current.rotation.y = reducedMotion ? 0 : Math.sin(t * 1.8 + style) * (active ? 0.09 : 0.025);
    if (leftArm.current) leftArm.current.rotation.z = active && !reducedMotion ? -0.42 + Math.sin(t * 2.7) * 0.22 : -0.08;
    if (rightArm.current) rightArm.current.rotation.z = active && !reducedMotion ? 0.56 + Math.cos(t * 2.25) * 0.28 : 0.08;
  });
  return <group ref={root} position={[0,0,-0.12]}>
    <mesh position={[0,2.1,0]} castShadow><capsuleGeometry args={[0.44,0.95,8,16]} /><meshStandardMaterial color={suit} roughness={0.58} /></mesh>
    <mesh position={[-0.18,2.14,0.43]} rotation-z={-0.22}><boxGeometry args={[0.32,0.84,0.035]} /><meshStandardMaterial color={persona.accent} roughness={0.5} /></mesh><mesh position={[0.18,2.14,0.43]} rotation-z={0.22}><boxGeometry args={[0.32,0.84,0.035]} /><meshStandardMaterial color={persona.accent} roughness={0.5} /></mesh>
    <mesh position={[0,2.15,0.48]}><boxGeometry args={[0.11,0.72,0.025]} /><meshStandardMaterial color={persona.color} emissive={persona.color} emissiveIntensity={0.45} /></mesh>
    <mesh position={[0,2.72,0]}><cylinderGeometry args={[0.19,0.21,0.34,18]} /><meshStandardMaterial color={skin} roughness={0.7} /></mesh>
    <group ref={head} position={[0,3.18,0]}>
      <mesh castShadow scale={[0.86,1.05,0.9]}><sphereGeometry args={[0.48,28,22]} /><meshStandardMaterial color={skin} roughness={0.68} /></mesh>
      <mesh position={[0,0,0.43]} rotation-x={Math.PI/2}><coneGeometry args={[0.09,0.22,12]} /><meshStandardMaterial color={skin} roughness={0.72} /></mesh>
      {[-0.17,0.17].map((x)=><group key={x} position={[x,0.09,0.41]}><mesh><sphereGeometry args={[0.065,14,10]} /><meshStandardMaterial color="#f4eee5" /></mesh><mesh position={[0,0,0.055]}><sphereGeometry args={[0.026,12,8]} /><meshBasicMaterial color="#182332" /></mesh><mesh position={[0,0.105,0.025]} rotation-z={x < 0 ? -0.08 : 0.08}><boxGeometry args={[0.15,0.025,0.025]} /><meshStandardMaterial color={hair} /></mesh></group>)}
      <mesh position={[0,-0.17,0.45]} scale={[1,active && !reducedMotion ? 0.58 : 0.28,1]}><capsuleGeometry args={[0.055,0.16,4,10]} /><meshStandardMaterial color="#6b3032" roughness={0.75} /></mesh>
      <Hair style={style} color={hair} />
      {style === 3 && <><mesh position={[0,0.08,0.47]}><boxGeometry args={[0.48,0.16,0.035]} /><meshPhysicalMaterial color="#1b2430" metalness={0.7} roughness={0.08} clearcoat={1} /></mesh><mesh position={[0,0.08,0.48]}><boxGeometry args={[0.05,0.03,0.04]} /><meshBasicMaterial color={persona.color} /></mesh></>}
    </group>
    <Arm ref={leftArm} side={-1} suit={suit} skin={skin} /><Arm ref={rightArm} side={1} suit={suit} skin={skin} />
    {[-0.25,0.25].map((x)=><mesh key={x} position={[x,1.18,-0.05]}><capsuleGeometry args={[0.15,0.65,6,12]} /><meshStandardMaterial color="#111722" roughness={0.7} /></mesh>)}
  </group>;
}

function Arm({ ref, side, suit, skin }: { ref: React.RefObject<THREE.Group | null>; side: number; suit: string; skin: string }) {
  return <group ref={ref} position={[side * 0.55,2.38,0]}><mesh position={[side*0.14,-0.33,0]} rotation-z={side*0.12}><capsuleGeometry args={[0.12,0.5,6,12]} /><meshStandardMaterial color={suit} roughness={0.6} /></mesh><mesh position={[side*0.28,-0.82,0.18]} rotation-z={side*0.38}><capsuleGeometry args={[0.1,0.45,6,12]} /><meshStandardMaterial color={skin} roughness={0.7} /></mesh><mesh position={[side*0.42,-1.1,0.31]}><sphereGeometry args={[0.14,16,12]} /><meshStandardMaterial color={skin} roughness={0.7} /></mesh></group>;
}

function Hair({ style, color }: { style: number; color: string }) {
  if (style === 0) return <group position={[0,0.37,-0.05]}>{[-0.32,-0.16,0,0.16,0.32].map((x)=><mesh key={x} position={[x,Math.abs(x)*-0.18,0]}><sphereGeometry args={[0.2,12,9]} /><meshStandardMaterial color={color} roughness={0.9} /></mesh>)}</group>;
  if (style === 1) return <mesh position={[0,0.34,-0.06]}><sphereGeometry args={[0.48,20,14,0,Math.PI*2,0,Math.PI/2]} /><meshStandardMaterial color={color} roughness={0.88} /></mesh>;
  if (style === 2) return <group position={[0,0.38,-0.02]}><mesh><cylinderGeometry args={[0.45,0.4,0.2,22]} /><meshStandardMaterial color={color} roughness={0.75} /></mesh><mesh position={[0,0.14,0]}><torusGeometry args={[0.3,0.075,10,30]} /><meshStandardMaterial color="#d7a943" metalness={0.75} roughness={0.2} /></mesh></group>;
  return <mesh position={[0,0.35,-0.06]}><sphereGeometry args={[0.46,20,14,0,Math.PI*2,0,Math.PI/2]} /><meshStandardMaterial color={color} roughness={0.88} /></mesh>;
}

export function isPersonaCraftState(value: unknown): value is PersonaCraftState {
  return Boolean(value && typeof value === "object" && Array.isArray((value as PersonaCraftState).personas) && (value as PersonaCraftState).scenario?.arena === "grand-ai-council");
}
