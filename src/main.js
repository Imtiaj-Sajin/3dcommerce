// SoleSpace — a virtual sneaker shop you can walk around in.
// Entry point: renderer, scene assembly, camera rig, interactions, UI, loop.

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildShop, VIEWPOINTS } from './shop.js';
import { spawnVisitors } from './visitors.js';
import { CameraRig } from './cameraRig.js';
import { Interactions } from './interactions.js';
import { UI } from './ui.js';

const canvas = document.getElementById('scene');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1c20);

// Soft studio reflections for the glossy floor and pedestals
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.3;

const camera = new THREE.PerspectiveCamera(
  62, window.innerWidth / window.innerHeight, 0.1, 120
);

const shop = buildShop(scene, camera);
const rig = new CameraRig(camera, canvas);

// animated visitors browsing the shop (KayKit CC0 characters)
const visitors = spawnVisitors(scene, shop.browsePoints, 7);
visitors.ready.catch((err) => console.error('Could not load visitor models:', err));

const ui = new UI({
  onNavigate: (zone) => {
    ui.closeModal();
    rig.navigateTo(VIEWPOINTS[zone] ?? VIEWPOINTS.entrance);
  },
  productViews: shop.productViews,
});

const interactions = new Interactions(camera, canvas, shop.interactables, {
  onProduct: (id) => ui.openProduct(id),
  onSign: (zone) => {
    ui.setActiveZone(zone);
    rig.navigateTo(VIEWPOINTS[zone]);
  },
  onFloor: (point) => rig.walkTo(point),
});
interactions.setClickGuard(() => rig.wasClick() && !ui.modalOpen);

/* ---------------- intro ---------------- */

// Start high above the entrance, then glide down to eye level.
rig.teleport(new THREE.Vector3(0, 7.6, 21), new THREE.Vector3(0, 1.2, 0));
setTimeout(() => rig.navigateTo(VIEWPOINTS.entrance), 700);
setTimeout(
  () => ui.toast('Welcome to SoleSpace — drag to look around, WASD to walk 👟'),
  2400
);

/* ---------------- loop ---------------- */

const clock = new THREE.Clock();
let frames = 0;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  if (!ui.modalOpen) {
    rig.update(dt);
    interactions.update(dt);
  }
  shop.update(t, dt);
  visitors.update(dt);
  renderer.render(scene, camera);

  if (++frames === 3) {
    document.getElementById('loader').classList.add('fade');
  }
}
animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
