"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefCallback,
  type RefObject,
} from "react";
import {
  BufferAttribute,
  BufferGeometry,
  LineBasicMaterial,
  LineSegments,
  PerspectiveCamera,
  type Mesh,
} from "three";
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
import {
  centerCameraOnRenderedPoint,
  followRenderedPoint,
  reconcileTrackedBodyId,
} from "./cameraTracking";
import {
  TRAJECTORY_MAX_POINTS_PER_BODY,
  TrajectoryCollector,
} from "./trajectoryCollector";
import {
  calculateVisualRadiusScene,
  type VisualRadiusMode,
} from "./visualRadiusPolicy";
import { GravityPotentialGrid } from "./GravityPotentialGrid";
import { GravityFieldVectors } from "./GravityFieldVectors";
import { createSessionVisualizationLayout } from "./sessionVisualizationLayout";

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
  trajectoryResetRevision: number;
}>;

type GravitySceneProps = Omit<GravityCanvasProps, "onReady"> &
  Readonly<{
    cameraResetRevision: number;
    cameraFramingRevision: number;
    cameraFocusRequest: Readonly<{
      revision: number;
      bodyId: string;
    }>;
    trackedBodyId: string | null;
    trajectoriesVisible: boolean;
    trajectoryClearRevision: number;
    visualRadiusMode: VisualRadiusMode;
    potentialGridVisible: boolean;
    gravityFieldVisible: boolean;
  }>;

type MutableCameraTarget = { x: number; y: number; z: number };

function copyOrbitTarget(
  targetRef: RefObject<MutableCameraTarget>,
  controls: OrbitControls
): void {
  targetRef.current.x = controls.target.x;
  targetRef.current.y = controls.target.y;
  targetRef.current.z = controls.target.z;
}

function updateTrajectoryGeometry(
  collector: TrajectoryCollector,
  bodyId: string,
  geometry: BufferGeometry
): void {
  const positionAttribute = geometry.getAttribute("position");

  if (!(positionAttribute instanceof BufferAttribute)) {
    return;
  }

  const vertexCount = collector.copyLineSegmentsTo(
    bodyId,
    positionAttribute.array as Float32Array
  );
  geometry.setDrawRange(0, vertexCount);
  positionAttribute.needsUpdate = true;
}

function OrbitCameraControls({
  session,
  resetRevision,
  framingRevision,
  focusRequest,
  trackedBodyId,
  targetRef,
}: Readonly<{
  session: GravityLabSession;
  resetRevision: number;
  framingRevision: number;
  focusRequest: Readonly<{
    revision: number;
    bodyId: string;
  }>;
  trackedBodyId: string | null;
  targetRef: RefObject<MutableCameraTarget>;
}>) {
  const camera = useThree((state) => state.camera);
  const domElement = useThree((state) => state.gl.domElement);
  const invalidate = useThree((state) => state.invalidate);
  const controlsRef = useRef<OrbitControls | null>(null);
  const handledResetRevision = useRef(resetRevision);
  const handledFramingRevision = useRef(framingRevision);
  const handledFocusRevision = useRef(focusRequest.revision);
  const framedSession = useRef<GravityLabSession | null>(null);
  const trackedPosition = useRef<{ x: number; y: number; z: number } | null>(
    null
  );

  useEffect(() => {
    const controls = new OrbitControls(camera, domElement);
    const invalidateOnChange = () => {
      copyOrbitTarget(targetRef, controls);
      invalidate();
    };

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
    copyOrbitTarget(targetRef, controls);
    controlsRef.current = controls;

    return () => {
      controls.removeEventListener("change", invalidateOnChange);
      controls.dispose();
      controlsRef.current = null;
    };
  }, [camera, domElement, invalidate, targetRef]);

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
    copyOrbitTarget(targetRef, controls);
    invalidate();
  }, [camera, invalidate, resetRevision, targetRef]);

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
    copyOrbitTarget(targetRef, controls);
    invalidate();
  }, [camera, framingRevision, invalidate, session, targetRef]);

  useEffect(() => {
    if (handledFocusRevision.current === focusRequest.revision) {
      return;
    }

    handledFocusRevision.current = focusRequest.revision;
    const controls = controlsRef.current;

    if (
      controls === null ||
      !session.bodies.some(({ bodyId }) => bodyId === focusRequest.bodyId)
    ) {
      return;
    }

    const renderedPosition = { x: 0, y: 0, z: 0 };
    session.writeScenePosition(focusRequest.bodyId, renderedPosition);
    const centred = centerCameraOnRenderedPoint(
      controls.object.position,
      controls.target,
      renderedPosition
    );

    controls.object.position.set(
      centred.cameraPosition.x,
      centred.cameraPosition.y,
      centred.cameraPosition.z
    );
    controls.target.set(
      centred.target.x,
      centred.target.y,
      centred.target.z
    );
    controls.update();
    copyOrbitTarget(targetRef, controls);
    invalidate();
  }, [focusRequest, invalidate, session, targetRef]);

  useEffect(() => {
    const controls = controlsRef.current;

    if (
      controls === null ||
      trackedBodyId === null ||
      !session.bodies.some(({ bodyId }) => bodyId === trackedBodyId)
    ) {
      trackedPosition.current = null;
      return;
    }

    const renderedPosition = { x: 0, y: 0, z: 0 };
    session.writeScenePosition(trackedBodyId, renderedPosition);
    const centred = centerCameraOnRenderedPoint(
      controls.object.position,
      controls.target,
      renderedPosition
    );

    controls.object.position.set(
      centred.cameraPosition.x,
      centred.cameraPosition.y,
      centred.cameraPosition.z
    );
    controls.target.set(
      centred.target.x,
      centred.target.y,
      centred.target.z
    );
    trackedPosition.current = renderedPosition;
    controls.update();
    copyOrbitTarget(targetRef, controls);
    invalidate();
  }, [invalidate, session, targetRef, trackedBodyId]);

  useFrame(() => {
    const controls = controlsRef.current;
    const previousPosition = trackedPosition.current;

    if (
      controls === null ||
      trackedBodyId === null ||
      previousPosition === null ||
      !session.bodies.some(({ bodyId }) => bodyId === trackedBodyId)
    ) {
      return;
    }

    const nextPosition = { x: 0, y: 0, z: 0 };
    session.writeScenePosition(trackedBodyId, nextPosition);

    if (
      nextPosition.x === previousPosition.x &&
      nextPosition.y === previousPosition.y &&
      nextPosition.z === previousPosition.z
    ) {
      return;
    }

    const followed = followRenderedPoint(
      controls.object.position,
      controls.target,
      previousPosition,
      nextPosition
    );

    controls.object.position.set(
      followed.cameraPosition.x,
      followed.cameraPosition.y,
      followed.cameraPosition.z
    );
    controls.target.set(
      followed.target.x,
      followed.target.y,
      followed.target.z
    );
    trackedPosition.current = nextPosition;
    controls.update();
    copyOrbitTarget(targetRef, controls);
  });

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
  cameraFocusRequest,
  trackedBodyId,
  trajectoriesVisible,
  trajectoryClearRevision,
  trajectoryResetRevision,
  visualRadiusMode,
  potentialGridVisible,
  gravityFieldVisible,
}: GravitySceneProps) {
  const runtime = session.runtime;
  const invalidate = useThree((state) => state.invalidate);
  const bodies = useMemo(() => session.bodies, [session]);
  const visualizationLayout = useMemo(
    () => createSessionVisualizationLayout(session),
    [session]
  );
  const cameraTargetRef = useRef<MutableCameraTarget>({
    x: DEFAULT_GRAVITY_CAMERA_TARGET[0],
    y: DEFAULT_GRAVITY_CAMERA_TARGET[1],
    z: DEFAULT_GRAVITY_CAMERA_TARGET[2],
  });
  const meshRefs = useRef<Array<Mesh | null>>([]);
  const telemetryElapsedSeconds = useRef(0);
  const trajectoryCollector = useMemo(
    () =>
      new TrajectoryCollector(bodies.map(({ bodyId }) => bodyId)),
    [bodies]
  );
  const previousTrajectoriesVisible = useRef(trajectoriesVisible);
  const trajectoryRenderObjects = useMemo(
    () =>
      bodies.map((body) => {
        const geometry = new BufferGeometry();
        geometry.setAttribute(
          "position",
          new BufferAttribute(
            new Float32Array(
              (TRAJECTORY_MAX_POINTS_PER_BODY - 1) * 2 * 3
            ),
            3
          )
        );
        geometry.setDrawRange(0, 0);
        const material = new LineBasicMaterial({
          color: body.color,
          transparent: true,
          opacity: 0.7,
          depthWrite: false,
        });
        const line = new LineSegments(geometry, material);
        line.frustumCulled = false;

        return { geometry, line, material };
      }),
    [bodies]
  );

  useEffect(
    () => () => {
      for (const { geometry, material } of trajectoryRenderObjects) {
        geometry.dispose();
        material.dispose();
      }
    },
    [trajectoryRenderObjects]
  );

  useEffect(() => {
    meshRefs.current.length = bodies.length;
    telemetryElapsedSeconds.current = 0;
    invalidate();
  }, [bodies.length, invalidate, renderRevision, session]);

  useEffect(() => {
    trajectoryCollector.rebaseSamplingClock();
  }, [renderRevision, trajectoryCollector]);

  useEffect(() => {
    trajectoryCollector.clear();

    for (const { geometry } of trajectoryRenderObjects) {
      geometry.setDrawRange(0, 0);
    }

    invalidate();
  }, [
    invalidate,
    trajectoryClearRevision,
    trajectoryCollector,
    trajectoryResetRevision,
    trajectoryRenderObjects,
  ]);

  useEffect(() => {
    if (trajectoriesVisible && !previousTrajectoriesVisible.current) {
      trajectoryCollector.startNewSegments();
    }

    previousTrajectoriesVisible.current = trajectoriesVisible;

    if (trajectoriesVisible) {
      for (const [bodyIndex, body] of bodies.entries()) {
        updateTrajectoryGeometry(
          trajectoryCollector,
          body.bodyId,
          trajectoryRenderObjects[bodyIndex].geometry
        );
      }
    }

    invalidate();
  }, [
    bodies,
    invalidate,
    trajectoriesVisible,
    trajectoryCollector,
    trajectoryRenderObjects,
  ]);

  useEffect(() => {
    invalidate();
  }, [invalidate, selectedBodyId, visualRadiusMode]);

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

    if (
      trajectoriesVisible &&
      trajectoryCollector.shouldSample(deltaSeconds, runtime.isRunning)
    ) {
      for (let bodyIndex = 0; bodyIndex < bodies.length; bodyIndex += 1) {
        const mesh = meshRefs.current[bodyIndex];

        if (mesh === null || mesh === undefined) {
          continue;
        }

        const bodyId = bodies[bodyIndex].bodyId;
        trajectoryCollector.append(bodyId, mesh.position);

        updateTrajectoryGeometry(
          trajectoryCollector,
          bodyId,
          trajectoryRenderObjects[bodyIndex].geometry
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
        focusRequest={cameraFocusRequest}
        trackedBodyId={trackedBodyId}
        targetRef={cameraTargetRef}
      />
      <color attach="background" args={["#060912"]} />
      <ambientLight intensity={0.35} />
      <directionalLight position={[5, 8, 6]} intensity={1.8} />
      <pointLight position={[0, 0, 0]} intensity={18} distance={28} />

      {potentialGridVisible ? (
        <GravityPotentialGrid
          session={session}
          bounds={visualizationLayout.bodyBounds}
          cameraTargetRef={cameraTargetRef}
          visible
        />
      ) : null}
      {gravityFieldVisible ? (
        <GravityFieldVectors
          session={session}
          bounds={visualizationLayout.bounds}
          visible
        />
      ) : null}
      <axesHelper args={[2.2]} />

      {bodies.map((body, bodyIndex) => (
        <primitive
          key={`trajectory-${body.bodyId}`}
          object={trajectoryRenderObjects[bodyIndex].line}
          visible={trajectoriesVisible}
        />
      ))}

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
            onClick={(event) => {
              event.stopPropagation();

              if (!isBodySelectionClick(event.delta)) {
                return;
              }

              onSelectBody(session, body.bodyId);
            }}
          >
            <sphereGeometry
              args={[
                calculateVisualRadiusScene(
                  body.physicalRadiusM,
                  session.sceneTransform.sceneUnitsPerMeter,
                  visualRadiusMode
                ),
                32,
                32,
              ]}
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
  trajectoryResetRevision,
}: GravityCanvasProps) {
  const [cameraResetRevision, setCameraResetRevision] = useState(0);
  const [cameraFramingRevision, setCameraFramingRevision] = useState(0);
  const [cameraFocusRequest, setCameraFocusRequest] = useState(() => ({
    revision: 0,
    bodyId: selectedBodyId,
  }));
  const [trackedBodyId, setTrackedBodyId] = useState<string | null>(null);
  const [trajectoriesVisible, setTrajectoriesVisible] = useState(true);
  const [trajectoryClearRevision, setTrajectoryClearRevision] = useState(0);
  const [visualRadiusMode, setVisualRadiusMode] =
    useState<VisualRadiusMode>("amplified");
  const [potentialGridVisible, setPotentialGridVisible] = useState(true);
  const [gravityFieldVisible, setGravityFieldVisible] = useState(false);
  const previousSession = useRef(session);
  const selectedBodyExists = session.bodies.some(
    ({ bodyId }) => bodyId === selectedBodyId
  );
  const effectiveTrackedBodyId =
    trackedBodyId !== null &&
    session.bodies.some(({ bodyId }) => bodyId === trackedBodyId)
      ? trackedBodyId
      : null;

  useEffect(() => {
    const sessionChanged = previousSession.current !== session;
    previousSession.current = session;
    const availableBodyIds = session.bodies.map(({ bodyId }) => bodyId);

    setTrackedBodyId((current) =>
      reconcileTrackedBodyId({
        trackedBodyId: current,
        selectedBodyId,
        availableBodyIds,
        sessionChanged,
      })
    );
  }, [selectedBodyId, session]);

  return (
    <div className="space-y-3">
      <div className="relative h-[65svh] min-h-72 max-h-[28rem] w-full overflow-hidden rounded-xl border border-border/80 bg-black/30 md:h-[70svh] md:max-h-[36rem]">
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
              cameraFocusRequest={cameraFocusRequest}
              trackedBodyId={effectiveTrackedBodyId}
              trajectoriesVisible={trajectoriesVisible}
              trajectoryClearRevision={trajectoryClearRevision}
              trajectoryResetRevision={trajectoryResetRevision}
              visualRadiusMode={visualRadiusMode}
              potentialGridVisible={potentialGridVisible}
              gravityFieldVisible={gravityFieldVisible}
            />
          </Canvas>
        </div>
        <div
          role="group"
          aria-label="Caméra"
          className="absolute right-3 top-3 grid max-w-[calc(100%-1.5rem)] grid-cols-2 gap-2 rounded-lg border border-white/15 bg-black/45 p-2 shadow-lg backdrop-blur-sm"
        >
          <p className="col-span-2 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-white/70">
            Caméra
          </p>
          <button
            type="button"
            disabled={!selectedBodyExists}
            onClick={() =>
              setCameraFocusRequest((request) => ({
                revision: request.revision + 1,
                bodyId: selectedBodyId,
              }))
            }
            className="rounded-lg border border-white/20 bg-black/65 px-3 py-2 text-xs font-medium text-white shadow-lg backdrop-blur-sm hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:cursor-not-allowed disabled:opacity-45"
          >
            Centrer sur le corps
          </button>
          <button
            type="button"
            aria-pressed={effectiveTrackedBodyId !== null}
            disabled={!selectedBodyExists}
            onClick={() =>
              setTrackedBodyId((current) =>
                current === null ? selectedBodyId : null
              )
            }
            className="rounded-lg border border-white/20 bg-black/65 px-3 py-2 text-xs font-medium text-white shadow-lg backdrop-blur-sm hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:cursor-not-allowed disabled:opacity-45 aria-pressed:border-primary aria-pressed:bg-primary/80"
          >
            Suivre le corps
          </button>
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
      <div
        aria-label="Contrôles d’affichage"
        className="grid gap-3 rounded-xl border border-border/80 bg-card/40 p-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        <fieldset className="rounded-lg border border-border/80 bg-background/60 p-3 text-sm">
          <legend className="px-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Affichage des astres
          </legend>
          <div className="space-y-2">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="gravity-visual-radius-mode"
                value="amplified"
                checked={visualRadiusMode === "amplified"}
                onChange={() => setVisualRadiusMode("amplified")}
              />
              Rayons amplifiés
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="gravity-visual-radius-mode"
                value="physical-scale"
                checked={visualRadiusMode === "physical-scale"}
                onChange={() => setVisualRadiusMode("physical-scale")}
              />
              Rayons à l’échelle
            </label>
          </div>
          {visualRadiusMode === "amplified" ? (
            <p role="status" className="mt-2 text-xs text-muted-foreground">
              Les tailles des astres sont amplifiées pour la lisibilité.
            </p>
          ) : null}
        </fieldset>

        <fieldset className="rounded-lg border border-border/80 bg-background/60 p-3 text-sm">
          <legend className="px-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Trajectoires
          </legend>
          <div className="grid gap-2">
            <button
              type="button"
              aria-pressed={trajectoriesVisible}
              onClick={() => setTrajectoriesVisible((visible) => !visible)}
              className="rounded-lg border border-border bg-secondary px-3 py-2 text-sm font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary aria-pressed:border-primary aria-pressed:bg-primary/10"
            >
              {trajectoriesVisible ? "Masquer" : "Afficher"}
            </button>
            <button
              type="button"
              onClick={() =>
                setTrajectoryClearRevision((revision) => revision + 1)
              }
              className="rounded-lg border border-border bg-secondary px-3 py-2 text-sm font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              Effacer les trajectoires
            </button>
          </div>
        </fieldset>

        <fieldset className="rounded-lg border border-border/80 bg-background/60 p-3 text-sm">
          <legend className="px-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Grille gravitationnelle
          </legend>
          <button
            type="button"
            aria-pressed={potentialGridVisible}
            onClick={() => setPotentialGridVisible((visible) => !visible)}
            className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary aria-pressed:border-primary aria-pressed:bg-primary/10"
          >
            {potentialGridVisible ? "Masquer" : "Afficher"}
          </button>
          {potentialGridVisible ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Visualisation du potentiel gravitationnel newtonien — déformation
              amplifiée pour la lisibilité. Ce réseau ne représente pas une
              courbure relativiste de l’espace-temps.
            </p>
          ) : null}
        </fieldset>

        <fieldset className="rounded-lg border border-border/80 bg-background/60 p-3 text-sm">
          <legend className="px-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Champ gravitationnel
          </legend>
          <button
            type="button"
            aria-pressed={gravityFieldVisible}
            onClick={() => setGravityFieldVisible((visible) => !visible)}
            className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary aria-pressed:border-primary aria-pressed:bg-primary/10"
          >
            {gravityFieldVisible ? "Masquer" : "Afficher"}
          </button>
          {gravityFieldVisible ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Les flèches indiquent la direction et l’intensité relative de
              l’accélération gravitationnelle.
            </p>
          ) : null}
        </fieldset>
      </div>
    </div>
  );
});
