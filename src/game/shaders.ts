import * as THREE from "three";
import { SUN_DIR, WORLD_RADIUS } from "@/game/math";

const NOISE = /* glsl */ `
float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 33.33);
  return fract((p.x + p.y) * p.z);
}
float vnoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash13(i);
  float n100 = hash13(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash13(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash13(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash13(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash13(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash13(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash13(i + vec3(1.0, 1.0, 1.0));
  float nx00 = mix(n000, n100, f.x);
  float nx10 = mix(n010, n110, f.x);
  float nx01 = mix(n001, n101, f.x);
  float nx11 = mix(n011, n111, f.x);
  return mix(mix(nx00, nx10, f.y), mix(nx01, nx11, f.y), f.z);
}
float fbm(vec3 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    s += a * vnoise(p);
    p = p * 2.03 + vec3(17.1, 3.7, 9.2);
    a *= 0.5;
  }
  return s;
}
`;

const GROUND_VERT = /* glsl */ `
uniform vec3 uCenter;
uniform vec3 uEast;
uniform vec3 uNorth;
uniform float uRadius;
varying vec3 vWorld;
varying vec3 vNormal;
void main() {
  vec3 p = uCenter + uEast * position.x + uNorth * position.y;
  vec3 nrm = normalize(p);
  vec3 world = nrm * uRadius;
  vWorld = world;
  vNormal = nrm;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

const GROUND_FRAG = /* glsl */ `
uniform vec3 uCamPos;
uniform vec3 uFeet;
uniform vec3 uSunDir;
uniform vec3 uSoilA;
uniform vec3 uSoilB;
uniform vec3 uSoilC;
uniform vec3 uPebble;
uniform vec3 uFog;
uniform vec3 uSunColor;
uniform vec3 uAmb;
varying vec3 vWorld;
varying vec3 vNormal;
void main() {
  float broad = fbm(vWorld * 0.045);
  float mid = fbm(vWorld * 0.28);
  float fine = fbm(vWorld * 1.35);
  vec3 albedo = mix(uSoilA, uSoilB, smoothstep(0.32, 0.72, broad));
  albedo = mix(albedo, uSoilC, smoothstep(0.48, 0.82, mid) * 0.55);
  float peb = smoothstep(0.68, 0.86, fine);
  albedo = mix(albedo, uPebble, peb * 0.65);
  float damp = smoothstep(0.58, 0.8, fbm(vWorld * 0.09 + 4.0));
  albedo = mix(albedo, albedo * vec3(0.72, 0.78, 0.68), damp * 0.45);

  float h = fbm(vWorld * 1.1);
  float hx = clamp(dFdx(h), -0.04, 0.04);
  float hy = clamp(dFdy(h), -0.04, 0.04);
  vec3 N = normalize(vNormal - dFdx(vWorld) * hx * 22.0 - dFdy(vWorld) * hy * 22.0);

  float ndl = dot(N, uSunDir);
  float sun = clamp(ndl, 0.0, 1.0);
  float wrap = clamp(ndl * 0.42 + 0.58, 0.0, 1.0);
  vec3 col = albedo * (uAmb * wrap + uSunColor * sun);
  vec3 viewDir = normalize(uCamPos - vWorld);
  float spec = pow(max(dot(reflect(-uSunDir, N), viewDir), 0.0), 48.0);
  col += spec * peb * damp * 0.22;

  float cd = distance(vWorld, uFeet);
  col *= 1.0 - exp(-cd * cd * 0.95) * 0.32;

  float dist = distance(uCamPos, vWorld);
  float fog = smoothstep(90.0, 360.0, dist);
  col = mix(col, uFog, fog);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const SKY_VERT = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const SKY_FRAG = /* glsl */ `
uniform vec3 uCamPos;
uniform vec3 uSunDir;
uniform vec3 uTop;
uniform vec3 uMid;
uniform vec3 uHaze;
uniform vec3 uGlow;
uniform float uTime;
varying vec3 vWorld;
void main() {
  vec3 dir = normalize(vWorld - uCamPos);
  vec3 up = normalize(uCamPos);
  float elev = dot(dir, up);
  vec3 col = mix(uHaze, uMid, smoothstep(-0.02, 0.28, elev));
  col = mix(col, uTop, smoothstep(0.12, 0.82, elev));
  float clouds = fbm(dir * 3.4 + vec3(uTime * 0.012, uTime * 0.004, 0.0));
  float cloud = smoothstep(0.52, 0.78, clouds) * smoothstep(0.05, 0.45, elev);
  col = mix(col, vec3(0.93, 0.9, 0.84), cloud * 0.55);
  float sunDisk = pow(max(dot(dir, uSunDir), 0.0), 1800.0);
  float sunGlow = pow(max(dot(dir, uSunDir), 0.0), 6.0);
  col += uGlow * sunGlow * 0.42;
  col += vec3(1.0, 0.97, 0.9) * sunDisk;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export type GroundMat = THREE.ShaderMaterial & {
  uniforms: {
    uCenter: { value: THREE.Vector3 };
    uEast: { value: THREE.Vector3 };
    uNorth: { value: THREE.Vector3 };
    uCamPos: { value: THREE.Vector3 };
    uFeet: { value: THREE.Vector3 };
    uRadius: { value: number };
    uSunDir: { value: THREE.Vector3 };
    uSoilA: { value: THREE.Color };
    uSoilB: { value: THREE.Color };
    uSoilC: { value: THREE.Color };
    uPebble: { value: THREE.Color };
    uFog: { value: THREE.Color };
    uSunColor: { value: THREE.Color };
    uAmb: { value: THREE.Color };
  };
};

export function createGroundMaterial(): GroundMat {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uCenter: { value: new THREE.Vector3(0, WORLD_RADIUS, 0) },
      uEast: { value: new THREE.Vector3(1, 0, 0) },
      uNorth: { value: new THREE.Vector3(0, 0, -1) },
      uCamPos: { value: new THREE.Vector3() },
      uFeet: { value: new THREE.Vector3(0, WORLD_RADIUS, 0) },
      uRadius: { value: WORLD_RADIUS },
      uSunDir: { value: SUN_DIR.clone() },
      uSoilA: { value: new THREE.Color("#3a2618") },
      uSoilB: { value: new THREE.Color("#8d5a34") },
      uSoilC: { value: new THREE.Color("#c6a36e") },
      uPebble: { value: new THREE.Color("#6d6458") },
      uFog: { value: new THREE.Color("#f0d7b4") },
      uSunColor: { value: new THREE.Color("#fff1d4") },
      uAmb: { value: new THREE.Color("#b7a48c") },
    },
    vertexShader: GROUND_VERT,
    fragmentShader: NOISE + GROUND_FRAG,
  });
  return mat as GroundMat;
}

export function createSkyMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uCamPos: { value: new THREE.Vector3() },
      uSunDir: { value: SUN_DIR.clone() },
      uTop: { value: new THREE.Color("#163e78") },
      uMid: { value: new THREE.Color("#7eb6d6") },
      uHaze: { value: new THREE.Color("#f0d7b4") },
      uGlow: { value: new THREE.Color("#f2c48a") },
      uTime: { value: 0 },
    },
    vertexShader: SKY_VERT,
    fragmentShader: NOISE + SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
  });
}

export function createGroundGeometry() {
  const segs = 200;
  const extent = 320;
  const n = segs + 1;
  const positions = new Float32Array(n * n * 3);
  let p = 0;
  for (let y = 0; y < n; y++) {
    const ty = (y / segs) * 2 - 1;
    for (let x = 0; x < n; x++) {
      const tx = (x / segs) * 2 - 1;
      positions[p++] = tx * extent;
      positions[p++] = ty * extent;
      positions[p++] = 0;
    }
  }
  const indices = new Uint32Array(segs * segs * 6);
  let i = 0;
  for (let y = 0; y < segs; y++) {
    for (let x = 0; x < segs; x++) {
      const a = y * n + x;
      const b = a + 1;
      const c = a + n;
      const d = c + 1;
      indices[i++] = a;
      indices[i++] = b;
      indices[i++] = c;
      indices[i++] = b;
      indices[i++] = d;
      indices[i++] = c;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  return geo;
}
