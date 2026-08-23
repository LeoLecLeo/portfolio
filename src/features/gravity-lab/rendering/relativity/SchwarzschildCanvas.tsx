"use client";

import { Canvas, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useState } from "react";
import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Line,
  LineBasicMaterial,
  PerspectiveCamera,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import {
  createSchwarzschildVisualizationExperiment,
  type SchwarzschildVisualizationExperiment,
} from "../../experiments/schwarzschildVisualizationExperiment";
import {
  DEFAULT_SCHWARZSCHILD_RENDER_POLICY,
  createFlammEmbeddingMeshData,
  flammEmbeddingHeightM,
  mapFlammHeightToScene,
  projectSchwarzschildCharacteristicRadii,
  projectSchwarzschildPointToFlammScene,
} from "./schwarzschildRenderPolicy";

const SCHWARZSCHILD_CAMERA_POSITION = [11, 7, 12] as const;
const SCHWARZSCHILD_CAMERA_TARGET = [0, -2.4, 0] as const;
const GEODESIC_VISUAL_LIFT_SCENE = 0.08;

function SchwarzschildOrbitControls() {
  const camera = useThree((state) => state.camera);
  const domElement = useThree((state) => state.gl.domElement);
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => {
    const controls = new OrbitControls(camera, domElement);
    const invalidateOnChange = () => invalidate();

    controls.enableDamping = false;
    controls.enablePan = true;
    controls.enableRotate = true;
    controls.enableZoom = true;
    controls.minDistance = 5;
    controls.maxDistance = 45;
    controls.target.set(...SCHWARZSCHILD_CAMERA_TARGET);
    controls.addEventListener("change", invalidateOnChange);
    controls.update();
    invalidate();

    return () => {
      controls.removeEventListener("change", invalidateOnChange);
      controls.dispose();
    };
  }, [camera, domElement, invalidate]);

  return null;
}

function SchwarzschildScene({
  flammVisible,
  experiment,
}: Readonly<{
  flammVisible: boolean;
  experiment: SchwarzschildVisualizationExperiment;
}>) {
  const radii = useMemo(
    () =>
      projectSchwarzschildCharacteristicRadii(experiment.centralMassKg),
    [experiment]
  );
  const flammMesh = useMemo(
    () =>
      createFlammEmbeddingMeshData(experiment.schwarzschildRadiusM),
    [experiment]
  );
  const resources = useMemo(() => {
    const surfaceGeometry = new BufferGeometry();
    surfaceGeometry.setAttribute(
      "position",
      new BufferAttribute(flammMesh.positions, 3)
    );
    surfaceGeometry.setIndex(new BufferAttribute(flammMesh.indices, 1));
    surfaceGeometry.computeVertexNormals();

    const trajectoryPositions = new Float32Array(
      experiment.trajectory.length * 3
    );
    const verticalTranslation =
      -flammMesh.maximumRenderedEmbeddingHeightScene;

    for (const [index, point] of experiment.trajectory.entries()) {
      const projected = projectSchwarzschildPointToFlammScene(
        point,
        experiment.schwarzschildRadiusM,
        DEFAULT_SCHWARZSCHILD_RENDER_POLICY,
        verticalTranslation + GEODESIC_VISUAL_LIFT_SCENE
      );
      const offset = index * 3;
      trajectoryPositions[offset] = projected.x;
      trajectoryPositions[offset + 1] = projected.y;
      trajectoryPositions[offset + 2] = projected.z;
    }

    const trajectoryGeometry = new BufferGeometry();
    trajectoryGeometry.setAttribute(
      "position",
      new BufferAttribute(trajectoryPositions, 3)
    );
    const trajectoryMaterial = new LineBasicMaterial({
      color: "#f8fafc",
      transparent: true,
      opacity: 0.95,
    });
    const trajectoryLine = new Line(
      trajectoryGeometry,
      trajectoryMaterial
    );
    trajectoryLine.frustumCulled = false;

    return {
      surfaceGeometry,
      trajectoryGeometry,
      trajectoryLine,
      trajectoryMaterial,
    };
  }, [experiment, flammMesh]);
  const verticalTranslation =
    -flammMesh.maximumRenderedEmbeddingHeightScene;
  const embeddedHeight = (radiusM: number) =>
    mapFlammHeightToScene(
      flammEmbeddingHeightM(experiment.schwarzschildRadiusM, radiusM),
      experiment.schwarzschildRadiusM
    ) + verticalTranslation;
  const horizonHeight = verticalTranslation;
  const photonSphereHeight = embeddedHeight(radii.photonSphereRadiusM);
  const iscoHeight = embeddedHeight(radii.iscoRadiusM);

  useEffect(
    () => () => {
      resources.surfaceGeometry.dispose();
      resources.trajectoryGeometry.dispose();
      resources.trajectoryMaterial.dispose();
    },
    [resources]
  );

  return (
    <>
      <SchwarzschildOrbitControls />
      <color attach="background" args={["#02040a"]} />
      <fog attach="fog" args={["#02040a", 18, 38]} />
      <ambientLight intensity={0.42} />
      <directionalLight position={[7, 10, 8]} intensity={1.8} />
      <pointLight
        position={[0, horizonHeight + 0.5, 0]}
        color="#67e8f9"
        intensity={28}
        distance={12}
      />

      {flammVisible ? (
        <mesh
          geometry={resources.surfaceGeometry}
          position={[0, verticalTranslation, 0]}
          raycast={() => null}
        >
          <meshStandardMaterial
            color="#155e75"
            emissive="#083344"
            emissiveIntensity={0.7}
            transparent
            opacity={0.48}
            wireframe
            side={DoubleSide}
            depthWrite={false}
          />
        </mesh>
      ) : null}

      <mesh position={[0, horizonHeight, 0]} raycast={() => null}>
        <sphereGeometry args={[radii.horizonSceneRadius, 48, 32]} />
        <meshStandardMaterial
          color="#000000"
          emissive="#020617"
          emissiveIntensity={0.35}
          roughness={0.18}
          metalness={0.45}
        />
      </mesh>
      <mesh position={[0, horizonHeight, 0]} raycast={() => null}>
        <sphereGeometry args={[radii.horizonSceneRadius * 1.025, 32, 24]} />
        <meshBasicMaterial
          color="#22d3ee"
          transparent
          opacity={0.24}
          wireframe
          depthWrite={false}
        />
      </mesh>

      <mesh
        position={[0, photonSphereHeight, 0]}
        rotation={[Math.PI / 2, 0, 0]}
        raycast={() => null}
      >
        <torusGeometry
          args={[radii.photonSphereSceneRadius, 0.025, 8, 128]}
        />
        <meshBasicMaterial color="#fbbf24" transparent opacity={0.95} />
      </mesh>
      <mesh
        position={[0, iscoHeight, 0]}
        rotation={[Math.PI / 2, 0, 0]}
        raycast={() => null}
      >
        <torusGeometry args={[radii.iscoSceneRadius, 0.035, 8, 128]} />
        <meshBasicMaterial color="#f472b6" transparent opacity={0.9} />
      </mesh>

      <primitive object={resources.trajectoryLine} raycast={() => null} />
    </>
  );
}

export function SchwarzschildCanvas() {
  const [sceneVisible, setSceneVisible] = useState(true);
  const [flammVisible, setFlammVisible] = useState(true);
  const experiment = useMemo(
    () => createSchwarzschildVisualizationExperiment(),
    []
  );
  const characteristicRadii = useMemo(
    () =>
      projectSchwarzschildCharacteristicRadii(experiment.centralMassKg),
    [experiment]
  );
  const amplification =
    DEFAULT_SCHWARZSCHILD_RENDER_POLICY.embeddingVerticalAmplification;

  return (
    <section
      aria-labelledby="schwarzschild-scene-title"
      className="min-w-0 overflow-hidden rounded-2xl border border-cyan-400/20 bg-slate-950/65 shadow-[0_24px_70px_-42px_rgba(34,211,238,0.55)]"
    >
      <div className="flex flex-col gap-3 border-b border-cyan-400/15 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300/80">
            Géométrie relativiste dédiée
          </p>
          <h3
            id="schwarzschild-scene-title"
            className="mt-1 text-lg font-semibold text-slate-100"
          >
            Extérieur de Schwarzschild
          </h3>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-300">
            Masse sphérique non rotative · coordonnées extérieures r &gt; rₛ ·
            particule test sans réaction sur la source.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            aria-expanded={sceneVisible}
            aria-controls="schwarzschild-scene-content"
            onClick={() => setSceneVisible((visible) => !visible)}
            className="rounded-md border border-cyan-300/35 bg-cyan-300/8 px-3 py-2 text-xs font-semibold text-cyan-100 transition-colors hover:bg-cyan-300/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 motion-reduce:transition-none"
          >
            {sceneVisible ? "Masquer la scène" : "Afficher la scène"}
          </button>
          <button
            type="button"
            aria-pressed={flammVisible}
            disabled={!sceneVisible}
            onClick={() => setFlammVisible((visible) => !visible)}
            className="rounded-md border border-slate-600 bg-slate-900/80 px-3 py-2 text-xs font-medium text-slate-200 transition-colors hover:border-cyan-300/40 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:cursor-not-allowed disabled:opacity-40 aria-pressed:border-cyan-300/55 aria-pressed:text-cyan-100 motion-reduce:transition-none"
          >
            Diagramme de Flamm : {flammVisible ? "affiché" : "masqué"}
          </button>
        </div>
      </div>

      {sceneVisible ? (
        <div id="schwarzschild-scene-content">
          <div
            role="img"
            aria-label="Scène de Schwarzschild montrant l’horizon, la coupe équatoriale de la sphère de photons, l’ISCO, une géodésique massive stable et un diagramme d’encastrement de Flamm optionnel."
            className="h-[28rem] min-h-80 w-full"
          >
            <Canvas
              camera={{
                fov: 46,
                near: 0.05,
                far: 100,
                position: [...SCHWARZSCHILD_CAMERA_POSITION],
              }}
              dpr={[1, 1.5]}
              frameloop="demand"
              gl={{ antialias: true, powerPreference: "high-performance" }}
              fallback={
                <div className="grid h-full place-items-center p-8 text-center text-sm text-slate-300">
                  Visualisation Schwarzschild tridimensionnelle.
                </div>
              }
              onCreated={(state) => {
                const camera = state.camera;

                if (camera instanceof PerspectiveCamera) {
                  camera.lookAt(...SCHWARZSCHILD_CAMERA_TARGET);
                  camera.updateProjectionMatrix();
                }

                state.invalidate();
              }}
            >
              <SchwarzschildScene
                flammVisible={flammVisible}
                experiment={experiment}
              />
            </Canvas>
          </div>

          <div className="grid gap-3 border-t border-cyan-400/15 bg-slate-950/75 p-4 text-xs text-slate-300 md:grid-cols-[1.2fr_1fr]">
            <div className="space-y-2">
              <p>
                <strong className="text-slate-100">
                  Diagramme de Flamm
                </strong>{" "}
                — représentation de la géométrie spatiale équatoriale à temps
                constant. Ce n’est ni la forme complète de l’espace-temps, ni
                un puits de potentiel.
              </p>
              <p className="text-amber-200">
                Déformation verticale amplifiée ×{amplification.toFixed(2)}
                pour la lisibilité — géométrie physique et géodésique
                inchangées.
              </p>
              <p>
                La ligne blanche est une géodésique massive circulaire stable à
                5 rₛ, calculée par le moteur headless RK4 validé puis projetée
                sur la tranche affichée.
              </p>
            </div>
            <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 font-mono tabular-nums">
              <dt className="text-slate-400">Horizon</dt>
              <dd>{characteristicRadii.horizonSceneRadius.toFixed(1)} rₛ</dd>
              <dt className="text-amber-300">Sphère de photons · coupe</dt>
              <dd>{characteristicRadii.photonSphereSceneRadius.toFixed(1)} rₛ</dd>
              <dt className="text-pink-300">ISCO</dt>
              <dd>{characteristicRadii.iscoSceneRadius.toFixed(1)} rₛ</dd>
              <dt className="text-slate-400">Rayon de Schwarzschild</dt>
              <dd>{characteristicRadii.schwarzschildRadiusM.toExponential(3)} m</dd>
            </dl>
          </div>
        </div>
      ) : null}
    </section>
  );
}
