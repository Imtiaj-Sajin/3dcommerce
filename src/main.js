// SoleSpace — a virtual sneaker shop you walk through in third person.
// Entry point: renderer, scene assembly, player + chase camera, UI, loop.

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildShop, VIEWPOINTS } from './shop.js';
import { loadCharacterGLBs, createRig } from './rig.js';
import { Player } from './player.js';
import { spawnVisitors } from './visitors.js';
import { ThirdPersonCamera } from './cameraRig.js';
import { Interactions } from './interactions.js';
import { UI } from './ui.js';

const canvas = document.getElementById('scene');

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1c20);

// Soft studio reflections for the glossy floor and pedestals
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.3;

const camera = new THREE.PerspectiveCamera(
  60, window.innerWidth / window.innerHeight, 0.1, 160
);
camera.layers.enable(1); // characters live on layer 1 (skipped by the mirror)

const shop = buildShop(scene, camera);
const chaseCam = new ThirdPersonCamera(camera, canvas);

let player = null;
let visitors = null;

function goTo(zone) {
  const vp = VIEWPOINTS[zone] ?? VIEWPOINTS.entrance;
  if (player) player.setDestination(vp.pos);
  chaseCam.faceDirection(vp.look.clone().sub(vp.pos));
}

const ui = new UI({
  onNavigate: (zone) => {
    ui.closeModal();
    goTo(zone);
  },
});

const interactions = new Interactions(camera, canvas, shop.interactables, {
  onProduct: (id) => ui.openProduct(id),
  onSign: (zone) => {
    ui.setActiveZone(zone);
    goTo(zone);
  },
  onFloor: (point) => player?.setDestination(point),
});
interactions.setClickGuard(() => chaseCam.wasClick() && !ui.modalOpen);

/* ---------------- characters ---------------- */

loadCharacterGLBs(['Knight', 'Barbarian', 'Rogue'])
  .then((gltfs) => {
    player = new Player(createRig(gltfs[2]), scene); // you play the Rogue
    visitors = spawnVisitors(gltfs, scene, shop.browsePoints, shop.colliders, 8);
    document.getElementById('loader').classList.add('fade');
    setTimeout(
      () => ui.toast('Welcome to SoleSpace — WASD to walk, drag to orbit, click a sneaker 👟'),
      1600
    );
  })
  .catch((err) => {
    console.error('Could not load character models:', err);
    document.getElementById('loader').classList.add('fade');
  });

/* ---------------- adaptive quality ----------------
 * If a machine can't hold the frame rate, step down gracefully:
 *   level 1 → lower render resolution
 *   level 2 → minimum resolution + turn the mirror floor off
 * The shop looks nearly identical; the frame rate is what customers feel. */

let qualityLevel = 0;
let perfAcc = 0;
let perfFrames = 0;

function applyQuality(level) {
  qualityLevel = level;
  const dprCap = level === 0 ? 1.5 : level === 1 ? 1.15 : 1.0;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, dprCap));
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (level >= 2) {
    shop.quality.mirror.visible = false;
    for (const m of shop.quality.tileMaterials) {
      m.opacity = 1;
      m.transparent = false;
      m.needsUpdate = true;
    }
  }
  console.info(`[SoleSpace] performance mode ${level}`);
}

/* ---------------- loop ---------------- */

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  // measure fps in ~1.5s windows (skip the warm-up while things compile/load)
  if (t > 6 && qualityLevel < 2) {
    perfAcc += dt;
    if (++perfFrames >= 90) {
      const fps = perfFrames / perfAcc;
      perfAcc = 0;
      perfFrames = 0;
      if (fps < 40) applyQuality(qualityLevel + 1);
    }
  }

  if (player) {
    if (ui.modalOpen) {
      player.keys.clear(); // don't keep walking behind the modal
    } else {
      player.update(dt, chaseCam.yaw, shop.colliders);
      interactions.update(dt);
      // camera swings in behind the character on its own while walking
      if (player.isMoving) chaseCam.followBehind(player.heading, dt);
    }
    chaseCam.update(dt, player.root.position);
  } else {
    chaseCam.update(dt, new THREE.Vector3(0, 0, 12.2));
  }

  shop.update(t, dt);
  visitors?.update(dt);
  renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
