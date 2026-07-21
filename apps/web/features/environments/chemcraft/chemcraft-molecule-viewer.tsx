"use client";

import { Canvas } from "@react-three/fiber";
import { ContactShadows, OrbitControls } from "@react-three/drei";
import { useMemo } from "react";
import { Quaternion, Vector3 } from "three";
import type { ChemCraftMolecule } from "@/lib/types";

type Atom = NonNullable<ChemCraftMolecule["conformer"]>["atoms"][number];
type Bond = NonNullable<ChemCraftMolecule["conformer"]>["bonds"][number];

export function ChemCraftMoleculeViewer({
  molecule,
  selectedAtom,
  onSelectAtom
}: {
  molecule?: ChemCraftMolecule;
  selectedAtom?: number;
  onSelectAtom?: (index: number) => void;
}) {
  const normalized = useMemo(
    () => normalize(molecule?.conformer?.atoms ?? []),
    [molecule?.conformer?.atoms]
  );
  if (!molecule?.conformer) {
    return (
      <div className="chem-viewer-empty">
        <span>3D COORDINATES NOT GENERATED</span>
        <p>Invoke the seeded conformer tool to create a local ETKDG structure.</p>
      </div>
    );
  }
  return (
    <div className="chem-molecule-viewer">
      <Canvas camera={{ position: [7, 5, 8], fov: 42 }} dpr={[1, 1.5]}>
        <color attach="background" args={["#05080c"]} />
        <fog attach="fog" args={["#05080c", 13, 24]} />
        <ambientLight intensity={0.75} />
        <directionalLight position={[5, 7, 5]} intensity={2.5} color="#d9f9ff" />
        <pointLight position={[-4, 2, -5]} intensity={22} color="#5ce1ff" distance={14} />
        <group rotation={[-0.25, 0.35, 0]}>
          {molecule.conformer.bonds.map((bond, index) => (
            <ChemBond
              key={`${bond.begin}-${bond.end}-${index}`}
              bond={bond}
              atoms={normalized}
              active={selectedAtom === bond.begin || selectedAtom === bond.end}
            />
          ))}
          {normalized.map((atom) => (
            <mesh
              castShadow
              key={atom.index}
              position={[atom.x, atom.y, atom.z]}
              scale={selectedAtom === atom.index ? 1.28 : 1}
              onClick={(event) => {
                event.stopPropagation();
                onSelectAtom?.(atom.index);
              }}
            >
              <sphereGeometry args={[atomRadius(atom.element), 22, 16]} />
              <meshStandardMaterial
                color={selectedAtom === atom.index ? "#ffe66d" : elementColor(atom.element)}
                emissive={selectedAtom === atom.index ? "#8c7411" : "#071017"}
                emissiveIntensity={0.45}
                roughness={0.3}
                metalness={0.1}
              />
            </mesh>
          ))}
        </group>
        <ContactShadows position={[0, -3.8, 0]} opacity={0.48} scale={13} blur={2.2} />
        <OrbitControls makeDefault enableDamping minDistance={5} maxDistance={16} />
      </Canvas>
      <div className="chem-viewer-label">
        <span>{molecule.conformer.method} / {molecule.conformer.optimization}</span>
        <b>{selectedAtom === undefined ? "SELECT AN ATOM" : `ATOM ${selectedAtom}`}</b>
      </div>
    </div>
  );
}

function ChemBond({
  bond,
  atoms,
  active
}: {
  bond: Bond;
  atoms: Atom[];
  active: boolean;
}) {
  const from = atoms.find((atom) => atom.index === bond.begin);
  const to = atoms.find((atom) => atom.index === bond.end);
  if (!from || !to) return null;
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
      <cylinderGeometry args={[active ? 0.075 : 0.045, active ? 0.075 : 0.045, length, 8]} />
      <meshStandardMaterial color={active ? "#ffe66d" : "#8096a8"} metalness={0.4} roughness={0.35} />
    </mesh>
  );
}

function normalize(atoms: Atom[]): Atom[] {
  if (!atoms.length) return [];
  const center = atoms.reduce(
    (sum, atom) => ({
      x: sum.x + atom.x / atoms.length,
      y: sum.y + atom.y / atoms.length,
      z: sum.z + atom.z / atoms.length
    }),
    { x: 0, y: 0, z: 0 }
  );
  const centered = atoms.map((atom) => ({
    ...atom,
    x: atom.x - center.x,
    y: atom.y - center.y,
    z: atom.z - center.z
  }));
  const maximum = Math.max(
    ...centered.flatMap((atom) => [Math.abs(atom.x), Math.abs(atom.y), Math.abs(atom.z)])
  );
  const scale = maximum ? 3.4 / maximum : 1;
  return centered.map((atom) => ({
    ...atom,
    x: atom.x * scale,
    y: atom.y * scale,
    z: atom.z * scale
  }));
}

function elementColor(element: string): string {
  return {
    H: "#e8f1f5",
    C: "#586b7d",
    N: "#497cff",
    O: "#ff4d62",
    F: "#70e000",
    Cl: "#70e000",
    S: "#ffd43b",
    P: "#ff922b"
  }[element] ?? "#c2ced6";
}

function atomRadius(element: string): number {
  return element === "H" ? 0.12 : element === "C" ? 0.21 : 0.235;
}
