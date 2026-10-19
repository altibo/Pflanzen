import * as THREE from "three";
import { travel, WORLD_RADIUS } from "@/game/math";

const SPECIES = ["daisy", "dandelion", "chickweed", "nettle", "lily", "foxglove", "nightshade"] as const;
const CAP = 18;
const CELL = 34;

const UNIT = {
  sphere: new THREE.SphereGeometry(1, 10, 8),
  cone: new THREE.ConeGeometry(1, 1, 8),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 7),
};

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _y = new THREE.Vector3(0, 1, 0);
const _dir = new THREE.Vector3();

function xf(x: number, y: number, z: number, rx: number, ry: number, rz: number, sx: number, sy: number, sz: number) {
  _e.set(rx, ry, rz);
  _q.setFromEuler(_e);
  _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
  return _m;
}

class GeoBuild {
  private pos: number[] = [];
  private col: number[] = [];
  private idx: number[] = [];

  add(geo: THREE.BufferGeometry, matrix: THREE.Matrix4, color: THREE.Color) {
    const p = geo.getAttribute("position");
    const index = geo.getIndex();
    const base = this.pos.length / 3;
    for (let i = 0; i < p.count; i++) {
      _a.fromBufferAttribute(p, i).applyMatrix4(matrix);
      this.pos.push(_a.x, _a.y, _a.z);
      this.col.push(color.r, color.g, color.b);
    }
    if (index) {
      for (let i = 0; i < index.count; i++) this.idx.push(index.getX(i) + base);
    } else {
      for (let i = 0; i < p.count; i++) this.idx.push(base + i);
    }
  }

  tri(matrix: THREE.Matrix4, color: THREE.Color, ax: number, ay: number, bx: number, by: number, cx: number, cy: number) {
    const base = this.pos.length / 3;
    const pts = [
      [ax, ay],
      [bx, by],
      [cx, cy],
    ];
    for (const [x, y] of pts) {
      _a.set(x, y, 0).applyMatrix4(matrix);
      this.pos.push(_a.x, _a.y, _a.z);
      this.col.push(color.r, color.g, color.b);
    }
    this.idx.push(base, base + 1, base + 2);
  }

  finish() {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    return g;
  }
}

function leaf(
  b: GeoBuild,
  len: number,
  wid: number,
  teeth: number,
  serrate: boolean,
  matrix: THREE.Matrix4,
  color: THREE.Color,
) {
  for (let i = 0; i < teeth; i++) {
    const t0 = i / teeth;
    const t1 = (i + 1) / teeth;
    const y0 = t0 * len;
    const y1 = t1 * len;
    const env = (t: number) => Math.sin(t * Math.PI) * wid;
    const bite = (iEdge: number, t: number) => {
      if (!serrate || iEdge === 0 || iEdge === teeth) return env(t);
      return env(t) * (iEdge % 2 === 0 ? 1 : 0.32);
    };
    const e0 = bite(i, t0);
    const e1 = bite(i + 1, t1);
    b.tri(matrix, color, 0, y0, e0, y0, e1, y1);
    b.tri(matrix, color, 0, y0, e1, y1, 0, y1);
    b.tri(matrix, color, 0, y0, 0, y1, -e1, y1);
    b.tri(matrix, color, 0, y0, -e1, y1, -e0, y0);
  }
}

function disc(b: GeoBuild, radius: number, color: THREE.Color) {
  b.add(UNIT.cyl, xf(0, 0.006, 0, 0, 0, 0, radius, 0.01, radius), color);
}

function coneOut(b: GeoBuild, ox: number, oy: number, oz: number, dir: THREE.Vector3, radius: number, height: number, color: THREE.Color) {
  _q.setFromUnitVectors(_y, dir);
  _p.set(ox, oy, oz).addScaledVector(dir, height * 0.5);
  _m.compose(_p, _q, _s.set(radius, height, radius));
  b.add(UNIT.cone, _m, color);
}

function daisy(b: GeoBuild) {
  const green = new THREE.Color("#3d7a34");
  const white = new THREE.Color("#f6f3ec");
  const gold = new THREE.Color("#f0c12e");
  disc(b, 0.09, new THREE.Color("#2f4a28"));
  for (let i = 0; i < 8; i++) {
    leaf(b, 0.12, 0.03, 3, false, xf(0, 0.01, 0, 1.2, (i / 8) * Math.PI * 2, 0, 1, 1, 1), green);
  }
  b.add(UNIT.cyl, xf(0, 0.1, 0, 0, 0, 0, 0.005, 0.18, 0.005), green);
  const hy = 0.2;
  for (let i = 0; i < 14; i++) {
    leaf(b, 0.05, 0.012, 2, false, xf(0, hy, 0, 1.25, (i / 14) * Math.PI * 2, 0, 1, 1, 1), white);
  }
  b.add(UNIT.sphere, xf(0, hy + 0.012, 0, 0, 0, 0, 0.018, 0.014, 0.018), gold);
}

function dandelion(b: GeoBuild) {
  const leafCol = new THREE.Color("#6d8a2e");
  const stem = new THREE.Color("#5a7a32");
  const yellow = new THREE.Color("#f2c400");
  disc(b, 0.12, new THREE.Color("#3a4e22"));
  for (let i = 0; i < 9; i++) {
    leaf(b, 0.22, 0.05, 7, true, xf(0, 0.01, 0, 1.25, (i / 9) * Math.PI * 2 + 0.2, 0, 1, 1, 1), leafCol);
  }
  b.add(UNIT.cyl, xf(0, 0.28, 0, 0, 0, 0, 0.006, 0.5, 0.006), stem);
  b.add(UNIT.sphere, xf(0, 0.54, 0, 0, 0, 0, 0.032, 0.028, 0.032), yellow);
  for (let i = 0; i < 20; i++) {
    const t = (i + 0.5) / 20;
    const inc = Math.acos(1 - 2 * t);
    const az = Math.PI * (1 + Math.sqrt(5)) * i;
    _dir.set(Math.sin(inc) * Math.cos(az), Math.cos(inc), Math.sin(inc) * Math.sin(az));
    _b.copy(_dir).multiplyScalar(0.02).add(_p.set(0, 0.54, 0));
    coneOut(b, _b.x, _b.y, _b.z, _dir, 0.008, 0.03, yellow);
  }
}

function chickweed(b: GeoBuild) {
  const stem = new THREE.Color("#7eae48");
  const leafCol = new THREE.Color("#8fbe52");
  const white = new THREE.Color("#f7f5ef");
  disc(b, 0.16, new THREE.Color("#3d5228"));
  for (let s = 0; s < 5; s++) {
    const a = (s / 5) * Math.PI * 2;
    b.add(UNIT.cyl, xf(Math.sin(a) * 0.1, 0.03, Math.cos(a) * 0.1, 1.35, a, 0, 0.004, 0.22, 0.004), stem);
    for (let n = 0; n < 3; n++) {
      const t = 0.35 + n * 0.22;
      const x = Math.sin(a) * 0.1 * t * 2;
      const z = Math.cos(a) * 0.1 * t * 2;
      leaf(b, 0.045, 0.016, 2, false, xf(x, 0.03 + n * 0.015, z, 1.15, a + Math.PI / 2, 0, 1, 1, 1), leafCol);
    }
    const fx = Math.sin(a) * 0.2;
    const fz = Math.cos(a) * 0.2;
    for (let p = 0; p < 10; p++) {
      leaf(b, 0.028, 0.005, 2, false, xf(fx, 0.07, fz, 1.15, a + (p / 10) * Math.PI * 2, 0, 1, 1, 1), white);
    }
    b.add(UNIT.sphere, xf(fx, 0.075, fz, 0, 0, 0, 0.006, 0.006, 0.006), new THREE.Color("#dfe6c8"));
  }
}

function nettle(b: GeoBuild) {
  const stem = new THREE.Color("#2f6a30");
  const leafCol = new THREE.Color("#2c6b32");
  const tassel = new THREE.Color("#8aa45a");
  disc(b, 0.1, new THREE.Color("#243e22"));
  b.add(UNIT.cyl, xf(0, 0.48, 0, 0, 0, 0, 0.012, 0.96, 0.012), stem);
  for (let n = 0; n < 5; n++) {
    const y = 0.22 + n * 0.15;
    const droop = 0.85 + n * 0.06;
    leaf(b, 0.18, 0.06, 8, true, xf(0, y, 0, droop, n * 0.7, 0, 1, 1, 1), leafCol);
    leaf(b, 0.18, 0.06, 8, true, xf(0, y, 0, droop, n * 0.7 + Math.PI, 0, 1, 1, 1), leafCol);
    if (n >= 2) {
      b.add(UNIT.sphere, xf(0.02, y - 0.04, 0.02, 0, 0, 0, 0.012, 0.02, 0.012), tassel);
      b.add(UNIT.sphere, xf(-0.02, y - 0.05, -0.015, 0, 0, 0, 0.01, 0.018, 0.01), tassel);
    }
  }
}

function lily(b: GeoBuild) {
  const blade = new THREE.Color("#3e9a48");
  const stem = new THREE.Color("#3a8a42");
  const bell = new THREE.Color("#f4f2ea");
  disc(b, 0.08, new THREE.Color("#2e5a30"));
  leaf(b, 0.34, 0.09, 4, false, xf(0, 0.02, 0, 0.85, 0.4, 0.15, 1, 1, 1), blade);
  leaf(b, 0.3, 0.08, 4, false, xf(0, 0.02, 0, 0.95, Math.PI + 0.3, -0.1, 1, 1, 1), blade);
  for (let i = 0; i < 5; i++) {
    const t = (i + 0.5) / 5;
    const y = 0.08 + t * 0.22;
    const z = t * t * 0.08;
    b.add(UNIT.cyl, xf(0, y, z, 0.55 * t, 0, 0, 0.004, 0.05, 0.004), stem);
    b.add(UNIT.cone, xf(0.01, y - 0.02, z + 0.012, 2.6, 0, 0.3, 0.012, 0.02, 0.012), bell);
  }
}

function foxglove(b: GeoBuild) {
  const leafCol = new THREE.Color("#4e7a3a");
  const stem = new THREE.Color("#3e6a34");
  const bell = new THREE.Color("#b14d8c");
  const throat = new THREE.Color("#6c2458");
  disc(b, 0.16, new THREE.Color("#314828"));
  for (let i = 0; i < 6; i++) {
    leaf(b, 0.32, 0.08, 4, false, xf(0, 0.02, 0, 1.15, (i / 6) * Math.PI * 2, 0, 1, 1, 1), leafCol);
  }
  b.add(UNIT.cyl, xf(0, 0.72, 0, 0, 0, 0, 0.014, 1.44, 0.014), stem);
  for (let i = 0; i < 11; i++) {
    const y = 0.5 + i * 0.085;
    const side = i % 2 === 0 ? 1 : -1;
    const s = 0.05 * (1 - i * 0.04);
    b.add(UNIT.cone, xf(side * 0.045, y, 0.015, 0, 0, -side * 2.55, s * 0.85, s * 1.7, s * 0.85), bell);
    b.add(UNIT.cone, xf(side * 0.05, y - s * 0.15, 0.02, 0, 0, -side * 2.55, s * 0.32, s * 0.45, s * 0.32), throat);
  }
}

function nightshade(b: GeoBuild) {
  const stem = new THREE.Color("#3a6840");
  const leafCol = new THREE.Color("#4d7a44");
  const flower = new THREE.Color("#6d4e86");
  const berry = new THREE.Color("#140e14");
  disc(b, 0.14, new THREE.Color("#2a3e28"));
  for (let s = 0; s < 4; s++) {
    const a = (s / 4) * Math.PI * 2 + 0.4;
    const lean = 0.35;
    b.add(UNIT.cyl, xf(Math.sin(a) * 0.12, 0.42, Math.cos(a) * 0.12, lean, a, 0, 0.01, 0.85, 0.01), stem);
    for (let n = 0; n < 3; n++) {
      const y = 0.25 + n * 0.22;
      const x = Math.sin(a) * (0.08 + n * 0.04);
      const z = Math.cos(a) * (0.08 + n * 0.04);
      leaf(b, 0.14, 0.05, 3, false, xf(x, y, z, 0.7, a + 1, 0, 1, 1, 1), leafCol);
    }
    const topY = 0.7 + (s % 2) * 0.08;
    const tx = Math.sin(a) * 0.2;
    const tz = Math.cos(a) * 0.2;
    b.add(UNIT.cone, xf(tx, topY, tz, 2.4, a, 0, 0.02, 0.035, 0.02), flower);
    for (let k = 0; k < 3; k++) {
      b.add(
        UNIT.sphere,
        xf(tx + (k - 1) * 0.03, topY - 0.08 - (k % 2) * 0.02, tz + (k - 1) * 0.015, 0, 0, 0, 0.02, 0.02, 0.02),
        berry,
      );
    }
  }
}

const BUILDERS = [daisy, dandelion, chickweed, nettle, lily, foxglove, nightshade];
const READ = [3.1, 2.15, 2.5, 1.2, 1.9, 1.08, 1.35];

const GARDEN: { species: number; angle: number; dist: number; scale: number }[] = [
  { species: 0, angle: 0.28, dist: 5.2, scale: 1.05 },
  { species: 0, angle: 0.48, dist: 5.8, scale: 0.9 },
  { species: 1, angle: -0.22, dist: 6.0, scale: 1 },
  { species: 1, angle: 0.02, dist: 6.8, scale: 1.08 },
  { species: 2, angle: -0.55, dist: 4.8, scale: 1 },
  { species: 4, angle: -0.85, dist: 7.6, scale: 1 },
  { species: 3, angle: 0.72, dist: 8.4, scale: 1 },
  { species: 5, angle: 0.38, dist: 9.2, scale: 1 },
  { species: 6, angle: -0.35, dist: 10.4, scale: 1 },
];

type Spot = { species: number; pos: THREE.Vector3; yaw: number; scale: number };

function hash3(x: number, y: number, z: number, salt: number) {
  let n = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul((z | 0) + salt, 1274126177);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function placeOnSphere(angle: number, dist: number, target: THREE.Vector3) {
  _dir.set(Math.sin(angle), 0, -Math.cos(angle));
  target.set(0, WORLD_RADIUS, 0);
  travel(target, _dir, dist, []);
}

export class Flora {
  readonly group = new THREE.Group();
  private meshes: THREE.InstancedMesh[] = [];
  private spots: Spot[] = [];
  private key = "";
  private dummy = new THREE.Object3D();
  private pole = new THREE.Vector3(0, WORLD_RADIUS, 0);
  private boulder = new THREE.Vector3();

  constructor() {
    const matBase = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.7,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    for (let i = 0; i < BUILDERS.length; i++) {
      const b = new GeoBuild();
      BUILDERS[i](b);
      const geo = b.finish();
      const mesh = new THREE.InstancedMesh(geo, matBase.clone(), CAP);
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.meshes.push(mesh);
      this.group.add(mesh);
    }
    matBase.dispose();
    placeOnSphere(Math.PI / 2, 8.5, this.boulder);
  }

  update(a: THREE.Vector3, b: THREE.Vector3 | null) {
    const key = `${Math.round(a.x / CELL)},${Math.round(a.y / CELL)},${Math.round(a.z / CELL)}|${
      b ? `${Math.round(b.x / CELL)},${Math.round(b.y / CELL)},${Math.round(b.z / CELL)}` : ""
    }`;
    if (key === this.key) return;
    this.key = key;
    this.rebuild(a, b);
  }

  nearest(pos: THREE.Vector3) {
    let best = Infinity;
    for (const spot of this.spots) {
      const dx = spot.pos.x - pos.x;
      const dy = spot.pos.y - pos.y;
      const dz = spot.pos.z - pos.z;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  }

  private rebuild(a: THREE.Vector3, b: THREE.Vector3 | null) {
    const spots: Spot[] = [];
    for (const g of GARDEN) {
      const pos = new THREE.Vector3();
      placeOnSphere(g.angle, g.dist, pos);
      spots.push({ species: g.species, pos, yaw: g.angle, scale: g.scale });
    }
    const origins = b ? [a, b] : [a];
    const seen = new Set<string>();
    for (const origin of origins) {
      const ix = Math.round(origin.x / CELL);
      const iy = Math.round(origin.y / CELL);
      const iz = Math.round(origin.z / CELL);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dz = -1; dz <= 1; dz++) {
            const cx = ix + dx;
            const cy = iy + dy;
            const cz = iz + dz;
            const id = `${cx},${cy},${cz}`;
            if (seen.has(id)) continue;
            seen.add(id);
            const h = hash3(cx, cy, cz, 3);
            if (h > 0.7) continue;
            const center = new THREE.Vector3(cx, cy, cz).multiplyScalar(CELL);
            if (Math.abs(center.length() - WORLD_RADIUS) > 70) continue;
            center.setLength(WORLD_RADIUS);
            if (center.distanceTo(origin) > 88) continue;
            if (center.distanceTo(this.pole) < 16) continue;
            const up = center.clone().multiplyScalar(1 / WORLD_RADIUS);
            const east = new THREE.Vector3().crossVectors(_y, up);
            if (east.lengthSq() < 1e-6) east.set(1, 0, 0);
            east.normalize();
            const north = new THREE.Vector3().crossVectors(up, east).normalize();
            const ox = (hash3(cx, cy, cz, 9) - 0.5) * 22;
            const oz = (hash3(cx, cy, cz, 11) - 0.5) * 22;
            const pos = center.addScaledVector(east, ox).addScaledVector(north, oz);
            pos.setLength(WORLD_RADIUS);
            if (pos.distanceTo(this.boulder) < 1.6) continue;
            if (pos.distanceTo(this.pole) < 16) continue;
            let crowded = false;
            for (const other of spots) {
              if (other.pos.distanceToSquared(pos) < 2.2 * 2.2) {
                crowded = true;
                break;
              }
            }
            if (crowded) continue;
            spots.push({
              species: Math.min(SPECIES.length - 1, Math.floor(hash3(cx, cy, cz, 5) * SPECIES.length)),
              pos,
              yaw: hash3(cx, cy, cz, 7) * Math.PI * 2,
              scale: 0.9 + hash3(cx, cy, cz, 13) * 0.25,
            });
          }
        }
      }
    }
    this.spots = spots;
    const counts = new Array<number>(SPECIES.length).fill(0);
    for (const spot of spots) {
      const slot = counts[spot.species];
      if (slot >= CAP) continue;
      counts[spot.species] = slot + 1;
      const up = spot.pos.clone().multiplyScalar(1 / WORLD_RADIUS);
      this.dummy.position.copy(spot.pos);
      this.dummy.quaternion.setFromUnitVectors(_y, up);
      this.dummy.rotateY(spot.yaw);
      this.dummy.scale.setScalar(spot.scale * READ[spot.species]);
      this.dummy.updateMatrix();
      this.meshes[spot.species].setMatrixAt(slot, this.dummy.matrix);
    }
    for (let i = 0; i < this.meshes.length; i++) {
      this.meshes[i].count = counts[i];
      this.meshes[i].instanceMatrix.needsUpdate = true;
    }
  }
}
