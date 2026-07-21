"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { ContactShadows, Sparkles } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

function Board() {
  const squares = useMemo(() => {
    const cells: Array<{ x: number; z: number; light: boolean }> = [];
    for (let row = 0; row < 8; row += 1) {
      for (let column = 0; column < 8; column += 1) {
        cells.push({ x: (column - 3.5) * 0.62, z: (row - 3.5) * 0.62, light: (row + column) % 2 === 0 });
      }
    }
    return cells;
  }, []);

  return (
    <group>
      <mesh receiveShadow position={[0, -0.72, 0]}>
        <cylinderGeometry args={[4.25, 4.72, 0.65, 8]} />
        <meshStandardMaterial color="#243555" metalness={0.58} roughness={0.34} />
      </mesh>
      <mesh receiveShadow position={[0, -1.03, 0]}>
        <cylinderGeometry args={[4.58, 5.05, 0.22, 8]} />
        <meshStandardMaterial color="#b57b35" emissive="#6d3a12" emissiveIntensity={0.25} metalness={0.72} roughness={0.28} />
      </mesh>
      <mesh receiveShadow position={[0, -0.3, 0]}>
        <boxGeometry args={[5.62, 0.3, 5.62]} />
        <meshStandardMaterial color="#162440" metalness={0.68} roughness={0.28} />
      </mesh>
      {squares.map((square) => (
        <mesh key={`${square.x}-${square.z}`} receiveShadow position={[square.x, 0, square.z]}>
          <boxGeometry args={[0.605, 0.18, 0.605]} />
          <meshStandardMaterial
            color={square.light ? "#d5a851" : "#315782"}
            metalness={square.light ? 0.48 : 0.62}
            roughness={0.3}
          />
        </mesh>
      ))}
      {[3.28, 3.7].map((radius) => <mesh key={radius} position={[0, -0.42 - (radius - 3.28) * 0.5, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[radius, 0.1, 10, 64]} /><meshStandardMaterial color={radius < 3.5 ? "#e7b64d" : "#5e7fa6"} emissive={radius < 3.5 ? "#8a4f16" : "#182d4a"} emissiveIntensity={0.45} metalness={0.8} /></mesh>)}
      {([[-3.2, -3.2], [3.2, -3.2], [-3.2, 3.2], [3.2, 3.2]] as const).map(([x, z], index) => (
        <group key={index} position={[x, -0.18, z]}>
          <mesh castShadow><cylinderGeometry args={[0.42, 0.56, 0.95, 8]} /><meshStandardMaterial color="#314b70" metalness={0.62} roughness={0.34} /></mesh>
          <mesh castShadow position={[0, 0.61, 0]}><cylinderGeometry args={[0.57, 0.45, 0.28, 8]} /><meshStandardMaterial color="#d9a847" metalness={0.65} roughness={0.3} /></mesh>
          <pointLight color={index % 2 ? "#ffb63f" : "#65bfff"} intensity={3} distance={3.2} position={[0, 0.8, 0]} />
        </group>
      ))}
    </group>
  );
}

function Astronaut({ position, reducedMotion }: { position: [number, number, number]; reducedMotion: boolean }) {
  const group = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!group.current || reducedMotion) return;
    const stride = Math.sin(clock.elapsedTime * 3.2);
    group.current.position.y = position[1] + Math.abs(stride) * 0.1;
    group.current.position.x = position[0] + Math.sin(clock.elapsedTime * 0.85) * 0.12;
  });
  return (
    <group ref={group} position={position} scale={0.8} rotation={[0.18, 0.58, -0.14]}>
      <mesh castShadow position={[0, 1.02, 0]}><sphereGeometry args={[0.43, 28, 20]} /><meshStandardMaterial color="#dce9ed" metalness={0.65} roughness={0.22} /></mesh>
      <mesh castShadow position={[0, 1.05, 0.32]}><sphereGeometry args={[0.31, 24, 16]} /><meshPhysicalMaterial color="#07141c" emissive="#1eb5d6" emissiveIntensity={0.45} metalness={0.8} roughness={0.1} /></mesh>
      <mesh castShadow position={[0, 0.34, 0]}><capsuleGeometry args={[0.36, 0.72, 8, 18]} /><meshStandardMaterial color="#d9e5e4" metalness={0.55} roughness={0.28} /></mesh>
      <mesh castShadow position={[0, 0.42, 0.34]}><boxGeometry args={[0.45, 0.3, 0.14]} /><meshStandardMaterial color="#173f47" emissive="#36dcff" emissiveIntensity={0.55} /></mesh>
      {[-1, 1].map((side) => <mesh key={side} castShadow position={[side * 0.38, 0.32, side * 0.18]} rotation={[side * 0.82, 0, side * -0.28]}><capsuleGeometry args={[0.1, 0.58, 6, 12]} /><meshStandardMaterial color="#bed1d3" metalness={0.52} roughness={0.3} /></mesh>)}
      {[-1, 1].map((side) => <mesh key={side} castShadow position={[side * 0.2, -0.42, side * 0.13]} rotation={[side * -0.45, 0, side * 0.1]}><capsuleGeometry args={[0.13, 0.58, 6, 12]} /><meshStandardMaterial color="#cbd9d8" metalness={0.48} roughness={0.32} /></mesh>)}
      <pointLight position={[0, 0.45, 0.48]} color="#4de3ff" intensity={1.3} distance={2.4} />
    </group>
  );
}

function Knight({ position, reducedMotion }: { position: [number, number, number]; reducedMotion: boolean }) {
  const sword = useRef<THREE.Group>(null);
  const fighter = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (reducedMotion) return;
    if (sword.current) sword.current.rotation.z = -0.55 + Math.sin(clock.elapsedTime * 2.1) * 0.55;
    if (fighter.current) fighter.current.position.y = position[1] + Math.abs(Math.sin(clock.elapsedTime * 2.1)) * 0.07;
  });
  return (
    <group ref={fighter} position={position} scale={0.86} rotation={[0.08, 0.18, -0.08]}>
      <mesh castShadow position={[0, 0.48, 0]}><capsuleGeometry args={[0.42, 0.78, 8, 18]} /><meshStandardMaterial color="#23322f" metalness={0.88} roughness={0.24} /></mesh>
      <mesh castShadow position={[0, 1.13, 0]}><sphereGeometry args={[0.4, 24, 18]} /><meshStandardMaterial color="#a9b8b1" metalness={0.92} roughness={0.2} /></mesh>
      <mesh castShadow position={[0, 1.43, 0]}><coneGeometry args={[0.28, 0.58, 5]} /><meshStandardMaterial color="#b8c4bd" metalness={0.9} roughness={0.18} /></mesh>
      <mesh castShadow position={[0, 1.13, 0.36]}><boxGeometry args={[0.5, 0.08, 0.08]} /><meshStandardMaterial color="#050807" /></mesh>
      <mesh castShadow position={[-0.55, 0.45, 0.15]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.46, 0.46, 0.12, 24]} /><meshStandardMaterial color="#762b33" metalness={0.7} roughness={0.3} /></mesh>
      <mesh position={[-0.55, 0.45, 0.23]}><torusGeometry args={[0.25, 0.035, 8, 24]} /><meshStandardMaterial color="#f0cb55" emissive="#8e6810" emissiveIntensity={0.4} /></mesh>
      <group ref={sword} position={[0.56, 0.55, 0]} rotation={[0.2, 0, -0.55]}>
        <mesh castShadow position={[0, 0.58, 0]}><boxGeometry args={[0.08, 1.18, 0.11]} /><meshStandardMaterial color="#dfe9e4" metalness={1} roughness={0.13} /></mesh>
        <mesh castShadow position={[0, -0.08, 0]}><boxGeometry args={[0.48, 0.08, 0.12]} /><meshStandardMaterial color="#efca4a" metalness={0.8} roughness={0.22} /></mesh>
      </group>
    </group>
  );
}

function CrownBrawler({ position, reducedMotion }: { position: [number, number, number]; reducedMotion: boolean }) {
  const arm = useRef<THREE.Group>(null);
  const fighter = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (reducedMotion) return;
    if (arm.current) arm.current.rotation.x = -1.05 + Math.sin(clock.elapsedTime * 2.6) * 0.28;
    if (fighter.current) fighter.current.position.y = position[1] + Math.abs(Math.sin(clock.elapsedTime * 2.6)) * 0.09;
  });
  return (
    <group ref={fighter} position={position} scale={0.82} rotation={[0.15, -0.62, 0.13]}>
      <mesh castShadow position={[0, 0.45, 0]}><capsuleGeometry args={[0.48, 0.75, 8, 18]} /><meshStandardMaterial color="#245f96" metalness={0.35} roughness={0.42} /></mesh>
      <mesh castShadow position={[0, 1.16, 0]}><sphereGeometry args={[0.42, 24, 18]} /><meshStandardMaterial color="#d49c71" roughness={0.6} /></mesh>
      <mesh castShadow position={[0, 1.5, 0]}><cylinderGeometry args={[0.36, 0.28, 0.34, 5]} /><meshStandardMaterial color="#f1c647" emissive="#7f5b0b" emissiveIntensity={0.28} metalness={0.7} /></mesh>
      <mesh castShadow position={[0, 1.72, 0]}><coneGeometry args={[0.1, 0.35, 5]} /><meshStandardMaterial color="#f1c647" metalness={0.7} /></mesh>
      {[-1, 1].map((side) => <mesh key={side} castShadow position={[side * 0.2, -0.4, 0]}><capsuleGeometry args={[0.15, 0.52, 6, 12]} /><meshStandardMaterial color="#263948" roughness={0.5} /></mesh>)}
      <group ref={arm} position={[0.5, 0.73, 0]} rotation={[-1.05, 0, -0.4]}>
        <mesh castShadow position={[0, -0.25, 0]}><capsuleGeometry args={[0.14, 0.5, 6, 12]} /><meshStandardMaterial color="#d49c71" roughness={0.6} /></mesh>
        <mesh castShadow position={[0, -0.62, 0]}><sphereGeometry args={[0.25, 16, 12]} /><meshStandardMaterial color="#e6ad7e" roughness={0.6} /></mesh>
      </group>
      <mesh castShadow position={[-0.52, 0.35, 0]} rotation={[0, 0, -0.25]}><capsuleGeometry args={[0.14, 0.55, 6, 12]} /><meshStandardMaterial color="#d49c71" roughness={0.6} /></mesh>
    </group>
  );
}

function RobotArm({ reducedMotion }: { reducedMotion: boolean }) {
  const shoulder = useRef<THREE.Group>(null);
  const elbow = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (reducedMotion) return;
    const time = clock.elapsedTime;
    if (shoulder.current) shoulder.current.rotation.z = -0.7 + Math.sin(time * 0.65) * 0.22;
    if (elbow.current) elbow.current.rotation.z = 1.2 + Math.sin(time * 0.9 + 1) * 0.28;
  });
  return (
    <group position={[-2.95, 0.06, 0.95]} scale={0.58}>
      <mesh castShadow><cylinderGeometry args={[0.62, 0.75, 0.36, 28]} /><meshStandardMaterial color="#28302e" metalness={0.88} roughness={0.24} /></mesh>
      <group ref={shoulder} position={[0, 0.25, 0]} rotation={[0, 0, -0.7]}>
        <mesh castShadow position={[0, 0.75, 0]}><boxGeometry args={[0.38, 1.5, 0.4]} /><meshStandardMaterial color="#e2b83e" metalness={0.72} roughness={0.28} /></mesh>
        <mesh castShadow><sphereGeometry args={[0.36, 20, 16]} /><meshStandardMaterial color="#17201e" metalness={0.8} /></mesh>
        <group ref={elbow} position={[0, 1.5, 0]} rotation={[0, 0, 1.2]}>
          <mesh castShadow position={[0, 0.62, 0]}><boxGeometry args={[0.3, 1.25, 0.34]} /><meshStandardMaterial color="#d7ae38" metalness={0.72} roughness={0.26} /></mesh>
          <mesh castShadow><sphereGeometry args={[0.3, 20, 16]} /><meshStandardMaterial color="#17201e" metalness={0.8} /></mesh>
          <group position={[0, 1.28, 0]}>
            {[-1, 1].map((side) => <mesh key={side} castShadow position={[side * 0.19, 0.18, 0]} rotation={[0, 0, side * -0.35]}><boxGeometry args={[0.11, 0.5, 0.15]} /><meshStandardMaterial color="#b9c3bf" metalness={0.9} /></mesh>)}
          </group>
        </group>
      </group>
    </group>
  );
}

function TestTube() {
  return (
    <group position={[-2.2, 0.22, -1.85]} rotation={[0.05, 0, 0.12]}>
      <mesh castShadow position={[0, 0.42, 0]}><cylinderGeometry args={[0.18, 0.14, 1.2, 24]} /><meshPhysicalMaterial color="#b9ffff" transparent opacity={0.28} roughness={0.08} transmission={0.5} thickness={0.08} /></mesh>
      <mesh position={[0, 0.05, 0]}><cylinderGeometry args={[0.145, 0.115, 0.42, 24]} /><meshStandardMaterial color="#55ffd2" emissive="#20c89d" emissiveIntensity={1.1} transparent opacity={0.86} /></mesh>
      <mesh position={[0, 1.02, 0]}><torusGeometry args={[0.2, 0.04, 8, 24]} /><meshStandardMaterial color="#d6f1ed" metalness={0.45} /></mesh>
      <pointLight color="#52ffd2" intensity={1.8} distance={2.2} position={[0, 0.1, 0]} />
    </group>
  );
}

function MonumentSword() {
  return (
    <group position={[2.45, 0.36, -1.65]} rotation={[0.2, 0, -0.52]}>
      <mesh castShadow position={[0, 0.72, 0]}><boxGeometry args={[0.1, 1.55, 0.14]} /><meshStandardMaterial color="#e4eee9" metalness={1} roughness={0.12} /></mesh>
      <mesh castShadow position={[0, -0.08, 0]}><boxGeometry args={[0.72, 0.11, 0.17]} /><meshStandardMaterial color="#e8c546" metalness={0.84} roughness={0.2} /></mesh>
      <mesh castShadow position={[0, -0.42, 0]}><cylinderGeometry args={[0.09, 0.11, 0.64, 12]} /><meshStandardMaterial color="#713745" roughness={0.45} /></mesh>
    </group>
  );
}

function BoltSegment({ from, to }: { from: [number, number, number]; to: [number, number, number] }) {
  const start = new THREE.Vector3(...from);
  const end = new THREE.Vector3(...to);
  const midpoint = start.clone().add(end).multiplyScalar(0.5);
  const direction = end.clone().sub(start);
  const quaternion = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction.clone().normalize()
  );
  return (
    <group>
      <mesh position={midpoint} quaternion={quaternion}>
        <cylinderGeometry args={[0.022, 0.05, direction.length(), 6]} />
        <meshBasicMaterial color="#f4fdff" toneMapped={false} />
      </mesh>
      <mesh position={midpoint} quaternion={quaternion}>
        <cylinderGeometry args={[0.075, 0.105, direction.length(), 6]} />
        <meshBasicMaterial color="#66cfff" transparent opacity={0.18} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

function Lightning({ reducedMotion }: { reducedMotion: boolean }) {
  const bolt = useRef<THREE.Group>(null);
  const flash = useRef<THREE.PointLight>(null);
  const points: Array<[number, number, number]> = [
    [0.5, 5.8, -1.2], [0.1, 4.75, -0.95], [0.45, 3.95, -0.7],
    [-0.1, 3.05, -0.42], [0.25, 2.15, -0.18], [0, 1.15, 0.05]
  ];
  useFrame(({ clock }) => {
    const phase = clock.elapsedTime % 4.2;
    const active = reducedMotion ? false : (phase > 1.62 && phase < 1.82) || (phase > 1.96 && phase < 2.08);
    if (bolt.current) bolt.current.visible = active;
    if (flash.current) flash.current.intensity = active ? 22 : 0;
  });
  return (
    <group>
      <group ref={bolt} visible={false}>
        {points.slice(0, -1).map((point, index) => <BoltSegment key={index} from={point} to={points[index + 1]!} />)}
        <BoltSegment from={[0.45, 3.95, -0.7]} to={[1.15, 3.22, -0.82]} />
        <BoltSegment from={[-0.1, 3.05, -0.42]} to={[-0.82, 2.55, -0.18]} />
      </group>
      <pointLight ref={flash} color="#9de6ff" intensity={0} distance={12} position={[0, 3, 0]} />
    </group>
  );
}

function ArenaWorld({ reducedMotion }: { reducedMotion: boolean }) {
  const world = useRef<THREE.Group>(null);
  const start = useRef<number | null>(null);
  useFrame(({ clock }, delta) => {
    if (!world.current) return;
    if (start.current === null) start.current = clock.elapsedTime;
    const elapsed = clock.elapsedTime - start.current;
    const reveal = reducedMotion ? 1 : THREE.MathUtils.smoothstep(elapsed, 0, 1.65);
    world.current.scale.setScalar(reveal);
    world.current.position.y = -0.2 + reveal * 0.2 + (reducedMotion ? 0 : Math.sin(clock.elapsedTime * 0.55) * 0.06);
    world.current.rotation.y = THREE.MathUtils.damp(world.current.rotation.y, reducedMotion ? -0.15 : -0.15 + Math.sin(clock.elapsedTime * 0.22) * 0.08, 3, delta);
  });

  return (
    <group ref={world} rotation={[-0.04, -0.15, 0]}>
      <Board />
      <Astronaut position={[-1.7, 0.64, 0.72]} reducedMotion={reducedMotion} />
      <Knight position={[0, 0.64, 0.05]} reducedMotion={reducedMotion} />
      <CrownBrawler position={[1.75, 0.64, 0.72]} reducedMotion={reducedMotion} />
      <RobotArm reducedMotion={reducedMotion} />
      <TestTube />
      <MonumentSword />
      <Lightning reducedMotion={reducedMotion} />
      <Sparkles count={reducedMotion ? 18 : 58} scale={[8, 3.8, 6]} size={2.8} speed={reducedMotion ? 0 : 0.38} color="#ffcb55" opacity={0.65} />
    </group>
  );
}

export function HeroArena() {
  const reducedMotion = useReducedMotion();
  return (
    <div className="hero-arena" aria-label="Animated ArenaOS worlds diorama">
      <Canvas
        dpr={[1, 1.5]}
        camera={{ position: [0, 6.8, 9.8], fov: 40 }}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        shadows
      >
        <ambientLight intensity={0.42} />
        <hemisphereLight color="#badaff" groundColor="#100b18" intensity={1.45} />
        <directionalLight castShadow color="#fff1cf" intensity={4.2} position={[4, 9, 6]} shadow-mapSize={[1024, 1024]} />
        <pointLight color="#3ea6ff" intensity={11} distance={12} position={[-5, 2.5, 3]} />
        <pointLight color="#ff9f32" intensity={10} distance={11} position={[5, 2.8, -1]} />
        <spotLight color="#d7e8ff" intensity={18} angle={0.32} penumbra={0.7} position={[0, 9, 1]} target-position={[0, 0, 0]} />
        <ArenaWorld reducedMotion={reducedMotion} />
        <ContactShadows position={[0, -1.12, 0]} opacity={0.82} scale={13} blur={2.5} far={6} />
      </Canvas>
    </div>
  );
}
