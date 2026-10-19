import * as THREE from "three";

/** Sphere diameter is 10 km. Positions stay near 5 km, well inside float32. */
export const WORLD_RADIUS = 5000;

export const WALK_SPEED = 4.6;
export const SPRINT_SPEED = 9.2;
export const ACCEL = 28;
export const TURN_RATE = 12;
export const LOOK_RATE = 1.75;
export const PITCH_RATE = 1.15;

export const SUN_DIR = new THREE.Vector3(0.46, 0.76, 0.3).normalize();

const _up = new THREE.Vector3();
const _tangent = new THREE.Vector3();
const _axis = new THREE.Vector3();

/** Move `pos` along the sphere and parallel-transport tangent vectors with it. */
export function travel(
  pos: THREE.Vector3,
  direction: THREE.Vector3,
  distance: number,
  carried: THREE.Vector3[],
) {
  if (distance === 0) return;
  _up.copy(pos).multiplyScalar(1 / WORLD_RADIUS);
  _tangent.copy(direction);
  _tangent.addScaledVector(_up, -_tangent.dot(_up));
  const lenSq = _tangent.lengthSq();
  if (lenSq < 1e-12) return;
  _tangent.multiplyScalar(1 / Math.sqrt(lenSq));
  _axis.crossVectors(_up, _tangent).normalize();
  const angle = distance / WORLD_RADIUS;
  pos.applyAxisAngle(_axis, angle);
  pos.setLength(WORLD_RADIUS);
  _up.copy(pos).multiplyScalar(1 / WORLD_RADIUS);
  for (const v of carried) {
    v.applyAxisAngle(_axis, angle);
    v.addScaledVector(_up, -v.dot(_up));
    const n = v.lengthSq();
    if (n < 1e-12) {
      v.set(1, 0, 0).addScaledVector(_up, -_up.x);
      if (v.lengthSq() < 1e-8) v.set(0, 0, 1).addScaledVector(_up, -_up.z);
    }
    v.normalize();
  }
}

/** east = screen-right when looking along `forward`, north = forward on the tangent plane. */
export function tangentFrame(
  up: THREE.Vector3,
  forward: THREE.Vector3,
  east: THREE.Vector3,
  north: THREE.Vector3,
) {
  north.copy(forward);
  north.addScaledVector(up, -north.dot(up));
  if (north.lengthSq() < 1e-10) {
    north.set(1, 0, 0).addScaledVector(up, -up.x);
    if (north.lengthSq() < 1e-10) north.set(0, 0, 1).addScaledVector(up, -up.z);
  }
  north.normalize();
  east.crossVectors(north, up).normalize();
}

/** Signed angle around `up` from `from` to `to`. Positive is a left turn (CCW about up). */
export function signedAngle(up: THREE.Vector3, from: THREE.Vector3, to: THREE.Vector3) {
  _tangent.crossVectors(from, to);
  return Math.atan2(_tangent.dot(up), from.dot(to));
}

export function slerpUnit(current: THREE.Vector3, target: THREE.Vector3, maxRad: number) {
  const dot = THREE.MathUtils.clamp(current.dot(target), -1, 1);
  const ang = Math.acos(dot);
  if (ang < 1e-4) {
    current.copy(target);
    return;
  }
  const t = Math.min(1, maxRad / ang);
  const sin = Math.sin(ang);
  const a = Math.sin((1 - t) * ang) / sin;
  const b = Math.sin(t * ang) / sin;
  current.multiplyScalar(a).addScaledVector(target, b).normalize();
}

export function approach(current: number, target: number, maxDelta: number) {
  const d = target - current;
  if (Math.abs(d) <= maxDelta) return target;
  return current + Math.sign(d) * maxDelta;
}

export function hash01(n: number) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return x - Math.floor(x);
}
