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
  TELEMETRY_INTERVAL_SECONDS,
  type PrototypeTelemetry,
} from "../runtime/GravityPrototypeRuntime";
import type { GravityLabSession } from "../runtime/GravityLabSession";

type GravityCanvasProps = Readonly<{
  session: GravityLabSession;
  selectedBodyId: string;
  onSelectBody: (
    source: GravityLabSession,
    bodyId: string
  ) => void;
  onTelemetry: (
    source: GravityLabSession,
    telemetry: PrototypeTelemetry
  ) => void;
  onReady: () => void;
  renderRevision: number;
}>;

type GravitySceneProps = Omit<GravityCanvasProps, "onReady">;

function FixedCamera() {
  const camera = useThree((state) => state.camera);

  useEffect(() => {
    camera.position.set(11, 8, 14);
    camera.lookAt(0, 0, 0);
  }, [camera]);

  return null;
}

function GravityScene({
  session,
  selectedBodyId,
  onSelectBody,
  onTelemetry,
  renderRevision,
}: GravitySceneProps) {
  const runtime = session.runtime;
  const invalidate = useThree((state) => state.invalidate);
  const bodies = useMemo(() => session.bodies, [session]);
  const meshRefs = useRef<Array<Mesh | null>>([]);
  const telemetryElapsedSeconds = useRef(0);

  useEffect(() => {
    meshRefs.current.length = bodies.length;
    telemetryElapsedSeconds.current = 0;
    invalidate();
  }, [bodies.length, invalidate, renderRevision, session]);

  useEffect(() => {
    invalidate();
  }, [invalidate, selectedBodyId]);

  useFrame((state, deltaSeconds) => {
    const urgentTelemetry = runtime.advanceFrame(deltaSeconds);

    for (let bodyIndex = 0; bodyIndex < bodies.length; bodyIndex += 1) {
      const mesh = meshRefs.current[bodyIndex];

      if (mesh !== null && mesh !== undefined) {
        session.writeScenePosition(
          bodies[bodyIndex].bodyId,
          mesh.position
        );
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
      onTelemetry(session, runtime.telemetry());
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

      {bodies.map((body, bodyIndex) => {
        const selected = body.bodyId === selectedBodyId;
        const setMeshRef: RefCallback<Mesh> = (mesh) => {
          meshRefs.current[bodyIndex] = mesh;
        };

        return (
          <mesh
            key={body.bodyId}
            ref={setMeshRef}
            name={body.name}
            scale={selected ? 1.3 : 1}
            onClick={(event) => {
              event.stopPropagation();
              onSelectBody(session, body.bodyId);
            }}
          >
            <sphereGeometry
              args={[body.graphicRadiusScene, 32, 32]}
            />
            <meshStandardMaterial
              color={body.color}
              emissive={body.color}
              emissiveIntensity={selected ? 1.4 : 0.5}
              roughness={0.5}
            />
          </mesh>
        );
      })}
    </>
  );
}

export const GravityCanvas = memo(function GravityCanvas({
  session,
  selectedBodyId,
  onSelectBody,
  onTelemetry,
  onReady,
  renderRevision,
}: GravityCanvasProps) {
  return (
    <div
      role="img"
      aria-label={`Simulation gravitationnelle tridimensionnelle de ${session.bodies.length} corps célestes.`}
      className="h-[65svh] min-h-72 max-h-[28rem] w-full overflow-hidden rounded-xl border border-border/80 bg-black/30 md:h-[70svh] md:max-h-[36rem]"
    >
      <Canvas
        camera={{ fov: 46, near: 0.1, far: 100, position: [11, 8, 14] }}
        dpr={[1, 1.5]}
        fallback={
          <div className="grid h-full place-items-center p-8 text-center text-sm text-muted-foreground">
            Visualisation tridimensionnelle du scénario gravitationnel.
          </div>
        }
        frameloop="demand"
        gl={{ antialias: true, powerPreference: "high-performance" }}
        onCreated={(state) => {
          onReady();
          state.invalidate();
        }}
      >
        <GravityScene
          session={session}
          selectedBodyId={selectedBodyId}
          onSelectBody={onSelectBody}
          onTelemetry={onTelemetry}
          renderRevision={renderRevision}
        />
      </Canvas>
    </div>
  );
});
