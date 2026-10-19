import * as THREE from "three";
import { createWalker } from "@/game/character";
import { devices, GAME_CODES, movementKeys, radialDeadzone } from "@/game/devices";
import {
  ACCEL,
  approach,
  LOOK_RATE,
  PITCH_RATE,
  signedAngle,
  slerpUnit,
  SPRINT_SPEED,
  SUN_DIR,
  tangentFrame,
  travel,
  TURN_RATE,
  WALK_SPEED,
  WORLD_RADIUS,
  hash01,
} from "@/game/math";
import { Flora } from "@/game/flora";
import {
  createGroundGeometry,
  createGroundMaterial,
  createSkyMaterial,
  type GroundMat,
} from "@/game/shaders";

export type HudState = {
  ready: boolean;
  journal: boolean;
  entered: boolean;
  split: boolean;
  nearPlant: boolean;
  padLabels: [string | null, string | null];
  error: string | null;
};

export type GameApi = {
  enter: () => void;
  toggleJournal: () => void;
  joinSecond: () => void;
  dismissSecond: () => void;
};

type Pose = {
  px: number;
  py: number;
  pz: number;
  fx: number;
  fy: number;
  fz: number;
  cx: number;
  cy: number;
  cz: number;
  pitch: number;
};

type Save = {
  version: 1;
  entered: boolean;
  split: boolean;
  p1: Pose;
  p2: Pose | null;
};

type Player = {
  pos: THREE.Vector3;
  face: THREE.Vector3;
  camForward: THREE.Vector3;
  pitch: number;
  speed: number;
  phase: number;
  amp: number;
  active: boolean;
  rig: ReturnType<typeof createWalker>;
  ground: GroundMat;
  groundMesh: THREE.Mesh;
};

const SAVE_KEY = "pflanzen.world.v1";

declare global {
  interface Window {
    __controlsTest?: {
      getYaw: () => number;
      getSpeed: () => number;
      getPlace: () => { x: number; y: number; z: number; fx: number; fz: number; near: number };
      setKeys?: (codes: string[]) => void;
      setSteer?: (v: number) => void;
    };
  }
}

export function createGame(
  canvas: HTMLCanvasElement,
  hooks: { onHud: (hud: HudState) => void; onReady: (api: GameApi) => void },
): () => void {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0xf0d7b4, 1);
  renderer.autoClear = false;

  const scene = new THREE.Scene();
  const skyScene = new THREE.Scene();
  const skyMat = createSkyMaterial();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(700, 28, 20), skyMat);
  sky.frustumCulled = false;
  skyScene.add(sky);

  scene.add(new THREE.AmbientLight(0xfff4e8, 0.7));
  const sun = new THREE.DirectionalLight(0xfff1d4, 2.6);
  sun.position.copy(SUN_DIR);
  scene.add(sun);
  scene.add(sun.target);

  const groundGeo = createGroundGeometry();
  const p1 = makePlayer(0x5f7340, 0x3d4a2a, groundGeo, true);
  const p2 = makePlayer(0xb85a3d, 0x6a3224, groundGeo, false);
  scene.add(p1.groundMesh, p2.groundMesh, p1.rig.root, p2.rig.root, createRocks());
  const flora = new Flora();
  scene.add(flora.group);

  const cam1 = new THREE.PerspectiveCamera(68, 1, 0.12, 2400);
  const cam2 = new THREE.PerspectiveCamera(68, 1, 0.12, 2400);

  let journal = true;
  let entered = false;
  let split = false;
  let nearPlant = false;
  let p2Placed = false;
  let userLooked = false;
  let prevSpace = false;
  let prevEsc = false;
  let acc = 0;
  let last = -1;
  let clock = 0;
  let saveIn = 0;
  let hudKey = "";

  restore();
  flora.update(p1.pos, p2.active ? p2.pos : null);

  const _y = new THREE.Vector3();
  const _right = new THREE.Vector3();
  const _wish = new THREE.Vector3();
  const _target = new THREE.Vector3();
  const _x = new THREE.Vector3();
  const _z = new THREE.Vector3();
  const _m = new THREE.Matrix4();
  const _cam = new THREE.Vector3();
  const _look = new THREE.Vector3();
  const _buf = new THREE.Vector2();

  function emit(force = false) {
    const pads = currentPads();
    const labels: [string | null, string | null] = [labelOf(pads[0]), labelOf(pads[1])];
    const key = `${journal}|${entered}|${split}|${nearPlant}|${labels[0]}|${labels[1]}`;
    if (!force && key === hudKey) return;
    hudKey = key;
    hooks.onHud({
      ready: true,
      journal,
      entered,
      split,
      nearPlant,
      padLabels: [labels[0], labels[1]],
      error: null,
    });
  }

  function enter() {
    if (!entered) p1.face.copy(p1.camForward);
    journal = false;
    entered = true;
    emit(true);
    save();
  }

  function toggleJournal() {
    if (!entered) {
      enter();
      return;
    }
    journal = !journal;
    emit(true);
  }

  function joinSecond() {
    if (!p2Placed) {
      p2.pos.copy(p1.pos);
      p2.face.copy(p1.face);
      p2.camForward.copy(p1.camForward);
      p2.pitch = p1.pitch;
      _y.copy(p1.pos).multiplyScalar(1 / WORLD_RADIUS);
      _right.crossVectors(p1.camForward, _y).normalize();
      travel(p2.pos, _right, 3.4, [p2.camForward, p2.face]);
      p2Placed = true;
    }
    p2.active = true;
    split = true;
    buzz(1);
    emit(true);
    save();
  }

  function dismissSecond() {
    p2.active = false;
    split = false;
    emit(true);
    save();
  }

  const api: GameApi = { enter, toggleJournal, joinSecond, dismissSecond };

  window.__controlsTest = {
    getYaw: () => {
      _y.copy(p1.pos).multiplyScalar(1 / WORLD_RADIUS);
      return signedAngle(_y, p1.camForward, p1.face);
    },
    getSpeed: () => p1.speed,
    getPlace: () => ({
      x: p1.pos.x,
      y: p1.pos.y,
      z: p1.pos.z,
      fx: p1.face.x,
      fz: p1.face.z,
      near: flora.nearest(p1.pos),
    }),
    setKeys: (codes) => {
      if (!codes.length) {
        devices.keyOverride = null;
        return;
      }
      devices.keyOverride = new Set(codes);
      if (!entered) p1.face.copy(p1.camForward);
      journal = false;
      entered = true;
    },
    setSteer: (v) => {
      devices.steerOverride = v;
      if (v !== 0) {
        if (!entered) p1.face.copy(p1.camForward);
        journal = false;
        entered = true;
      }
    },
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (GAME_CODES.has(e.code) || e.code === "Escape") e.preventDefault();
    devices.keys.add(e.code);
  };
  const onKeyUp = (e: KeyboardEvent) => {
    devices.keys.delete(e.code);
  };
  const onBlur = () => devices.keys.clear();
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);
  document.addEventListener("visibilitychange", onBlur);

  const ro = new ResizeObserver(() => resize());
  ro.observe(canvas.parentElement ?? canvas);
  resize();

  function resize() {
    const parent = canvas.parentElement;
    const w = parent?.clientWidth || window.innerWidth;
    const h = parent?.clientHeight || window.innerHeight;
    if (w < 2 || h < 2) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, w < 800 ? 1.35 : 1.75));
    renderer.setSize(w, h, false);
  }

  function frame(now: number) {
    if (last < 0) last = now;
    const delta = Math.min(0.1, (now - last) / 1000);
    last = now;
    applyDrag(p1, 0);
    if (p2.active) applyDrag(p2, 1);
    acc += delta;
    let steps = 0;
    while (acc >= 1 / 60 && steps < 5) {
      sim(1 / 60);
      acc -= 1 / 60;
      steps++;
    }
    draw();
  }

  function applyDrag(p: Player, index: number) {
    const yawLeft = devices.dragYaw[index];
    const pitchAdd = devices.dragPitch[index];
    devices.dragYaw[index] = 0;
    devices.dragPitch[index] = 0;
    if (!yawLeft && !pitchAdd) return;
    userLooked = true;
    _y.copy(p.pos).multiplyScalar(1 / WORLD_RADIUS);
    p.camForward.applyAxisAngle(_y, yawLeft);
    p.camForward.addScaledVector(_y, -p.camForward.dot(_y)).normalize();
    p.pitch = THREE.MathUtils.clamp(p.pitch + pitchAdd, -0.32, 0.55);
  }

  function sim(dt: number) {
    const pads = currentPads();
    const space = devices.keys.has("Space");
    const esc = devices.keys.has("Escape");
    if (space && !prevSpace) enter();
    if (esc && !prevEsc) toggleJournal();
    prevSpace = space;
    prevEsc = esc;

    if (!p2.active && wantsSecond(devices.keys, pads[1])) joinSecond();

    if (!journal) {
      const keys = movementKeys();
      stepPlayer(p1, 0, keys, pads[0], dt);
      if (p2.active) stepPlayer(p2, 1, devices.keys, pads[1], dt);
      separate();
    } else if (!entered && !reduced && !userLooked) {
      _y.copy(p1.pos).multiplyScalar(1 / WORLD_RADIUS);
      p1.camForward.applyAxisAngle(_y, 0.06 * dt);
      p1.camForward.addScaledVector(_y, -p1.camForward.dot(_y)).normalize();
      faceBody(p1);
    } else {
      faceBody(p1);
      if (p2.active) faceBody(p2);
    }

    if (!reduced) clock += dt;
    (skyMat.uniforms.uTime as { value: number }).value = clock;
    flora.update(p1.pos, p2.active ? p2.pos : null);
    nearPlant = flora.nearest(p1.pos) < 2.4 || (p2.active && flora.nearest(p2.pos) < 2.4);
    saveIn += dt;
    if (entered && saveIn > 2) {
      saveIn = 0;
      save();
    }
    emit(false);
  }

  function stepPlayer(p: Player, index: number, keys: Set<string>, pad: Gamepad | undefined, dt: number) {
    const input = readMove(index, keys, pad);
    _y.copy(p.pos).multiplyScalar(1 / WORLD_RADIUS);
    const lookX = THREE.MathUtils.clamp(input.lookX, -1, 1);
    const lookY = THREE.MathUtils.clamp(input.lookY, -1, 1);
    if (lookX) {
      p.camForward.applyAxisAngle(_y, -lookX * LOOK_RATE * dt);
      p.camForward.addScaledVector(_y, -p.camForward.dot(_y)).normalize();
    }
    if (lookY) p.pitch = THREE.MathUtils.clamp(p.pitch - lookY * PITCH_RATE * dt, -0.32, 0.55);

    tangentFrame(_y, p.camForward, _right, _wish);
    _wish.set(0, 0, 0).addScaledVector(p.camForward, input.moveY).addScaledVector(_right, input.moveX);
    const mag = Math.hypot(_wish.x, _wish.y, _wish.z);
    if (mag > 0.04) {
      if (mag > 1) _wish.multiplyScalar(1 / mag);
      _target.copy(_wish);
      _target.addScaledVector(_y, -_target.dot(_y)).normalize();
      slerpUnit(p.face, _target, TURN_RATE * dt);
      const goal = (input.sprint ? SPRINT_SPEED : WALK_SPEED) * Math.min(1, mag);
      p.speed = approach(p.speed, goal, ACCEL * dt);
      travel(p.pos, _target, p.speed * dt, [p.camForward, p.face]);
      p.phase += p.speed * 3.2 * dt;
    } else {
      p.speed = approach(p.speed, 0, ACCEL * dt);
    }
    p.amp = approach(p.amp, mag > 0.04 ? Math.min(1, p.speed / WALK_SPEED) : 0, dt * 6);
    p.rig.pose(p.phase, p.amp);
    faceBody(p);
  }

  function faceBody(p: Player) {
    _y.copy(p.pos).multiplyScalar(1 / WORLD_RADIUS);
    _z.copy(p.face).addScaledVector(_y, -p.face.dot(_y)).normalize();
    _x.crossVectors(_y, _z).normalize();
    _m.makeBasis(_x, _y, _z);
    p.rig.root.quaternion.setFromRotationMatrix(_m);
    p.rig.root.position.copy(p.pos);
  }

  function separate() {
    if (!p2.active) return;
    const d = p1.pos.distanceTo(p2.pos);
    if (d > 0.9 || d < 1e-4) return;
    _wish.copy(p2.pos).sub(p1.pos);
    travel(p2.pos, _wish, (0.9 - d) * 0.5, [p2.camForward, p2.face]);
  }

  function draw() {
    renderer.getDrawingBufferSize(_buf);
    const bw = _buf.x;
    const bh = _buf.y;
    if (bw < 2 || bh < 2) return;
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, bw, bh);
    renderer.clear(true, true, true);
    renderer.setScissorTest(true);
    p1.rig.root.visible = true;
    p2.rig.root.visible = p2.active;
    if (!split || !p2.active) {
      paint(p1, cam1, 0, 0, bw, bh);
    } else {
      const gap = Math.max(4, Math.round(4 * renderer.getPixelRatio()));
      const hw = Math.floor((bw - gap) / 2);
      paint(p1, cam1, 0, 0, hw, bh);
      paint(p2, cam2, hw + gap, 0, bw - hw - gap, bh);
    }
  }

  function paint(p: Player, cam: THREE.PerspectiveCamera, x: number, y: number, w: number, h: number) {
    cam.aspect = w / Math.max(1, h);
    cam.updateProjectionMatrix();
    placeCamera(cam, p);
    p1.groundMesh.visible = p === p1;
    p2.groundMesh.visible = p === p2;
    const u = p.ground.uniforms;
    _y.copy(p.pos).multiplyScalar(1 / WORLD_RADIUS);
    tangentFrame(_y, p.camForward, u.uEast.value, u.uNorth.value);
    u.uCenter.value.copy(p.pos);
    u.uCamPos.value.copy(cam.position);
    u.uFeet.value.copy(p.pos);
    sky.position.copy(cam.position);
    (skyMat.uniforms.uCamPos as { value: THREE.Vector3 }).value.copy(cam.position);
    renderer.setViewport(x, y, w, h);
    renderer.setScissor(x, y, w, h);
    renderer.clear(true, true, true);
    renderer.render(skyScene, cam);
    renderer.clearDepth();
    renderer.render(scene, cam);
  }

  function placeCamera(cam: THREE.PerspectiveCamera, p: Player) {
    _y.copy(p.pos).multiplyScalar(1 / WORLD_RADIUS);
    const camH = 2.15 + Math.sin(p.pitch) * 2.5;
    const back = 6.7 * Math.cos(p.pitch * 0.35);
    _cam.copy(p.pos).addScaledVector(_y, camH).addScaledVector(p.camForward, -back);
    if (_cam.length() < WORLD_RADIUS + 0.55) _cam.setLength(WORLD_RADIUS + 0.55);
    _look.copy(p.pos).addScaledVector(_y, 1.4 + p.pitch * 0.15).addScaledVector(p.camForward, 0.8);
    cam.position.copy(_cam);
    cam.up.copy(_y);
    cam.lookAt(_look);
  }

  function save() {
    try {
      const data: Save = {
        version: 1,
        entered,
        split: split && p2.active,
        p1: poseOf(p1),
        p2: p2Placed ? poseOf(p2) : null,
      };
      sessionStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch {
      /* private mode */
    }
  }

  function restore() {
    try {
      const raw = sessionStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw) as Save;
      if (data.version !== 1 || !validPose(data.p1)) return;
      applyPose(p1, data.p1);
      entered = Boolean(data.entered);
      journal = !entered;
      if (data.p2 && validPose(data.p2)) {
        applyPose(p2, data.p2);
        p2Placed = true;
        p2.active = Boolean(data.split);
        split = p2.active;
      }
    } catch {
      /* ignore broken save */
    }
  }

  hooks.onReady(api);
  emit(true);
  renderer.setAnimationLoop(frame);

  return () => {
    save();
    renderer.setAnimationLoop(null);
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("blur", onBlur);
    document.removeEventListener("visibilitychange", onBlur);
    ro.disconnect();
    groundGeo.dispose();
    p1.ground.dispose();
    p2.ground.dispose();
    skyMat.dispose();
    (sky.geometry as THREE.BufferGeometry).dispose();
    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry && mesh.geometry !== groundGeo) mesh.geometry.dispose();
      const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(material)) material.forEach((m) => m.dispose());
      else material?.dispose();
    });
    renderer.dispose();
    if (window.__controlsTest) delete window.__controlsTest;
  };
}

function makePlayer(coat: number, hat: number, geo: THREE.BufferGeometry, active: boolean): Player {
  const rig = createWalker(coat, hat);
  rig.root.traverse((obj) => {
    obj.frustumCulled = false;
  });
  const ground = createGroundMaterial();
  const groundMesh = new THREE.Mesh(geo, ground);
  groundMesh.frustumCulled = false;
  groundMesh.matrixAutoUpdate = false;
  return {
    pos: new THREE.Vector3(0, WORLD_RADIUS, 0),
    face: new THREE.Vector3(0, 0, -1),
    camForward: new THREE.Vector3(0, 0, -1),
    pitch: 0.24,
    speed: 0,
    phase: 0,
    amp: 0,
    active,
    rig,
    ground,
    groundMesh,
  };
}

function createRocks() {
  const geo = new THREE.DodecahedronGeometry(1, 0);
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.94, metalness: 0 });
  const count = 56;
  const mesh = new THREE.InstancedMesh(geo, material, count);
  mesh.frustumCulled = false;
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const pos = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const up = new THREE.Vector3();
  const yAxis = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < count; i++) {
    const hero = i === 0;
    const ang = hash01(i * 3.1) * Math.PI * 2;
    const dist = hero ? 8.5 : 5.5 + hash01(i * 5.7) * 155;
    if (hero) dir.set(1, 0, 0);
    else dir.set(Math.cos(ang), 0, Math.sin(ang));
    pos.set(0, WORLD_RADIUS, 0);
    travel(pos, dir, dist, []);
    up.copy(pos).multiplyScalar(1 / WORLD_RADIUS);
    const s = hero ? 1.15 : 0.16 + hash01(i * 9.2) * 0.55;
    dummy.position.copy(up).multiplyScalar(WORLD_RADIUS + s * 0.4);
    const sx = s * (0.8 + hash01(i + 1) * 0.45);
    const sy = s * (hero ? 0.72 : 0.45 + hash01(i + 2) * 0.4);
    const sz = s * (0.75 + hash01(i + 3) * 0.5);
    dummy.scale.set(sx, sy, sz);
    dummy.quaternion.setFromUnitVectors(yAxis, up);
    dummy.rotateY(hash01(i * 4.2) * Math.PI * 2);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    color.set(hero ? "#7d654e" : hash01(i * 2.2) > 0.55 ? "#6b5342" : "#8d7358");
    mesh.setColorAt(i, color);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return mesh;
}

function currentPads() {
  const out: Gamepad[] = [];
  const list = navigator.getGamepads?.();
  if (!list) return out;
  for (let i = 0; i < list.length; i++) {
    const pad = list[i];
    if (pad && pad.connected) out.push(pad);
  }
  return out;
}

function labelOf(pad: Gamepad | undefined) {
  if (!pad) return null;
  const id = pad.id || "";
  if (/xbox|x-?input/i.test(id)) return "Xbox";
  if (/dualsense|dualshock|playstation|sony/i.test(id)) return "PlayStation";
  if (/8bitdo/i.test(id)) return "8BitDo";
  return "Controller";
}

function readMove(index: number, keys: Set<string>, pad?: Gamepad) {
  let moveX = 0;
  let moveY = 0;
  let lookX = 0;
  let lookY = 0;
  let sprint = false;
  if (index === 0) {
    if (keys.has("KeyA")) moveX -= 1;
    if (keys.has("KeyD")) moveX += 1;
    if (keys.has("KeyW")) moveY += 1;
    if (keys.has("KeyS")) moveY -= 1;
    if (keys.has("KeyQ")) lookX -= 1;
    if (keys.has("KeyE")) lookX += 1;
    if (keys.has("ShiftLeft") || keys.has("ShiftRight")) sprint = true;
    if (devices.steerOverride) moveX -= devices.steerOverride;
    moveX += devices.touchMoveX;
    moveY += devices.touchMoveY;
    lookX += devices.touchLookX;
    lookY += devices.touchLookY;
  } else {
    if (keys.has("ArrowLeft")) moveX -= 1;
    if (keys.has("ArrowRight")) moveX += 1;
    if (keys.has("ArrowUp")) moveY += 1;
    if (keys.has("ArrowDown")) moveY -= 1;
    if (keys.has("KeyO")) lookX -= 1;
    if (keys.has("KeyP")) lookX += 1;
    if (keys.has("KeyM")) sprint = true;
  }
  if (pad) {
    const stick = radialDeadzone(pad.axes[0] ?? 0, pad.axes[1] ?? 0);
    moveX += stick.x;
    moveY += -stick.y;
    const look = radialDeadzone(pad.axes[2] ?? 0, pad.axes[3] ?? 0, 0.2);
    lookX += look.x;
    lookY += -look.y;
    const rt = pad.buttons[7]?.value ?? 0;
    const lt = pad.buttons[6]?.value ?? 0;
    if (rt > 0.45 || lt > 0.45 || pad.buttons[10]?.pressed) sprint = true;
  }
  const m = Math.hypot(moveX, moveY);
  if (m > 1) {
    moveX /= m;
    moveY /= m;
  }
  return { moveX, moveY, lookX, lookY, sprint };
}

function wantsSecond(keys: Set<string>, pad?: Gamepad) {
  if (
    keys.has("ArrowUp") ||
    keys.has("ArrowDown") ||
    keys.has("ArrowLeft") ||
    keys.has("ArrowRight") ||
    keys.has("KeyO") ||
    keys.has("KeyP") ||
    keys.has("KeyM")
  ) {
    return true;
  }
  if (!pad) return false;
  const stick = radialDeadzone(pad.axes[0] ?? 0, pad.axes[1] ?? 0);
  if (stick.x || stick.y) return true;
  const look = radialDeadzone(pad.axes[2] ?? 0, pad.axes[3] ?? 0, 0.2);
  if (look.x || look.y) return true;
  for (let i = 0; i < pad.buttons.length; i++) {
    if (pad.buttons[i]?.pressed) return true;
  }
  return false;
}

function buzz(index: number) {
  const pad = currentPads()[index] as
    | (Gamepad & {
        vibrationActuator?: { playEffect?: (type: string, params: Record<string, number>) => void };
      })
    | undefined;
  try {
    pad?.vibrationActuator?.playEffect?.("dual-rumble", {
      duration: 80,
      startDelay: 0,
      strongMagnitude: 0.2,
      weakMagnitude: 0.35,
    });
  } catch {
    /* haptics are optional */
  }
}

function poseOf(p: Player): Pose {
  return {
    px: p.pos.x,
    py: p.pos.y,
    pz: p.pos.z,
    fx: p.face.x,
    fy: p.face.y,
    fz: p.face.z,
    cx: p.camForward.x,
    cy: p.camForward.y,
    cz: p.camForward.z,
    pitch: p.pitch,
  };
}

function validPose(value: unknown): value is Pose {
  if (!value || typeof value !== "object") return false;
  const p = value as Pose;
  return [p.px, p.py, p.pz, p.fx, p.fy, p.fz, p.cx, p.cy, p.cz, p.pitch].every(
    (n) => typeof n === "number" && Number.isFinite(n),
  );
}

function applyPose(p: Player, pose: Pose) {
  p.pos.set(pose.px, pose.py, pose.pz).setLength(WORLD_RADIUS);
  const up = p.pos.clone().normalize();
  p.face.set(pose.fx, pose.fy, pose.fz);
  p.camForward.set(pose.cx, pose.cy, pose.cz);
  for (const v of [p.face, p.camForward]) {
    v.addScaledVector(up, -v.dot(up));
    if (v.lengthSq() < 1e-8) v.set(0, 0, -1).addScaledVector(up, up.z);
    v.normalize();
  }
  p.pitch = THREE.MathUtils.clamp(pose.pitch, -0.32, 0.55);
}
