// Animated shop visitors — KayKit CC0 characters (same models as the 3dWeb
// project) that wander the hall, stop to browse sneakers, and carry floating
// name tags like players in a multiplayer lobby.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { HALL } from './shop.js';

const CHARACTER_HEIGHT = 1.5;
const WEAPON_RE = /sword|dagger|knife|axe|crossbow|shield|arrow|quiver|staff|wand|bow|spellbook|mug|throwable/i;
const MODELS = ['Knight', 'Barbarian', 'Rogue'];
const NAMES = ['SoleHunter', 'Kicks4Life', 'Mimi', 'AirWalker_7', 'RetroRae', 'HypeKnight', 'LaceLord'];

// roaming region (stays clear of the pedestal rows and the island)
const ROAM = { x: 16, zMin: -8.5, zMax: 12.4 };
const ISLAND_R = 5.0;

function damp(k, dt) {
  return 1 - Math.exp(-k * dt);
}

function angleLerp(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function nameTagSprite(name) {
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
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 3;
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
  sprite.scale.set(1.7, 0.42, 1);
  sprite.position.y = 1.95;
  return sprite;
}

function createRig(gltf) {
  const model = SkeletonUtils.clone(gltf.scene);
  model.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.frustumCulled = false; // skinned meshes pop with default culling
      const src = o.material;
      o.material = new THREE.MeshLambertMaterial({
        map: src.map ?? null,
        color: src.color ? src.color.clone() : new THREE.Color('#ffffff'),
      });
    }
    if (WEAPON_RE.test(o.name)) o.visible = false; // no weapons in the shop :)
  });

  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const scale = CHARACTER_HEIGHT / Math.max(size.y, 0.001);

  const root = new THREE.Group();
  model.scale.setScalar(scale);
  model.position.y = -box.min.y * scale;
  root.add(model);

  const mixer = new THREE.AnimationMixer(model);
  const actions = {};
  for (const clip of gltf.animations) actions[clip.name] = mixer.clipAction(clip);
  return { root, mixer, actions };
}

class Visitor {
  constructor(rig, name, browsePoints, seed) {
    this.root = rig.root;
    this.mixer = rig.mixer;
    this.actions = rig.actions;
    this.current = null;
    this.browsePoints = browsePoints;
    this.speed = 1.15 + (seed % 5) * 0.12;
    this.walkClip = seed % 2 === 0 ? 'Walking_A' : 'Walking_B';
    this.heading = Math.random() * Math.PI * 2;
    this.state = 'idle';
    this.timer = 1 + (seed % 4);
    this.target = new THREE.Vector3();
    this.lookAtPoint = null;

    // spawn somewhere in the roaming area, off the island
    let x = 0, z = 8;
    do {
      x = (Math.random() - 0.5) * 2 * ROAM.x;
      z = ROAM.zMin + Math.random() * (ROAM.zMax - ROAM.zMin);
    } while (Math.hypot(x, z) < ISLAND_R + 0.5);
    this.root.position.set(x, 0, z);
    this.root.rotation.y = this.heading;

    this.play('Idle', 0);
    if (this.actions.Idle) this.actions.Idle.time = seed * 0.7; // desync clones
  }

  play(name, fade = 0.25) {
    if (this.current === name || !this.actions[name]) return;
    const next = this.actions[name];
    next.reset().fadeIn(fade).play();
    if (this.current && this.actions[this.current]) this.actions[this.current].fadeOut(fade);
    this.current = name;
  }

  pickTarget() {
    if (this.browsePoints.length && Math.random() < 0.6) {
      const bp = this.browsePoints[Math.floor(Math.random() * this.browsePoints.length)];
      this.target.copy(bp.pos);
      this.lookAtPoint = bp.look;
    } else {
      this.lookAtPoint = null;
      do {
        this.target.set(
          (Math.random() - 0.5) * 2 * ROAM.x,
          0,
          ROAM.zMin + Math.random() * (ROAM.zMax - ROAM.zMin)
        );
      } while (Math.hypot(this.target.x, this.target.z) < ISLAND_R + 0.4);
    }
  }

  update(dt, others) {
    const p = this.root.position;

    if (this.state === 'idle') {
      this.timer -= dt;
      this.play('Idle', 0.35);
      // face the product they're browsing
      if (this.lookAtPoint) {
        const want = Math.atan2(this.lookAtPoint.x - p.x, this.lookAtPoint.z - p.z);
        this.heading = angleLerp(this.heading, want, damp(5, dt));
        this.root.rotation.y = this.heading;
      }
      if (this.timer <= 0) {
        this.pickTarget();
        this.state = 'walk';
      }
    } else {
      const dx = this.target.x - p.x;
      const dz = this.target.z - p.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.3) {
        this.state = 'idle';
        this.timer = 2.5 + Math.random() * 5;
      } else {
        let want = Math.atan2(dx, dz);
        // steer around the limited-drops island
        const aheadX = p.x + Math.sin(want) * 1.2;
        const aheadZ = p.z + Math.cos(want) * 1.2;
        if (Math.hypot(aheadX, aheadZ) < ISLAND_R) {
          const tangent = Math.atan2(p.x, p.z) + Math.PI / 2;
          want = angleLerp(want, tangent, 0.6);
        }
        this.heading = angleLerp(this.heading, want, damp(4.5, dt));
        this.root.rotation.y = this.heading;
        p.x += Math.sin(this.heading) * this.speed * dt;
        p.z += Math.cos(this.heading) * this.speed * dt;
        this.play(this.walkClip);
      }
    }

    // gentle separation so visitors don't merge into one body
    for (const o of others) {
      if (o === this) continue;
      const dx = p.x - o.root.position.x;
      const dz = p.z - o.root.position.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < 0.81 && d2 > 1e-5) {
        const d = Math.sqrt(d2);
        p.x += (dx / d) * (0.9 - d) * 0.5;
        p.z += (dz / d) * (0.9 - d) * 0.5;
      }
    }
    // hard bounds
    p.x = THREE.MathUtils.clamp(p.x, -HALL.w / 2 + 2, HALL.w / 2 - 2);
    p.z = THREE.MathUtils.clamp(p.z, -HALL.d / 2 + 2, HALL.d / 2 - 1.8);

    this.mixer.update(dt);
  }
}

/**
 * Loads the character GLBs and spawns wandering visitors.
 * Returns { ready: Promise, update(dt) }.
 */
export function spawnVisitors(scene, browsePoints, count = 7) {
  const visitors = [];
  const loader = new GLTFLoader();
  const base = import.meta.env.BASE_URL;

  const ready = Promise.all(
    MODELS.map(
      (name) =>
        new Promise((resolve, reject) => {
          loader.load(`${base}models/${name}.glb`, resolve, undefined, reject);
        })
    )
  ).then((gltfs) => {
    for (let i = 0; i < count; i++) {
      const rig = createRig(gltfs[i % gltfs.length]);
      const v = new Visitor(rig, NAMES[i % NAMES.length], browsePoints, i);
      rig.root.add(nameTagSprite(NAMES[i % NAMES.length]));
      scene.add(rig.root);
      visitors.push(v);
    }
  });

  return {
    ready,
    update(dt) {
      for (const v of visitors) v.update(dt, visitors);
    },
  };
}
