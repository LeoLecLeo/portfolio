import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  BufferAttribute,
  BufferGeometry,
  ShaderMaterial,
  Vector3,
} from "three";

import type { GravityLabSession } from "../runtime/GravityLabSession";
import {
  GRAVITY_GRID_FIELD_COMPRESSION,
  GRAVITY_GRID_MAX_DISPLACEMENT_SCENE,
  GRAVITY_GRID_VISUAL_SOFTENING_SCENE,
  calculatePotentialGridBounds,
  createPotentialGridLinePositions,
  preparePotentialMasses,
  resolvePotentialGridActivity,
} from "./gravityPotentialGridPolicy";

const MAX_SHADER_BODIES = 16;

const POTENTIAL_GRID_VERTEX_SHADER = /* glsl */ `
  uniform int uBodyCount;
  uniform vec3 uBodyPositions[${MAX_SHADER_BODIES}];
  uniform float uMassWeights[${MAX_SHADER_BODIES}];
  uniform float uSoftening;
  uniform float uFieldCompression;
  uniform float uMaxDisplacement;

  varying float vNormalizedDisplacement;

  void main() {
    vec3 field = vec3(0.0);

    for (int bodyIndex = 0; bodyIndex < ${MAX_SHADER_BODIES}; bodyIndex++) {
      if (bodyIndex < uBodyCount) {
        vec3 delta = uBodyPositions[bodyIndex] - position;
        float regularizedSquaredDistance =
          dot(delta, delta) + uSoftening * uSoftening;
        float inverseRegularizedCube = pow(
          regularizedSquaredDistance,
          -1.5
        );
        field += delta * uMassWeights[bodyIndex] * inverseRegularizedCube;
      }
    }

    float fieldMagnitude = length(field);
    float amplitude = uMaxDisplacement * (
      1.0 - exp(-uFieldCompression * fieldMagnitude)
    );
    amplitude = clamp(amplitude, 0.0, uMaxDisplacement);
    vec3 displacement = fieldMagnitude > 0.0
      ? field / fieldMagnitude * amplitude
      : vec3(0.0);
    vec3 transformed = position + displacement;
    vNormalizedDisplacement = amplitude / uMaxDisplacement;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
  }
`;

const POTENTIAL_GRID_FRAGMENT_SHADER = /* glsl */ `
  varying float vNormalizedDisplacement;

  void main() {
    vec3 quietColor = vec3(0.16, 0.43, 0.62);
    vec3 influencedColor = vec3(0.57, 0.32, 0.88);
    vec3 color = mix(quietColor, influencedColor, vNormalizedDisplacement);
    float alpha = mix(0.24, 0.72, vNormalizedDisplacement);
    gl_FragColor = vec4(color, alpha);
  }
`;

function writeBodyPositionUniforms(
  session: GravityLabSession,
  positions: readonly Vector3[],
  scratch: { x: number; y: number; z: number }
): boolean {
  let changed = false;

  for (let index = 0; index < session.bodies.length; index += 1) {
    session.writeScenePosition(session.bodies[index].bodyId, scratch);
    const target = positions[index];

    if (
      target.x !== scratch.x ||
      target.y !== scratch.y ||
      target.z !== scratch.z
    ) {
      target.set(scratch.x, scratch.y, scratch.z);
      changed = true;
    }
  }

  return changed;
}

function readSessionScenePositions(
  session: GravityLabSession
): readonly Readonly<{ x: number; y: number; z: number }>[] {
  return session.bodies.map(({ bodyId }) => {
    const position = { x: 0, y: 0, z: 0 };
    session.writeScenePosition(bodyId, position);
    return Object.freeze(position);
  });
}

export function GravityPotentialGrid({
  session,
  visible,
}: Readonly<{
  session: GravityLabSession;
  visible: boolean;
}>) {
  const invalidate = useThree((state) => state.invalidate);
  const activity = resolvePotentialGridActivity(visible);
  const scratchPosition = useRef({ x: 0, y: 0, z: 0 });
  const resources = useMemo(() => {
    const bounds = calculatePotentialGridBounds(
      readSessionScenePositions(session)
    );
    const linePositions = createPotentialGridLinePositions(bounds);
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(linePositions, 3));
    const preparedMasses = preparePotentialMasses(
      session.bodies.map(({ massKg }) => massKg)
    );
    const bodyPositions = Array.from(
      { length: MAX_SHADER_BODIES },
      () => new Vector3()
    );
    writeBodyPositionUniforms(
      session,
      bodyPositions,
      { x: 0, y: 0, z: 0 }
    );
    const material = new ShaderMaterial({
      uniforms: {
        uBodyCount: { value: preparedMasses.bodyCount },
        uBodyPositions: { value: bodyPositions },
        uMassWeights: { value: preparedMasses.massWeights },
        uSoftening: { value: GRAVITY_GRID_VISUAL_SOFTENING_SCENE },
        uFieldCompression: { value: GRAVITY_GRID_FIELD_COMPRESSION },
        uMaxDisplacement: { value: GRAVITY_GRID_MAX_DISPLACEMENT_SCENE },
      },
      vertexShader: POTENTIAL_GRID_VERTEX_SHADER,
      fragmentShader: POTENTIAL_GRID_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
    });

    return { bodyPositions, geometry, material };
  }, [session]);
  const resourcesRef = useRef(resources);

  useEffect(() => {
    resourcesRef.current = resources;
    invalidate();

    return () => {
      resources.geometry.dispose();
      resources.material.dispose();
    };
  }, [invalidate, resources]);

  useFrame(() => {
    if (!activity.updateUniforms) {
      return;
    }

    const activeResources = resourcesRef.current;

    if (
      writeBodyPositionUniforms(
        session,
        activeResources.bodyPositions,
        scratchPosition.current
      )
    ) {
      activeResources.material.uniformsNeedUpdate = true;
    }
  });

  return (
    <lineSegments
      visible={activity.draw}
      geometry={resources.geometry}
      material={resources.material}
      frustumCulled={false}
      renderOrder={-1}
      raycast={() => undefined}
    />
  );
}
