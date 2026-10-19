/** Shared input the React overlay and the simulation both touch. */

export const devices = {
  keys: new Set<string>(),
  /** When set, replaces the physical keyboard for player 1 (QA probe). */
  keyOverride: null as Set<string> | null,
  /** +1 means player-left, same sign as the vehicle steer probe. */
  steerOverride: null as number | null,
  touchMoveX: 0,
  touchMoveY: 0,
  touchLookX: 0,
  touchLookY: 0,
  /** Radians pending this frame. Positive yaw turns the view left. */
  dragYaw: [0, 0] as [number, number],
  /** Radians pending. Positive pitch looks down. */
  dragPitch: [0, 0] as [number, number],
};

export const GAME_CODES = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "KeyQ",
  "KeyE",
  "ShiftLeft",
  "ShiftRight",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "KeyO",
  "KeyP",
  "KeyM",
  "Space",
]);

export function movementKeys(): Set<string> {
  return devices.keyOverride ?? devices.keys;
}

export function radialDeadzone(x: number, y: number, dz = 0.16) {
  const m = Math.hypot(x, y);
  if (m < dz) return { x: 0, y: 0 };
  const scale = Math.min(1, (m - dz) / (1 - dz)) / m;
  return { x: x * scale, y: y * scale };
}
