"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefCallback,
} from "react";
import { PerspectiveCamera, type Mesh } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import {
  TELEMETRY_INTERVAL_SECONDS,
  type PrototypeTelemetry,
} from "../runtime/GravityPrototypeRuntime";
import type { GravityLabSession } from "../runtime/GravityLabSession";
import {
  DEFAULT_GRAVITY_CAMERA_POSITION,
  DEFAULT_GRAVITY_CAMERA_TARGET,
  isBodySelectionClick,
} from "./cameraPolicy";
import { calculateCameraFraming } from "./cameraFraming";

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

type GravitySceneProps = Omit<GravityCanvasProps, "onReady"> &
  Readonly<{
    cameraResetRevision: number;
    cameraFramingRevision: number;
  }>;

function OrbitCameraControls({
  session,
  resetRevision,
  framingRevision,
}: Readonly<{
  session: GravityLabSession;
  resetRevision: number;
  framingRevision: number;
}>) {
  const camera = useThree((state) => state.camera);
  const domElement = useThree((state) => state.gl.domElement);
  const invalidate = useThree((state) => state.invalidate);
  const controlsRef = useRef<OrbitControls | null>(null);
  const handledResetRevision = useRef(resetRevision);
  const handledFramingRevision = useRef(framingRevision);
  const framedSession = useRef<GravityLabSession | null>(null);

  useEffect(() => {
    const controls = new OrbitControls(camera, domElement);
    const invalidateOnChange = () => invalidate();

    controls.enableDamping = false;
    controls.enablePan = true;
    controls.enableRotate = true;
    controls.enableZoom = true;
    controls.screenSpacePanning = true;
    controls.minDistance = 2;
    controls.maxDistance = 80;
    controls.target.set(...DEFAULT_GRAVITY_CAMERA_TARGET);
    controls.addEventListener("change", invalidateOnChange);
    controls.update();
    controlsRef.current = controls;

    return () => {
      controls.removeEventListener("change", invalidateOnChange);
      controls.dispose();
      controlsRef.current = null;
    };
  }, [camera, domElement, invalidate]);

  useEffect(() => {
    if (handledResetRevision.current === resetRevision) {
      return;
    }

    handledResetRevision.current = resetRevision;
    const controls = controlsRef.current;

    if (controls === null) {
      return;
    }

    const controlledCamera = controls.object;

    controlledCamera.position.set(...DEFAULT_GRAVITY_CAMERA_POSITION);
    controlledCamera.up.set(0, 1, 0);

    if (controlledCamera instanceof PerspectiveCamera) {
      // Three.js cameras are intentionally mutated at this imperative boundary.
      controlledCamera.near = 0.1;
      controlledCamera.far = 100;
      controlledCamera.updateProjectionMatrix();
    }

    controls.target.set(...DEFAULT_GRAVITY_CAMERA_TARGET);
    controls.update();
    invalidate();
  }, [camera, invalidate, resetRevision]);

  useEffect(() => {
    const sessionChanged = framedSession.current !== session;
    const explicitFramingRequested =
      handledFramingRevision.current !== framingRevision;

    if (!sessionChanged && !explicitFramingRequested) {
      return;
    }

    framedSession.current = session;
    handledFramingRevision.current = framingRevision;
    const controls = controlsRef.current;

    const controlledCamera = controls?.object;

    if (
      controls === null ||
      !(controlledCamera instanceof PerspectiveCamera)
    ) {
      return;
    }

    const positions = session.bodies.map(({ bodyId }) => {
      const position = { x: 0, y: 0, z: 0 };
      session.writeScenePosition(bodyId, position);
      return position;
    });
    const framing = calculateCameraFraming({
      positions,
      verticalFieldOfViewRadians:
        (controlledCamera.fov * Math.PI) / 180,
      aspectRatio: controlledCamera.aspect,
      viewDirection: {
        x: controlledCamera.position.x - controls.target.x,
        y: controlledCamera.position.y - controls.target.y,
        z: controlledCamera.position.z - controls.target.z,
      },
    });

    controlledCamera.position.set(
      framing.cameraPosition.x,
      framing.cameraPosition.y,
      framing.cameraPosition.z
    );
    // Keep compact and extended rendered systems inside the clipping planes.
    // eslint-disable-next-line react-hooks/immutability
    controlledCamera.near = Math.max(
      0.01,
      framing.cameraDistance - framing.framedRadius * 1.5
    );
    controlledCamera.far = Math.max(
      100,
      framing.cameraDistance + framing.framedRadius * 2
    );
    controlledCamera.updateProjectionMatrix();
    controls.target.set(
      framing.target.x,
      framing.target.y,
      framing.target.z
    );
    controls.update();
    invalidate();
  }, [camera, framingRevision, invalidate, session]);

  return null;
}

function GravityScene({
  session,
  selectedBodyId,
  onSelectBody,
  onTelemetry,
  renderRevision,
  cameraResetRevision,
  cameraFramingRevision,
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
      <OrbitCameraControls
        session={session}
        resetRevision={cameraResetRevision}
        framingRevision={cameraFramingRevision}
      />
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

              if (!isBodySelectionClick(event.delta)) {
                return;
              }

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
  const [cameraResetRevision, setCameraResetRevision] = useState(0);
  const [cameraFramingRevision, setCameraFramingRevision] = useState(0);

  return (
    <div
      className="relative h-[65svh] min-h-72 max-h-[28rem] w-full overflow-hidden rounded-xl border border-border/80 bg-black/30 md:h-[70svh] md:max-h-[36rem]"
    >
      <div
        role="img"
        aria-label={`Simulation gravitationnelle tridimensionnelle de ${session.bodies.length} corps célestes.`}
        className="h-full w-full"
      >
        <Canvas
          camera={{
            fov: 46,
            near: 0.1,
            far: 100,
            position: [...DEFAULT_GRAVITY_CAMERA_POSITION],
          }}
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
            cameraResetRevision={cameraResetRevision}
            cameraFramingRevision={cameraFramingRevision}
          />
        </Canvas>
      </div>
      <div className="absolute right-3 top-3 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={() =>
            setCameraFramingRevision((revision) => revision + 1)
          }
          className="rounded-lg border border-white/20 bg-black/65 px-3 py-2 text-xs font-medium text-white shadow-lg backdrop-blur-sm hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          Cadrer le système
        </button>
        <button
          type="button"
          onClick={() =>
            setCameraResetRevision((revision) => revision + 1)
          }
          className="rounded-lg border border-white/20 bg-black/65 px-3 py-2 text-xs font-medium text-white shadow-lg backdrop-blur-sm hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          Réinitialiser la caméra
        </button>
      </div>
    </div>
  );
});
