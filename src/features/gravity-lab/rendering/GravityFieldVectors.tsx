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
  GRAVITY_FIELD_INTENSITY_COMPRESSION,
  GRAVITY_FIELD_MAX_LENGTH_SCENE,
  GRAVITY_FIELD_MIN_LENGTH_SCENE,
  GRAVITY_FIELD_VERTICES_PER_VECTOR,
  GRAVITY_FIELD_VISUAL_SOFTENING_SCENE,
  createGravityFieldSamplePositions,
  prepareGravityFieldMassWeights,
} from "./gravityFieldVectorPolicy";
import type { PotentialGridBounds } from "./gravityPotentialGridPolicy";

const MAX_SHADER_BODIES = 16;
const GLYPH_POINTS = new Float32Array([
  0, 0, 0, 1, 0, 0,
  1, 0, 0, 0.72, 0.16, 0,
  1, 0, 0, 0.72, -0.16, 0,
  1, 0, 0, 0.72, 0, 0.16,
  1, 0, 0, 0.72, 0, -0.16,
]);

const FIELD_VECTOR_VERTEX_SHADER = /* glsl */ `
  attribute vec3 aSamplePosition;

  uniform int uBodyCount;
  uniform vec3 uBodyPositions[${MAX_SHADER_BODIES}];
  uniform float uMassWeights[${MAX_SHADER_BODIES}];
  uniform float uSoftening;
  uniform float uIntensityCompression;
  uniform float uMinLength;
  uniform float uMaxLength;

  varying float vRelativeIntensity;

  void main() {
    vec3 field = vec3(0.0);

    for (int bodyIndex = 0; bodyIndex < ${MAX_SHADER_BODIES}; bodyIndex++) {
      if (bodyIndex < uBodyCount) {
        vec3 delta = uBodyPositions[bodyIndex] - aSamplePosition;
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
    vRelativeIntensity = clamp(
      1.0 - exp(-uIntensityCompression * fieldMagnitude),
      0.0,
      1.0
    );
    float arrowLength = fieldMagnitude > 0.0
      ? mix(uMinLength, uMaxLength, vRelativeIntensity)
      : 0.0;
    vec3 direction = fieldMagnitude > 0.0
      ? field / fieldMagnitude
      : vec3(1.0, 0.0, 0.0);
    vec3 referenceAxis = abs(direction.y) < 0.9
      ? vec3(0.0, 1.0, 0.0)
      : vec3(1.0, 0.0, 0.0);
    vec3 side = normalize(cross(direction, referenceAxis));
    vec3 up = normalize(cross(side, direction));
    vec3 transformed =
      aSamplePosition +
      direction * position.x * arrowLength +
      side * position.y * arrowLength +
      up * position.z * arrowLength;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
  }
`;

const FIELD_VECTOR_FRAGMENT_SHADER = /* glsl */ `
  varying float vRelativeIntensity;

  void main() {
    vec3 weakColor = vec3(0.20, 0.72, 1.0);
    vec3 strongColor = vec3(1.0, 0.34, 0.08);
    vec3 color = mix(weakColor, strongColor, vRelativeIntensity);
    float alpha = mix(0.48, 0.95, vRelativeIntensity);
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

function createArrowGeometry(samplePositions: Float32Array): BufferGeometry {
  const sampleCount = samplePositions.length / 3;
  const pointsPerGlyph = GLYPH_POINTS.length / 3;

  if (pointsPerGlyph !== GRAVITY_FIELD_VERTICES_PER_VECTOR) {
    throw new RangeError(
      "The gravity field glyph does not match its explicit vertex budget."
    );
  }

  const glyphPositions = new Float32Array(sampleCount * GLYPH_POINTS.length);
  const repeatedSamples = new Float32Array(sampleCount * GLYPH_POINTS.length);

  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
    const sampleOffset = sampleIndex * 3;
    const glyphOffset = sampleIndex * GLYPH_POINTS.length;
    glyphPositions.set(GLYPH_POINTS, glyphOffset);

    for (let pointIndex = 0; pointIndex < pointsPerGlyph; pointIndex += 1) {
      const targetOffset = glyphOffset + pointIndex * 3;
      repeatedSamples[targetOffset] = samplePositions[sampleOffset];
      repeatedSamples[targetOffset + 1] = samplePositions[sampleOffset + 1];
      repeatedSamples[targetOffset + 2] = samplePositions[sampleOffset + 2];
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(glyphPositions, 3));
  geometry.setAttribute(
    "aSamplePosition",
    new BufferAttribute(repeatedSamples, 3)
  );
  return geometry;
}

export function GravityFieldVectors({
  session,
  bounds,
  visible,
}: Readonly<{
  session: GravityLabSession;
  bounds: PotentialGridBounds;
  visible: boolean;
}>) {
  const invalidate = useThree((state) => state.invalidate);
  const scratchPosition = useRef({ x: 0, y: 0, z: 0 });
  const resources = useMemo(() => {
    const samples = createGravityFieldSamplePositions(bounds);
    const geometry = createArrowGeometry(samples);
    const preparedMasses = prepareGravityFieldMassWeights(
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
        uSoftening: { value: GRAVITY_FIELD_VISUAL_SOFTENING_SCENE },
        uIntensityCompression: {
          value: GRAVITY_FIELD_INTENSITY_COMPRESSION,
        },
        uMinLength: { value: GRAVITY_FIELD_MIN_LENGTH_SCENE },
        uMaxLength: { value: GRAVITY_FIELD_MAX_LENGTH_SCENE },
      },
      vertexShader: FIELD_VECTOR_VERTEX_SHADER,
      fragmentShader: FIELD_VECTOR_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
    });

    return { bodyPositions, geometry, material };
  }, [bounds, session]);
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
    if (!visible) {
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
      visible={visible}
      geometry={resources.geometry}
      material={resources.material}
      frustumCulled={false}
      renderOrder={1}
      raycast={() => undefined}
    />
  );
}
