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
  projectSchwarzschildTrajectoryToScene,
} from "./schwarzschildRenderPolicy";

const SCHWARZSCHILD_CAMERA_POSITION = [11, 7, 12] as const;
const SCHWARZSCHILD_CAMERA_TARGET = [0, -2.4, 0] as const;
const GEODESIC_VISUAL_LIFT_SCENE = 0.08;

const LIGHT_TRAJECTORY_STYLE = Object.freeze({
  scattered: Object.freeze({ color: "#22d3ee", opacity: 0.9 }),
  "near-critical": Object.freeze({ color: "#fbbf24", opacity: 0.96 }),
  captured: Object.freeze({ color: "#fb7185", opacity: 0.94 }),
});

function createTrajectoryLine(
  positions: Float32Array,
  color: string,
  opacity: number
) {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  const material = new LineBasicMaterial({
    color,
    transparent: true,
    opacity,
  });
  const line = new Line(geometry, material);
  line.frustumCulled = false;

  return { geometry, line, material };
}

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
  massiveOrbitVisible,
  lightRaysVisible,
  experiment,
}: Readonly<{
  flammVisible: boolean;
  massiveOrbitVisible: boolean;
  lightRaysVisible: boolean;
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

    const verticalTranslation =
      -flammMesh.maximumRenderedEmbeddingHeightScene;
    const trajectoryResource = createTrajectoryLine(
      projectSchwarzschildTrajectoryToScene(
        experiment.trajectory,
        experiment.schwarzschildRadiusM,
        DEFAULT_SCHWARZSCHILD_RENDER_POLICY,
        verticalTranslation + GEODESIC_VISUAL_LIFT_SCENE
      ),
      "#f8fafc",
      0.95
    );
    const lightTrajectoryResources = experiment.lightTrajectories.map(
      (trajectory) => {
        const style = LIGHT_TRAJECTORY_STYLE[trajectory.id];

        return {
          id: trajectory.id,
          ...createTrajectoryLine(
            projectSchwarzschildTrajectoryToScene(
              trajectory.trajectory,
              experiment.schwarzschildRadiusM,
              DEFAULT_SCHWARZSCHILD_RENDER_POLICY,
              verticalTranslation + GEODESIC_VISUAL_LIFT_SCENE * 1.75
            ),
            style.color,
            style.opacity
          ),
        };
      }
    );

    return {
      surfaceGeometry,
      trajectoryResource,
      lightTrajectoryResources,
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
      resources.trajectoryResource.geometry.dispose();
      resources.trajectoryResource.material.dispose();

      for (const resource of resources.lightTrajectoryResources) {
        resource.geometry.dispose();
        resource.material.dispose();
      }
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

      {massiveOrbitVisible ? (
        <primitive
          object={resources.trajectoryResource.line}
          raycast={() => null}
        />
      ) : null}
      {lightRaysVisible
        ? resources.lightTrajectoryResources.map((resource) => (
            <primitive
              key={resource.id}
              object={resource.line}
              raycast={() => null}
            />
          ))
        : null}
    </>
  );
}

export function SchwarzschildCanvas({
  initialSceneVisible = true,
  initialFlammVisible = true,
  initialMassiveOrbitVisible = true,
  initialLightRaysVisible = true,
}: Readonly<{
  initialSceneVisible?: boolean;
  initialFlammVisible?: boolean;
  initialMassiveOrbitVisible?: boolean;
  initialLightRaysVisible?: boolean;
}>) {
  const [experiment, setExperiment] =
    useState<SchwarzschildVisualizationExperiment | null>(() =>
      initialSceneVisible
        ? createSchwarzschildVisualizationExperiment()
        : null
    );
  const [flammVisible, setFlammVisible] = useState(initialFlammVisible);
  const [massiveOrbitVisible, setMassiveOrbitVisible] = useState(
    initialMassiveOrbitVisible
  );
  const [lightRaysVisible, setLightRaysVisible] = useState(
    initialLightRaysVisible
  );
  const sceneVisible = experiment !== null;
  const characteristicRadii = useMemo(
    () =>
      experiment === null
        ? null
        : projectSchwarzschildCharacteristicRadii(
            experiment.centralMassKg
          ),
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
            Module expérimental indépendant
          </p>
          <h3
            id="schwarzschild-scene-title"
            className="mt-1 text-lg font-semibold text-slate-100"
          >
            Extérieur de Schwarzschild
          </h3>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-300">
            Masse sphérique non rotative · coordonnées extérieures r &gt; rₛ ·
            particules et lumière tests sans réaction sur la source. Cette
            expérience ne modifie pas la session N-corps Newtonienne ou 1PN.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            aria-expanded={sceneVisible}
            aria-controls="schwarzschild-scene-content"
            onClick={() =>
              setExperiment((current) =>
                current === null
                  ? createSchwarzschildVisualizationExperiment()
                  : null
              )
            }
            className="rounded-md border border-cyan-300/35 bg-cyan-300/8 px-3 py-2 text-xs font-semibold text-cyan-100 transition-colors hover:bg-cyan-300/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 motion-reduce:transition-none"
          >
            {sceneVisible ? "Masquer la scène" : "Afficher la scène"}
          </button>
        </div>
      </div>

      {experiment !== null && characteristicRadii !== null ? (
        <div id="schwarzschild-scene-content">
          <fieldset className="border-b border-cyan-400/15 bg-slate-950/80 p-4">
            <legend className="px-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">
              Couches de la scène
            </legend>
            <div className="grid gap-2 min-[420px]:grid-cols-3">
              <button
                type="button"
                aria-pressed={flammVisible}
                onClick={() => setFlammVisible((visible) => !visible)}
                className="min-w-0 rounded-md border border-slate-600 bg-slate-900/80 px-3 py-2 text-xs font-medium text-slate-200 transition-colors hover:border-cyan-300/40 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 aria-pressed:border-cyan-300/55 aria-pressed:bg-cyan-300/10 aria-pressed:text-cyan-100 motion-reduce:transition-none"
              >
                Flamm · {flammVisible ? "affiché" : "masqué"}
              </button>
              <button
                type="button"
                aria-pressed={massiveOrbitVisible}
                onClick={() =>
                  setMassiveOrbitVisible((visible) => !visible)
                }
                className="min-w-0 rounded-md border border-slate-600 bg-slate-900/80 px-3 py-2 text-xs font-medium text-slate-200 transition-colors hover:border-slate-300/50 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200 aria-pressed:border-slate-300/60 aria-pressed:bg-slate-300/10 aria-pressed:text-white motion-reduce:transition-none"
              >
                Orbite massive · {massiveOrbitVisible ? "affichée" : "masquée"}
              </button>
              <button
                type="button"
                aria-pressed={lightRaysVisible}
                onClick={() => setLightRaysVisible((visible) => !visible)}
                className="min-w-0 rounded-md border border-slate-600 bg-slate-900/80 px-3 py-2 text-xs font-medium text-slate-200 transition-colors hover:border-amber-300/45 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 aria-pressed:border-amber-300/55 aria-pressed:bg-amber-300/10 aria-pressed:text-amber-100 motion-reduce:transition-none"
              >
                Rayons lumineux · {lightRaysVisible ? "affichés" : "masqués"}
              </button>
            </div>
          </fieldset>
          <div
            role="img"
            aria-label="Scène de Schwarzschild montrant l’horizon, la coupe équatoriale de la sphère de photons, l’ISCO, une géodésique massive stable, trois géodésiques lumineuses et un diagramme d’encastrement de Flamm optionnel."
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
                massiveOrbitVisible={massiveOrbitVisible}
                lightRaysVisible={lightRaysVisible}
                experiment={experiment}
              />
            </Canvas>
          </div>

          <div className="space-y-4 border-t border-cyan-400/15 bg-slate-950/75 p-4 text-xs text-slate-300">
            <div
              aria-label="Légende de la scène Schwarzschild"
              className="grid gap-2 min-[440px]:grid-cols-2 lg:grid-cols-3"
            >
              <span className="flex items-center gap-2">
                <span aria-hidden="true" className="h-0.5 w-5 bg-white" />
                Orbite massive stable · 5 rₛ
              </span>
              <span className="flex items-center gap-2 text-cyan-200">
                <span aria-hidden="true" className="h-0.5 w-5 bg-cyan-300" />
                Lumière diffusée · 1,1 b_c
              </span>
              <span className="flex items-center gap-2 text-amber-200">
                <span aria-hidden="true" className="h-0.5 w-5 bg-amber-300" />
                Proche du seuil · 1,001 b_c
              </span>
              <span className="flex items-center gap-2 text-rose-200">
                <span aria-hidden="true" className="h-0.5 w-5 bg-rose-300" />
                Lumière capturée · 0,999 b_c
              </span>
              <span className="flex items-center gap-2 text-amber-200">
                <span aria-hidden="true" className="size-2 rounded-full border border-amber-300" />
                Sphère de photons · 1,5 rₛ
              </span>
              <span className="flex items-center gap-2 text-pink-200">
                <span aria-hidden="true" className="size-2 rounded-full border border-pink-300" />
                ISCO · 3 rₛ
              </span>
            </div>

            <details className="group rounded-lg border border-cyan-400/15 bg-slate-900/45">
              <summary className="cursor-pointer list-none px-3 py-2.5 font-semibold text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-300 [&::-webkit-details-marker]:hidden">
                <span className="flex items-center justify-between gap-3">
                  Comprendre la scène
                  <span
                    aria-hidden="true"
                    className="text-cyan-300 transition-transform group-open:rotate-45 motion-reduce:transition-none"
                  >
                    +
                  </span>
                </span>
              </summary>
              <div className="grid gap-3 border-t border-cyan-400/15 p-3 leading-relaxed sm:grid-cols-2">
                <p>
                  <strong className="text-slate-100">Diagramme de Flamm.</strong>{" "}
                  Géométrie spatiale équatoriale à temps constant, et non forme
                  complète de l’espace-temps ni puits de potentiel. Sa hauteur
                  est amplifiée ×{amplification.toFixed(2)} uniquement pour le
                  rendu.
                </p>
                <p>
                  <strong className="text-slate-100">Horizon.</strong> Surface à
                  r = rₛ. Les coordonnées extérieures s’arrêtent avant elle :
                  aucun franchissement n’est simulé.
                </p>
                <p>
                  <strong className="text-amber-200">Sphère de photons.</strong>{" "}
                  À 1,5 rₛ, les orbites lumineuses circulaires sont instables ;
                  elle explique la forte déviation près du seuil critique.
                </p>
                <p>
                  <strong className="text-pink-200">ISCO.</strong> À 3 rₛ, c’est
                  la limite intérieure de stabilité des orbites circulaires
                  massives dans Schwarzschild.
                </p>
                <p className="sm:col-span-2">
                  <strong className="text-slate-100">Rayons lumineux.</strong>{" "}
                  Au-dessus du paramètre critique b_c, ils repartent après une
                  déviation plus ou moins forte ; sous ce seuil, ils sont
                  capturés. b_c est un paramètre d’impact, pas un rayon
                  concentrique. Ces lignes physiques ne constituent pas une
                  image réaliste de lentille gravitationnelle.
                </p>
              </div>
            </details>

            <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 border-t border-cyan-400/10 pt-3 font-mono tabular-nums sm:max-w-md">
              <dt className="text-slate-400">Horizon</dt>
              <dd>{characteristicRadii.horizonSceneRadius.toFixed(1)} rₛ</dd>
              <dt className="text-amber-300">Sphère de photons</dt>
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
