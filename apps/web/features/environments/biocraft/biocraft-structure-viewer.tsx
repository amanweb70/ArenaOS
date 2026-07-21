"use client";

import { Canvas } from "@react-three/fiber";
import { ContactShadows, OrbitControls } from "@react-three/drei";
import { useMemo } from "react";
import { Quaternion, Vector3 } from "three";
import type { BioCraftState } from "@/lib/types";

type Residue = BioCraftState["biologicalAssets"]["structures"][number]["residues"][number];

export function BioCraftStructureViewer({
  residues,
  selectedPosition,
  onSelect
}: {
  residues: Residue[];
  selectedPosition?: number;
  onSelect?: (position: number) => void;
}) {
  const normalized = useMemo(() => normalizeCoordinates(residues), [residues]);
  return (
    <div className="bio-structure-viewer">
      <Canvas camera={{ position: [8, 6, 9], fov: 42 }} dpr={[1, 1.5]}>
        <color attach="background" args={["#07100f"]} />
        <fog attach="fog" args={["#07100f", 13, 26]} />
        <ambientLight intensity={0.7} />
        <directionalLight position={[5, 8, 4]} intensity={2.5} color="#d9ffbd" />
        <pointLight position={[-5, 2, -4]} intensity={18} color="#40e0d0" distance={14} />
        <group rotation={[-0.2, 0.35, 0]}>
          {normalized.slice(1).map((residue, index) => (
            <TraceBond
              key={`bond-${residue.position}`}
              from={normalized[index]!}
              to={residue}
              active={
                selectedPosition === residue.position ||
                selectedPosition === normalized[index]!.position
              }
            />
          ))}
          {normalized.map((residue) => (
            <mesh
              castShadow
              key={residue.position}
              position={[residue.x, residue.y, residue.z]}
              scale={selectedPosition === residue.position ? 1.9 : 1}
              onClick={(event) => {
                event.stopPropagation();
                onSelect?.(residue.position);
              }}
            >
              <sphereGeometry args={[0.115, 14, 10]} />
              <meshStandardMaterial
                color={selectedPosition === residue.position ? "#ff6db1" : residueColor(residue.position)}
                emissive={selectedPosition === residue.position ? "#8d174e" : "#062b27"}
                emissiveIntensity={0.55}
                roughness={0.32}
                metalness={0.18}
              />
            </mesh>
          ))}
        </group>
        <ContactShadows position={[0, -4.2, 0]} opacity={0.5} scale={14} blur={2} />
        <OrbitControls makeDefault enableDamping minDistance={6} maxDistance={17} />
      </Canvas>
      <div className="bio-structure-label">
        <span>RCSB 1UBQ / Cα TRACE</span>
        <b>{selectedPosition ? `RESIDUE ${selectedPosition}` : "SELECT A RESIDUE"}</b>
      </div>
    </div>
  );
}

function TraceBond({
  from,
  to,
  active
}: {
  from: Residue;
  to: Residue;
  active: boolean;
}) {
  const start = new Vector3(from.x, from.y, from.z);
  const end = new Vector3(to.x, to.y, to.z);
  const midpoint = start.clone().add(end).multiplyScalar(0.5);
  const length = start.distanceTo(end);
  const quaternion = new Quaternion().setFromUnitVectors(
    new Vector3(0, 1, 0),
    end.clone().sub(start).normalize()
  );
  return (
    <mesh position={midpoint} quaternion={quaternion}>
      <cylinderGeometry args={[active ? 0.09 : 0.055, active ? 0.09 : 0.055, length, 8]} />
      <meshStandardMaterial
        color={active ? "#ff6db1" : "#55d8c8"}
        emissive={active ? "#78163f" : "#073c37"}
        emissiveIntensity={0.45}
      />
    </mesh>
  );
}

function normalizeCoordinates(residues: Residue[]): Residue[] {
  if (!residues.length) return [];
  const center = residues.reduce(
    (sum, residue) => ({
      x: sum.x + residue.x / residues.length,
      y: sum.y + residue.y / residues.length,
      z: sum.z + residue.z / residues.length
    }),
    { x: 0, y: 0, z: 0 }
  );
  const centered = residues.map((residue) => ({
    ...residue,
    x: residue.x - center.x,
    y: residue.y - center.y,
    z: residue.z - center.z
  }));
  const maximum = Math.max(
    ...centered.flatMap((residue) => [
      Math.abs(residue.x),
      Math.abs(residue.y),
      Math.abs(residue.z)
    ])
  );
  const scale = maximum ? 3.8 / maximum : 1;
  return centered.map((residue) => ({
    ...residue,
    x: residue.x * scale,
    y: residue.y * scale,
    z: residue.z * scale
  }));
}

function residueColor(position: number): string {
  if (position >= 75) return "#ffd166";
  if (position === 44 || position === 48 || position === 63) return "#ff8fc2";
  if (position >= 23 && position <= 34) return "#a8ff60";
  return "#55d8c8";
}
