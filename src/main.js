// SoleSpace — a virtual sneaker shop you walk through in third person.
// Entry point: renderer, scene assembly, player + chase camera, UI, loop.

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildShop, VIEWPOINTS, viewpointForSlot } from './shop.js';
import { TENANTS } from './concourse.js';
import { loadSpaceCatalogue, CATEGORIES, HIGHLIGHT, SPACE, getProduct } from './products.js';
import { fetchSpaces } from './api.js';
import { loadCharacterGLBs, createRig } from './rig.js';
import { Player } from './player.js';
import { spawnVisitors } from './visitors.js';
import { ThirdPersonCamera } from './cameraRig.js';
import { Interactions } from './interactions.js';
import { UI } from './ui.js';
import { ShopperAI } from './shopperAI.js';

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
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

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

/* ---------------- catalogue ----------------
 * The room cannot be built until we know what is in it, so the catalogue
 * for THIS space is fetched first. Only one space is ever held in memory. */

const spaceSlug = new URLSearchParams(location.search).get('space') || 'solespace';

// The mall directory is fetched up front, not lazily: the plaza plaques are
// built during buildShop() and need to know which tenants are actually open.
let directory = [];

try {
  const [, dir] = await Promise.all([
    loadSpaceCatalogue(spaceSlug),
    fetchSpaces().catch((e) => {
      console.warn('[metamart] tenant directory unavailable:', e.message);
      return [];
    }),
  ]);
  directory = dir;
} catch (err) {
  console.error('[metamart] could not load the catalogue:', err);
  document.getElementById('loader').innerHTML =
    `<div class="loader-inner"><div class="loader-logo">META<span>MART</span></div>
     <p style="color:#8b93a7;max-width:420px;line-height:1.6">
       Could not reach the shop server.<br>Start it with <code>npm run server</code>
       and reload.<br><br><span style="font-size:12px">${err.message}</span></p></div>`;
  throw err;
}

applySpaceBranding();
buildZoneNav();

const shop = buildShop(scene, camera, directory, SPACE);
const chaseCam = new ThirdPersonCamera(camera, canvas);

let player = null;
let visitors = null;

function goTo(zone) {
  const cat = CATEGORIES.find((c) => c.id === zone);
  const vp = cat ? viewpointForSlot(cat.slot) : VIEWPOINTS[zone] ?? VIEWPOINTS.entrance;
  if (player) player.setDestination(vp.pos);
  chaseCam.faceDirection(vp.look.clone().sub(vp.pos));
}

/** Wear the current store's name and colour, not SoleSpace's. */
function applySpaceBranding() {
  document.title = `${SPACE.name} — METAMART`;

  const brand = document.querySelector('.brand');
  if (brand) {
    // Split the name so the second half picks up the accent, the way the
    // SOLE/SPACE lockup does.
    const words = SPACE.name.trim().split(/\s+/);
    const head = words.length > 1 ? words.slice(0, -1).join(' ') : SPACE.name.slice(0, Math.ceil(SPACE.name.length / 2));
    const tail = words.length > 1 ? words[words.length - 1] : SPACE.name.slice(Math.ceil(SPACE.name.length / 2));
    brand.innerHTML = words.length > 1 ? `${head} <span>${tail}</span>` : `${head}<span>${tail}</span>`;
    brand.title = SPACE.tagline || SPACE.name;
  }

  document.documentElement.style.setProperty('--accent', SPACE.accent);

  const hint = document.getElementById('controls-hint');
  if (hint) {
    hint.innerHTML =
      '⌨ WASD walk · ⇧ run&nbsp;·&nbsp;🖱 drag orbit · wheel zoom&nbsp;·&nbsp;🛍 click a product';
  }
}

/** The bottom nav is built from whatever categories this space actually has. */
function buildZoneNav() {
  const nav = document.getElementById('zone-nav');
  if (!nav) return;
  const buttons = [
    `<button data-zone="entrance" class="active" title="Entrance">⌂</button>`,
    ...CATEGORIES.map((c) => `<button data-zone="${c.id}">${c.name}</button>`),
  ];
  if (HIGHLIGHT) {
    buttons.push(
      `<button data-zone="sale" class="sale-btn" style="--hl:${HIGHLIGHT.accent}">${HIGHLIGHT.title}</button>`
    );
  }
  buttons.push(`<button data-zone="concourse">Concourse ↗</button>`);
  nav.innerHTML = buttons.join('');
}

const ui = new UI({
  onNavigate: (zone) => {
    ui.closeModal();
    goTo(zone);
  },
});

/* ---------------- shopper AI ----------------
 * Search bar, photo search and the try-on preview. Clicking a result walks
 * the player over to that pedestal before opening the card. */

const shopperAI = new ShopperAI({
  space: spaceSlug,
  ui,
  onWalkTo: (productId) => {
    const view = shop.productViews.get(productId);
    if (!view || !player) return;
    const spot = new THREE.Vector3();
    view.group.getWorldPosition(spot);
    // stop a step short of the pedestal so the card stays in view
    const toPlayer = new THREE.Vector3().subVectors(player.root.position, spot).setY(0);
    if (toPlayer.lengthSq() < 1e-4) toPlayer.set(0, 0, 1);
    spot.addScaledVector(toPlayer.normalize(), 1.9);
    player.setDestination(spot);
    shopperAI.closePanel();
  },
  // A search hit that lives in another store: travel there and open it on
  // arrival, so the result is one click away wherever you searched from.
  onVisitSpace: (slug, productSlug, storeName) => {
    ui.toast(`${storeName ?? 'Store'} — taking you there…`);
    enterSpace(slug, productSlug);
  },
});

// Reset the try-on panel whenever a different product card is opened.
const openProduct = ui.openProduct.bind(ui);
ui.openProduct = (id) => {
  openProduct(id);
  shopperAI.resetTryOn();
};

const interactions = new Interactions(camera, canvas, shop.interactables, {
  onProduct: (id) => ui.openProduct(id),
  onSign: (zone) => {
    ui.setActiveZone(zone);
    goTo(zone);
  },
  onFloor: (point) => player?.setDestination(point),
  onTenant: (id) => enterSpace(id),
});

/* ---------------- moving between spaces ----------------
 * Every store occupies the same footprint, so only one can exist at a time.
 * Entering a bay swaps the whole space: the current one is torn down and the
 * next one is fetched and built. There is no door to open - you walk into the
 * bay and you are there. */

let entering = false;

function enterSpace(slug, openProductSlug = null) {
  if (entering) return;
  const entry = directory.find((s) => s.slug === slug);
  const tenant = TENANTS.find((t) => t.id === slug);
  const name = entry?.name || tenant?.name || 'This store';

  if (!entry || entry.status !== 'live') {
    ui.toast(`${name} — leasing now, opening soon on METAMART 🏗️`);
    return;
  }

  entering = true;
  hideEnterPrompt();

  // Wipe in the store's own colour, then reload. The reload is deliberate:
  // it guarantees the previous space's meshes, textures and NPCs are gone
  // rather than lingering in GPU memory.
  const wipe = document.getElementById('transition');
  wipe.style.setProperty('--tr', entry.accent_color || '#00e5ff');
  wipe.classList.add('on');
  setTimeout(() => {
    const q = new URLSearchParams({ space: slug });
    if (openProductSlug) q.set('product', openProductSlug);
    location.search = `?${q}`;
  }, 430);
}

/* ---------------- walking into a shopfront ----------------
 * Clicking a sign high on the drum wall was never discoverable. Standing in
 * a doorway is: get close and the store names itself, step in and you are
 * through. */

const PROMPT_RADIUS = 5.0;
const ENTER_RADIUS = 1.75;

const promptEl = document.getElementById('enter-prompt');
let promptedId = null;

function hideEnterPrompt() {
  promptEl?.classList.add('hidden');
  promptedId = null;
}

function showEnterPrompt(entry, open) {
  if (promptedId === entry.id) return;
  promptedId = entry.id;
  promptEl.style.setProperty('--ep', entry.accent);
  promptEl.querySelector('.ep-name').textContent = entry.name;
  promptEl.querySelector('.ep-hint').textContent = open
    ? 'Walk in to enter'
    : 'Opening soon';
  promptEl.classList.toggle('closed', !open);
  promptEl.classList.remove('hidden');
}

function updateDoorways() {
  if (!player || entering || !shop.entries?.length) return;
  const p = player.root.position;

  let nearest = null;
  let nearestD = Infinity;
  for (const e of shop.entries) {
    const d = Math.hypot(e.position.x - p.x, e.position.z - p.z);
    if (d < nearestD) {
      nearestD = d;
      nearest = e;
    }
  }
  if (!nearest || nearestD > PROMPT_RADIUS) {
    if (promptedId) hideEnterPrompt();
    return;
  }

  const open = nearest.status === 'open';
  showEnterPrompt(nearest, open);
  if (open && nearestD < ENTER_RADIUS) enterSpace(nearest.id);
}
interactions.setClickGuard(() => chaseCam.wasClick() && !ui.modalOpen);

/* ---------------- characters ---------------- */

loadCharacterGLBs(['Knight', 'Barbarian', 'Rogue'])
  .then((gltfs) => {
    player = new Player(createRig(gltfs[2]), scene); // you play the Rogue
    visitors = spawnVisitors(gltfs, scene, shop.browsePoints, shop.colliders, 8);
    document.getElementById('loader').classList.add('fade');
    // dev-only handle: lets the scene be driven from the console / a
    // headless browser without shipping anything to production
    if (import.meta.env.DEV) {
      window.__solespace = { scene, camera, shop, ui, player, visitors, cam: chaseCam };
    }
    const wanted = new URLSearchParams(location.search).get('product');
    if (wanted) {
      // Arrived here from a search hit in another store - go straight to it.
      setTimeout(() => {
        if (!getProduct(wanted)) {
          ui.toast('That product is no longer on display here');
          return;
        }
        shopperAI.walkToProduct(wanted);
        ui.openProduct(wanted);
      }, 900);
    } else {
      setTimeout(
        () => ui.toast(`Welcome to ${SPACE.name} — WASD to walk, drag to orbit, click a product 👟`),
        1600
      );
    }
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
      updateDoorways();
    }
    chaseCam.update(dt, player.root.position);

    // the sun's small shadow box tracks the player — crisp shadows
    // exactly where the camera is, at no extra cost
    const pp = player.root.position;
    shop.sun.position.set(pp.x + 6, 16, pp.z - 22);
    shop.sun.target.position.set(pp.x, 0, pp.z);
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
