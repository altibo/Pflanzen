import * as THREE from "three";

export type WalkerRig = {
  root: THREE.Group;
  pose: (phase: number, amp: number) => void;
};

function mat(color: number, roughness: number) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
}

export function createWalker(coat: number, hat: number): WalkerRig {
  const skin = mat(0xd9a47a, 0.58);
  const cloth = mat(coat, 0.78);
  const shirt = mat(0xf4efe4, 0.82);
  const pants = mat(0x322c28, 0.86);
  const leather = mat(0x241c18, 0.7);
  const hatMat = mat(hat, 0.74);

  const model = new THREE.Group();

  const legL = limb(pants, leather, -1);
  const legR = limb(pants, leather, 1);
  model.add(legL.pivot, legR.pivot);

  const torso = new THREE.Group();
  torso.position.y = 0.9;

  const coatMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.28, 4, 12), cloth);
  coatMesh.position.y = 0.22;
  coatMesh.scale.set(1.12, 0.96, 1.2);

  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.08, 10), shirt);
  collar.position.y = 0.46;

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.125, 16, 14), skin);
  head.position.y = 0.62;
  head.scale.set(1, 1.08, 0.96);

  const eyeGeo = new THREE.SphereGeometry(0.016, 8, 8);
  const eyeMat = mat(0x241910, 0.4);
  const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
  const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
  eyeL.position.set(-0.04, 0.64, 0.1);
  eyeR.position.set(0.04, 0.64, 0.1);

  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 8), skin);
  nose.position.set(0, 0.6, 0.12);

  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.018, 18), leather);
  brim.position.y = 0.72;
  const crown = new THREE.Mesh(new THREE.CapsuleGeometry(0.105, 0.06, 3, 12), hatMat);
  crown.position.y = 0.79;

  const satchel = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.16, 0.05), leather);
  satchel.position.set(0.18, 0.12, 0.04);
  satchel.rotation.z = -0.12;

  const armL = arm(cloth, skin, -1);
  const armR = arm(cloth, skin, 1);

  torso.add(coatMesh, collar, head, eyeL, eyeR, nose, brim, crown, satchel, armL, armR);
  model.add(torso);

  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  model.position.y -= box.min.y;

  const root = new THREE.Group();
  root.add(model);

  return {
    root,
    pose(phase: number, amp: number) {
      const s = Math.sin(phase);
      const lift = Math.max(0, s);
      legL.pivot.rotation.x = s * 0.72 * amp;
      legR.pivot.rotation.x = -s * 0.72 * amp;
      legL.knee.rotation.x = lift * 0.9 * amp;
      legR.knee.rotation.x = Math.max(0, -s) * 0.9 * amp;
      armL.rotation.x = -s * 0.55 * amp;
      armR.rotation.x = s * 0.55 * amp;
      torso.position.y = 0.9 + Math.abs(s) * 0.028 * amp;
      torso.rotation.y = s * 0.04 * amp;
    },
  };
}

function limb(pants: THREE.Material, leather: THREE.Material, side: number) {
  const pivot = new THREE.Group();
  pivot.position.set(side * 0.1, 0.9, 0);
  const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.28, 3, 8), pants);
  thigh.position.y = -0.2;
  const knee = new THREE.Group();
  knee.position.y = -0.38;
  const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.26, 3, 8), pants);
  shin.position.y = -0.18;
  const boot = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.08, 2, 8), leather);
  boot.position.set(0, -0.36, 0.02);
  boot.scale.set(1.15, 1, 1.45);
  knee.add(shin, boot);
  pivot.add(thigh, knee);
  return { pivot, knee };
}

function arm(cloth: THREE.Material, skin: THREE.Material, side: number) {
  const pivot = new THREE.Group();
  pivot.position.set(side * 0.25, 0.36, 0);
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.042, 0.3, 3, 8), cloth);
  mesh.position.y = -0.2;
  const hand = new THREE.Mesh(new THREE.SphereGeometry(0.042, 8, 8), skin);
  hand.position.y = -0.38;
  pivot.add(mesh, hand);
  return pivot;
}
