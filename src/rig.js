// Shared character utilities: GLB loading, rig creation (KayKit CC0
// models), name tag sprites, and small math helpers used by the player
// and the NPC visitors.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const CHARACTER_HEIGHT = 1.5;
const WEAPON_RE = /sword|dagger|knife|axe|crossbow|shield|arrow|quiver|staff|wand|bow|spellbook|mug|throwable/i;

export function damp(k, dt) {
  return 1 - Math.exp(-k * dt);
}

export function angleLerp(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export function loadCharacterGLBs(names) {
  const loader = new GLTFLoader();
  const base = import.meta.env.BASE_URL;
  return Promise.all(
    names.map(
      (name) =>
        new Promise((resolve, reject) => {
          loader.load(`${base}models/${name}.glb`, resolve, undefined, reject);
        })
    )
  );
}

/** Clone + normalize a loaded gltf into a placeable, animatable rig.
 *  Characters live on layer 1: the main camera and the sun's shadow pass
 *  render it, but the mirror floor does not — skinned meshes are by far
 *  the most expensive thing to draw twice. */
export function createRig(gltf) {
  const model = SkeletonUtils.clone(gltf.scene);
  model.traverse((o) => {
    o.layers.set(1);
    if (o.isMesh) {
      o.castShadow = true;
      // cull normally, with an inflated bounds so animation never pops
      o.geometry.computeBoundingSphere();
      o.geometry.boundingSphere.radius *= 4;
      const src = o.material;
      o.material = new THREE.MeshLambertMaterial({
        map: src.map ?? null,
        color: src.color ? src.color.clone() : new THREE.Color('#ffffff'),
      });
    }
    if (WEAPON_RE.test(o.name)) o.visible = false; // no weapons in the shop
  });

  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const scale = CHARACTER_HEIGHT / Math.max(size.y, 0.001);

  const root = new THREE.Group();
  root.layers.set(1);
  model.scale.setScalar(scale);
  model.position.y = -box.min.y * scale;
  root.add(model);

  const mixer = new THREE.AnimationMixer(model);
  const actions = {};
  for (const clip of gltf.animations) actions[clip.name] = mixer.clipAction(clip);
  return { root, mixer, actions };
}

export function nameTagSprite(name, accent = 'rgba(255,255,255,0.25)') {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const ctx = c.getContext('2d');
  ctx.font = '700 52px "Segoe UI", sans-serif';
  const tw = ctx.measureText(name).width;
  const w = tw + 70;
  ctx.fillStyle = 'rgba(10,12,18,0.72)';
  ctx.beginPath();
  ctx.roundRect((512 - w) / 2, 24, w, 80, 40);
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.fillStyle = '#f2f5fa';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, 256, 66);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false })
  );
  sprite.layers.set(1); // tags skip the mirror pass too
  sprite.scale.set(1.7, 0.42, 1);
  sprite.position.y = 1.95;
  return sprite;
}

/** Circle-collider pushout shared by player + visitors. */
export function resolveCollisions(pos, colliders, radius = 0.35) {
  for (const c of colliders) {
    const dx = pos.x - c.x;
    const dz = pos.z - c.z;
    const d2 = dx * dx + dz * dz;
    const min = c.r + radius;
    if (d2 < min * min && d2 > 1e-6) {
      const d = Math.sqrt(d2);
      pos.x = c.x + (dx / d) * min;
      pos.z = c.z + (dz / d) * min;
    }
  }
}
