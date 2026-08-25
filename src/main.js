// SoleSpace — a virtual sneaker shop you can walk around in.
// Entry point: renderer, scene assembly, camera rig, interactions, UI, loop.

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildShop, VIEWPOINTS } from './shop.js';
import { CameraRig } from './cameraRig.js';
import { Interactions } from './interactions.js';
import { UI } from './ui.js';

const canvas = document.getElementById('scene');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0d12);
scene.fog = new THREE.FogExp2(0x0b0d12, 0.016);

// Soft studio reflections for the glossy floor and pedestals
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.25;

const camera = new THREE.PerspectiveCamera(
  62, window.innerWidth / window.innerHeight, 0.1, 120
);

const shop = buildShop(scene, camera);
const rig = new CameraRig(camera, canvas);

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
