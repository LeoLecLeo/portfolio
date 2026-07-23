export type Vector3 = Readonly<{
  x: number;
  y: number;
  z: number;
}>;

export function vector3(x: number, y: number, z: number): Vector3 {
  return { x, y, z };
}

export function addVector3(left: Vector3, right: Vector3): Vector3 {
  return vector3(left.x + right.x, left.y + right.y, left.z + right.z);
}

export function subtractVector3(left: Vector3, right: Vector3): Vector3 {
  return vector3(left.x - right.x, left.y - right.y, left.z - right.z);
}

export function scaleVector3(value: Vector3, factor: number): Vector3 {
  return vector3(value.x * factor, value.y * factor, value.z * factor);
}

export function dotVector3(left: Vector3, right: Vector3): number {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}

export function crossVector3(left: Vector3, right: Vector3): Vector3 {
  return vector3(
    left.y * right.z - left.z * right.y,
    left.z * right.x - left.x * right.z,
    left.x * right.y - left.y * right.x
  );
}

export function magnitudeSquaredVector3(value: Vector3): number {
  return dotVector3(value, value);
}

export function magnitudeVector3(value: Vector3): number {
  return Math.sqrt(magnitudeSquaredVector3(value));
}

export function isFiniteVector3(value: Vector3): boolean {
  return (
    Number.isFinite(value.x) &&
    Number.isFinite(value.y) &&
    Number.isFinite(value.z)
  );
}

export function vector3FromArray(
  values: ArrayLike<number>,
  bodyIndex: number
): Vector3 {
  const offset = bodyIndex * 3;

  return vector3(values[offset], values[offset + 1], values[offset + 2]);
}
