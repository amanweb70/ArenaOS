"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, Environment, OrbitControls } from "@react-three/drei";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { MOUSE, Vector2, Vector3, type Group } from "three";
import type {
  ChessPieceSymbol,
  ChessSide,
  RoyalChessPiece,
  RoyalChessState
} from "@/lib/types";
import {
  boardPointToSquare,
  squareToBoardPosition
} from "./royal-chess-coordinates";

export type ChessCameraMode = "broadcast" | "top" | "white" | "black" | "free";

export function RoyalChessScene({
  state,
  cameraMode = "broadcast",
  reducedMotion = false,
  interactive = true,
  selectedSquare,
  legalTargets = [],
  onSquareSelect,
  onMoveDrop
}: {
  state: RoyalChessState;
  cameraMode?: ChessCameraMode;
  reducedMotion?: boolean;
  interactive?: boolean;
  selectedSquare?: string;
  legalTargets?: string[];
  onSquareSelect?: (square: string) => void;
  onMoveDrop?: (from: string, to: string) => void;
}) {
  const [internalSelected, setInternalSelected] = useState<string>();
  const selected = selectedSquare ?? internalSelected;
  const select = onSquareSelect ?? setInternalSelected;
  return (
    <div className="royal-canvas">
      <Canvas
        shadows
        dpr={[1, 1.6]}
        camera={{ position: [8.5, 8, 8.5], fov: 38, near: 0.1, far: 100 }}
        gl={{ antialias: true }}
      >
        <color attach="background" args={["#090807"]} />
        <fog attach="fog" args={["#090807", 16, 31]} />
        <ambientLight intensity={0.55} />
        <directionalLight
          castShadow
          position={[4, 11, 5]}
          intensity={3.2}
          color="#ffe1a4"
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
        />
        <pointLight position={[-7, 4, -5]} color="#8d241f" intensity={20} distance={18} />
        <pointLight position={[7, 3, 5]} color="#d8b66e" intensity={14} distance={16} />
        <Suspense fallback={null}>
          <RoyalBoard
            state={state}
            selected={selected}
            legalTargets={legalTargets}
            onSelect={interactive ? select : undefined}
            onMoveDrop={interactive ? onMoveDrop : undefined}
            reducedMotion={reducedMotion}
          />
          <Environment preset="warehouse" environmentIntensity={0.35} />
        </Suspense>
        <ContactShadows
          position={[0, -0.62, 0]}
          opacity={0.65}
          scale={22}
          blur={2.2}
          far={8}
        />
        <CameraRig mode={cameraMode} />
      </Canvas>
      <div className="canvas-corners" aria-hidden="true"><i /><i /><i /><i /></div>
      <div className="board-axis file-axis" aria-hidden="true">
        {cameraMode === "black" ? "H G F E D C B A" : "A B C D E F G H"}
      </div>
      <div className="board-axis rank-axis" aria-hidden="true">
        {cameraMode === "black" ? "1 2 3 4 5 6 7 8" : "8 7 6 5 4 3 2 1"}
      </div>
    </div>
  );
}

function CameraRig({ mode }: { mode: ChessCameraMode }) {
  const { camera } = useThree();
  const controls = useRef<any>(null);
  useEffect(() => {
    const positions: Record<Exclude<ChessCameraMode, "free">, [number, number, number]> = {
      broadcast: [8.5, 8, 8.5],
      top: [0, 14, 0.01],
      white: [0, 5.2, 10.5],
      black: [0, 5.2, -10.5]
    };
    if (mode !== "free") {
      camera.position.set(...positions[mode]);
      camera.lookAt(0, 0, 0);
      controls.current?.target.set(0, 0, 0);
      controls.current?.update();
    }
  }, [camera, mode]);
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enabled={mode === "free"}
      enableDamping
      dampingFactor={0.08}
      minDistance={7}
      maxDistance={19}
      minPolarAngle={0.22}
      maxPolarAngle={Math.PI / 2.08}
      mouseButtons={{ LEFT: undefined, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.ROTATE }}
    />
  );
}

function RoyalBoard({
  state,
  selected,
  legalTargets,
  onSelect,
  onMoveDrop,
  reducedMotion
}: {
  state: RoyalChessState;
  selected?: string;
  legalTargets: string[];
  onSelect?: (square: string) => void;
  onMoveDrop?: (from: string, to: string) => void;
  reducedMotion: boolean;
}) {
  const { camera, gl } = useThree();
  const drag = useRef<{ from: string; x: number; y: number } | undefined>(undefined);
  const [draggingSquare, setDraggingSquare] = useState<string>();
  const squares = useMemo(
    () =>
      Array.from({ length: 64 }, (_, index) => {
        const file = index % 8;
        const rankFromTop = Math.floor(index / 8);
        return {
          file,
          rankFromTop,
          square: `${String.fromCharCode(97 + file)}${8 - rankFromTop}`
        };
      }),
    []
  );
  const lastMove = state.lastMove;
  const checkedKing = state.inCheck
    ? state.board.find((piece) => piece.type === "k" && piece.side === state.turn)?.square
    : undefined;

  useEffect(() => {
    const finishDrag = (event: PointerEvent) => {
      const current = drag.current;
      if (!current) return;
      drag.current = undefined;
      setDraggingSquare(undefined);
      const distance = Math.hypot(event.clientX - current.x, event.clientY - current.y);
      if (distance < 7) return;
      const bounds = gl.domElement.getBoundingClientRect();
      const pointer = new Vector2(
        ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
        -((event.clientY - bounds.top) / bounds.height) * 2 + 1
      );
      const ray = new Vector3();
      camera.updateMatrixWorld();
      const origin = camera.position.clone();
      ray.set(pointer.x, pointer.y, 0.5).unproject(camera).sub(origin).normalize();
      const destination = origin
        .clone()
        .add(ray.multiplyScalar(origin.y / -ray.y));
      const square = boardPointToSquare(destination.x, destination.z);
      if (square && square !== current.from) onMoveDrop?.(current.from, square);
    };
    const cancelDrag = () => {
      drag.current = undefined;
      setDraggingSquare(undefined);
    };
    window.addEventListener("pointerup", finishDrag);
    window.addEventListener("pointercancel", cancelDrag);
    return () => {
      window.removeEventListener("pointerup", finishDrag);
      window.removeEventListener("pointercancel", cancelDrag);
    };
  }, [camera, gl, onMoveDrop]);

  const beginDrag = (square: string, event: { clientX: number; clientY: number }) => {
    if (!onMoveDrop) return;
    drag.current = { from: square, x: event.clientX, y: event.clientY };
    setDraggingSquare(square);
  };

  return (
    <group>
      <mesh castShadow receiveShadow position={[0, -0.45, 0]}>
        <boxGeometry args={[10.8, 0.55, 10.8]} />
        <meshStandardMaterial color="#3a1c10" roughness={0.42} metalness={0.12} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, -0.14, 0]}>
        <boxGeometry args={[9.25, 0.18, 9.25]} />
        <meshStandardMaterial color="#8b582f" roughness={0.36} metalness={0.08} />
      </mesh>
      {squares.map(({ file, rankFromTop, square }) => {
        const x = file - 3.5;
        const z = rankFromTop - 3.5;
        const highlighted =
          selected === square ||
          lastMove?.from === square ||
          lastMove?.to === square ||
          checkedKing === square;
        const legalTarget = legalTargets.includes(square);
        return (
          <mesh
            key={square}
            receiveShadow
            position={[x * 1.06, 0, z * 1.06]}
            onClick={(event) => {
              event.stopPropagation();
              onSelect?.(square);
            }}
          >
            <boxGeometry args={[1.06, highlighted || legalTarget ? 0.17 : 0.12, 1.06]} />
            <meshStandardMaterial
              color={
                checkedKing === square
                  ? "#8e251e"
                  : legalTarget
                    ? "#789052"
                  : highlighted
                    ? "#d4aa58"
                    : (file + rankFromTop) % 2
                      ? "#4b2616"
                      : "#d6bd89"
              }
              roughness={0.48}
              metalness={highlighted ? 0.25 : 0.05}
            />
          </mesh>
        );
      })}
      {state.board.map((piece) => (
        <AnimatedPiece
          key={`${piece.side}-${piece.type}-${piece.square}`}
          piece={piece}
          lastMove={lastMove}
          reducedMotion={reducedMotion}
          selected={selected === piece.square}
          onSelect={onSelect}
          dragging={draggingSquare === piece.square}
          onDragStart={piece.side === state.turn ? beginDrag : undefined}
        />
      ))}
      <RoyalRail />
    </group>
  );
}

function AnimatedPiece({
  piece,
  lastMove,
  reducedMotion,
  selected,
  onSelect,
  dragging,
  onDragStart
}: {
  piece: RoyalChessPiece;
  lastMove?: RoyalChessState["lastMove"];
  reducedMotion: boolean;
  selected: boolean;
  onSelect?: (square: string) => void;
  dragging: boolean;
  onDragStart?: (square: string, event: { clientX: number; clientY: number }) => void;
}) {
  const group = useRef<Group>(null);
  const target = squareToBoardPosition(piece.square);
  const start =
    !reducedMotion && lastMove?.to === piece.square
      ? squareToBoardPosition(lastMove.from)
      : target;
  const progress = useRef(reducedMotion ? 1 : 0);

  useFrame((_state, delta) => {
    if (!group.current || progress.current >= 1) return;
    progress.current = Math.min(1, progress.current + delta * 2.7);
    const eased = 1 - Math.pow(1 - progress.current, 3);
    group.current.position.x = start[0] + (target[0] - start[0]) * eased;
    group.current.position.z = start[2] + (target[2] - start[2]) * eased;
    group.current.position.y = Math.sin(progress.current * Math.PI) * 0.55;
  });

  return (
    <group
      ref={group}
      position={start}
      scale={dragging ? 1.08 : 1}
      onPointerDown={(event) => {
        event.stopPropagation();
        onDragStart?.(piece.square, event);
      }}
      onClick={(event) => {
        event.stopPropagation();
        onSelect?.(piece.square);
      }}
    >
      {selected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.045, 0]}>
          <ringGeometry args={[0.42, 0.53, 32]} />
          <meshBasicMaterial color="#f0cf83" />
        </mesh>
      )}
      <RoyalPiece type={piece.type} side={piece.side} />
    </group>
  );
}

function RoyalPiece({ type, side }: { type: ChessPieceSymbol; side: ChessSide }) {
  const color = side === "white" ? "#e8d7ae" : "#191817";
  const trim = side === "white" ? "#b88a43" : "#8f6b32";
  const material = { color, roughness: 0.28, metalness: side === "white" ? 0.12 : 0.35 };
  const scale = type === "p" ? 0.75 : type === "k" || type === "q" ? 1.03 : 0.9;
  return (
    <group scale={scale} rotation={[0, side === "white" ? 0 : Math.PI, 0]}>
      <mesh castShadow position={[0, 0.12, 0]}>
        <cylinderGeometry args={[0.42, 0.52, 0.22, 32]} />
        <meshStandardMaterial {...material} />
      </mesh>
      <mesh castShadow position={[0, 0.31, 0]}>
        <cylinderGeometry args={[0.29, 0.4, 0.22, 32]} />
        <meshStandardMaterial {...material} />
      </mesh>
      <PieceBody type={type} material={material} trim={trim} />
    </group>
  );
}

function PieceBody({
  type,
  material,
  trim
}: {
  type: ChessPieceSymbol;
  material: { color: string; roughness: number; metalness: number };
  trim: string;
}) {
  if (type === "p") {
    return (
      <>
        <mesh castShadow position={[0, 0.66, 0]}>
          <coneGeometry args={[0.28, 0.52, 28]} />
          <meshStandardMaterial {...material} />
        </mesh>
        <mesh castShadow position={[0, 1.02, 0]}>
          <sphereGeometry args={[0.22, 24, 16]} />
          <meshStandardMaterial {...material} />
        </mesh>
        <mesh castShadow position={[0, 1.27, 0]}>
          <coneGeometry args={[0.16, 0.23, 8]} />
          <meshStandardMaterial color={trim} roughness={0.25} metalness={0.5} />
        </mesh>
      </>
    );
  }
  if (type === "n") {
    return (
      <>
        <mesh castShadow position={[0, 0.72, 0]} rotation={[-0.18, 0, 0]}>
          <coneGeometry args={[0.34, 0.72, 20]} />
          <meshStandardMaterial {...material} />
        </mesh>
        <mesh castShadow position={[0, 1.2, -0.08]} rotation={[0.05, 0, 0]}>
          <boxGeometry args={[0.38, 0.55, 0.34]} />
          <meshStandardMaterial {...material} />
        </mesh>
        <mesh castShadow position={[0, 1.39, -0.26]} rotation={[0.7, 0, 0]}>
          <coneGeometry args={[0.2, 0.5, 16]} />
          <meshStandardMaterial {...material} />
        </mesh>
        <mesh position={[-0.11, 1.35, -0.43]}>
          <sphereGeometry args={[0.035, 8, 8]} />
          <meshBasicMaterial color={trim} />
        </mesh>
        <mesh position={[0.11, 1.35, -0.43]}>
          <sphereGeometry args={[0.035, 8, 8]} />
          <meshBasicMaterial color={trim} />
        </mesh>
      </>
    );
  }
  if (type === "r") {
    return (
      <>
        <mesh castShadow position={[0, 0.82, 0]}>
          <cylinderGeometry args={[0.3, 0.38, 0.8, 20]} />
          <meshStandardMaterial {...material} />
        </mesh>
        <mesh castShadow position={[0, 1.28, 0]}>
          <cylinderGeometry args={[0.43, 0.34, 0.25, 8]} />
          <meshStandardMaterial {...material} />
        </mesh>
        {[0, 1, 2, 3].map((index) => (
          <mesh
            castShadow
            key={index}
            position={[Math.sin(index * Math.PI / 2) * 0.3, 1.48, Math.cos(index * Math.PI / 2) * 0.3]}
          >
            <boxGeometry args={[0.19, 0.28, 0.19]} />
            <meshStandardMaterial color={trim} roughness={0.3} metalness={0.35} />
          </mesh>
        ))}
      </>
    );
  }
  const isKing = type === "k";
  const isQueen = type === "q";
  return (
    <>
      <mesh castShadow position={[0, 0.84, 0]}>
        <coneGeometry args={[0.34, 0.9, 28]} />
        <meshStandardMaterial {...material} />
      </mesh>
      <mesh castShadow position={[0, 1.25, 0]}>
        <torusGeometry args={[0.27, 0.06, 12, 28]} />
        <meshStandardMaterial color={trim} roughness={0.25} metalness={0.55} />
      </mesh>
      {type === "b" && (
        <>
          <mesh castShadow position={[0, 1.48, 0]}>
            <sphereGeometry args={[0.24, 24, 16]} />
            <meshStandardMaterial {...material} />
          </mesh>
          <mesh castShadow position={[0, 1.77, 0]}>
            <coneGeometry args={[0.12, 0.3, 16]} />
            <meshStandardMaterial color={trim} roughness={0.25} metalness={0.5} />
          </mesh>
        </>
      )}
      {(isKing || isQueen) && (
        <>
          <mesh castShadow position={[0, 1.5, 0]}>
            <cylinderGeometry args={[0.3, 0.2, 0.22, isKing ? 6 : 10]} />
            <meshStandardMaterial color={trim} roughness={0.25} metalness={0.55} />
          </mesh>
          {Array.from({ length: isKing ? 4 : 6 }, (_, index) => (
            <mesh
              castShadow
              key={index}
              position={[
                Math.sin((index / (isKing ? 4 : 6)) * Math.PI * 2) * 0.24,
                1.78,
                Math.cos((index / (isKing ? 4 : 6)) * Math.PI * 2) * 0.24
              ]}
            >
              <coneGeometry args={[0.08, 0.34, 8]} />
              <meshStandardMaterial color={trim} roughness={0.2} metalness={0.6} />
            </mesh>
          ))}
          <mesh castShadow position={[0, 1.96, 0]}>
            {isKing ? <boxGeometry args={[0.08, 0.38, 0.08]} /> : <sphereGeometry args={[0.1, 12, 8]} />}
            <meshStandardMaterial color={trim} roughness={0.2} metalness={0.6} />
          </mesh>
          {isKing && (
            <mesh castShadow position={[0, 2.02, 0]}>
              <boxGeometry args={[0.28, 0.08, 0.08]} />
              <meshStandardMaterial color={trim} roughness={0.2} metalness={0.6} />
            </mesh>
          )}
        </>
      )}
    </>
  );
}

function RoyalRail() {
  const rails: Array<[number, number, number, number, number]> = [
    [0, -0.2, 5.08, 10.4, 0.48],
    [0, -0.2, -5.08, 10.4, 0.48],
    [5.08, -0.2, 0, 0.48, 10.4],
    [-5.08, -0.2, 0, 0.48, 10.4]
  ];
  const corners: Array<[number, number]> = [
    [-4.65, -4.65],
    [4.65, -4.65],
    [-4.65, 4.65],
    [4.65, 4.65]
  ];
  return (
    <>
      {rails.map(([x, y, z, width, depth], index) => (
        <mesh castShadow key={index} position={[x, y, z]}>
          <boxGeometry args={[width, 0.38, depth]} />
          <meshStandardMaterial color="#5b2f19" roughness={0.35} metalness={0.12} />
        </mesh>
      ))}
      {corners.map(([x, z], index) => (
        <mesh castShadow key={index} position={[x, 0.02, z]}>
          <cylinderGeometry args={[0.24, 0.3, 0.32, 8]} />
          <meshStandardMaterial color="#b88943" roughness={0.25} metalness={0.55} />
        </mesh>
      ))}
    </>
  );
}

export function isRoyalChessState(value: unknown): value is RoyalChessState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<RoyalChessState>;
  return (
    typeof state.fen === "string" &&
    Array.isArray(state.board) &&
    Array.isArray(state.history) &&
    Boolean(state.participants)
  );
}
