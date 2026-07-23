"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  memo,
  useEffect,
  useMemo,
  useRef,
  type RefCallback,
} from "react";
import type { Mesh } from "three";

import {
  GravityPrototypeRuntime,
  TELEMETRY_INTERVAL_SECONDS,
  type PrototypeTelemetry,
} from "../runtime/GravityPrototypeRuntime";
import { INCLINED_BINARY_SEPARATION_M } from "../presets/inclinedBinary";

const SCENE_BINARY_SEPARATION = 8;
const SCENE_UNITS_PER_METER =
  SCENE_BINARY_SEPARATION / INCLINED_BINARY_SEPARATION_M;
const BODY_COLORS = ["#67e8f9", "#a5b4fc", "#f0abfc", "#fcd34d"];

type GravityCanvasProps = Readonly<{
  runtime: GravityPrototypeRuntime;
  onTelemetry: (telemetry: PrototypeTelemetry) => void;
  onReady: () => void;
  renderRevision: number;
}>;

type BinarySceneProps = Omit<GravityCanvasProps, "onReady">;

function FixedCamera() {
  const camera = useThree((state) => state.camera);

  useEffect(() => {
    camera.position.set(11, 8, 14);
    camera.lookAt(0, 0, 0);
  }, [camera]);

  return null;
}

function BinaryScene({
  runtime,
  onTelemetry,
  renderRevision,
}: BinarySceneProps) {
  const invalidate = useThree((state) => state.invalidate);
  const bodyIndices = useMemo(
    () => Array.from({ length: runtime.bodyCount }, (_, index) => index),
    [runtime]
  );
  const meshRefs = useRef<Array<Mesh | null>>([]);
  const telemetryElapsedSeconds = useRef(0);

  useEffect(() => {
    invalidate();
  }, [invalidate, renderRevision]);

  useFrame((state, deltaSeconds) => {
    const urgentTelemetry = runtime.advanceFrame(deltaSeconds);

    for (let bodyIndex = 0; bodyIndex < runtime.bodyCount; bodyIndex += 1) {
      const mesh = meshRefs.current[bodyIndex];

      if (mesh !== null && mesh !== undefined) {
        runtime.positions.writePositionM(bodyIndex, mesh.position);
        mesh.position.multiplyScalar(SCENE_UNITS_PER_METER);
      }
    }

    if (!runtime.isRunning) {
      telemetryElapsedSeconds.current = 0;
    } else {
      telemetryElapsedSeconds.current += deltaSeconds;
    }

    if (
      urgentTelemetry ||
      (runtime.isRunning &&
        telemetryElapsedSeconds.current >= TELEMETRY_INTERVAL_SECONDS)
    ) {
      telemetryElapsedSeconds.current %= TELEMETRY_INTERVAL_SECONDS;
      onTelemetry(runtime.telemetry());
    }

    if (runtime.isRunning) {
      state.invalidate();
    }
  });

  return (
    <>
      <FixedCamera />
      <color attach="background" args={["#060912"]} />
      <ambientLight intensity={0.35} />
      <directionalLight position={[5, 8, 6]} intensity={1.8} />
      <pointLight position={[0, 0, 0]} intensity={18} distance={28} />

      <gridHelper
        args={[24, 24, "#243548", "#13202f"]}
        position={[0, -3.2, 0]}
      />
      <axesHelper args={[2.2]} />

      <mesh position={[0, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.14, 0.025, 8, 32]} />
        <meshBasicMaterial color="#94a3b8" />
      </mesh>

      {bodyIndices.map((bodyIndex) => {
        const setMeshRef: RefCallback<Mesh> = (mesh) => {
          meshRefs.current[bodyIndex] = mesh;
        };

        return (
          <mesh key={bodyIndex} ref={setMeshRef}>
            <sphereGeometry args={[0.58, 32, 32]} />
            <meshStandardMaterial
              color={BODY_COLORS[bodyIndex % BODY_COLORS.length]}
              emissive={BODY_COLORS[bodyIndex % BODY_COLORS.length]}
              emissiveIntensity={0.5}
              roughness={0.5}
            />
          </mesh>
        );
      })}
    </>
  );
}

export const GravityCanvas = memo(function GravityCanvas({
  runtime,
  onTelemetry,
  onReady,
  renderRevision,
}: GravityCanvasProps) {
  return (
    <div
      role="img"
      aria-label="Deux étoiles mobiles orbitent autour d’un barycentre marqué par un anneau, dans un plan incliné par rapport aux axes tridimensionnels."
      className="h-[65svh] min-h-72 max-h-[28rem] w-full overflow-hidden rounded-xl border border-border/80 bg-black/30 md:h-[70svh] md:max-h-[36rem]"
    >
      <Canvas
        camera={{ fov: 46, near: 0.1, far: 100, position: [11, 8, 14] }}
        dpr={[1, 1.5]}
        fallback={
          <div className="grid h-full place-items-center p-8 text-center text-sm text-muted-foreground">
            Visualisation tridimensionnelle de deux étoiles en orbite autour
            de leur barycentre commun.
          </div>
        }
        frameloop="demand"
        gl={{ antialias: true, powerPreference: "high-performance" }}
        onCreated={(state) => {
          onReady();
          state.invalidate();
        }}
      >
        <BinaryScene
          runtime={runtime}
          onTelemetry={onTelemetry}
          renderRevision={renderRevision}
        />
      </Canvas>
    </div>
  );
});
