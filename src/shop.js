// Builds the exhibition hall: floor, walls, category zones, pedestals with
// product cards, neon signs, fake volumetric light cones and dust particles.

import * as THREE from 'three';
import { CATEGORIES, productsInCategory } from './products.js';
import { buildCardTexture, buildSignTexture } from './sneakerArt.js';

export const HALL = { w: 46, d: 30, h: 8 }; // x: ±23, z: ±15

const CARD_W = 1.4;
const CARD_H = CARD_W * (640 / 512);
const PED_H = 1.0;

/* ---------------- helper textures ---------------- */

function floorTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#10131a';
  ctx.fillRect(0, 0, 512, 512);
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 8; i++) {
    const p = i * 64;
    ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, 512); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(512, p); ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(10, 7);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function shadowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  g.addColorStop(0, 'rgba(0,0,0,0.55)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

/* ---------------- zone layout ---------------- */

// Pedestal transforms per category: position + facing rotation (Y).
function zoneSlots(catId, count) {
  const slots = [];
  if (catId === 'running') {
    const zs = [-8.25, -2.75, 2.75, 8.25];
    for (let i = 0; i < count; i++)
      slots.push({ pos: new THREE.Vector3(-19.5, 0, zs[i]), rotY: Math.PI / 2 });
  } else if (catId === 'lifestyle') {
    const zs = [8.25, 2.75, -2.75, -8.25];
    for (let i = 0; i < count; i++)
      slots.push({ pos: new THREE.Vector3(19.5, 0, zs[i]), rotY: -Math.PI / 2 });
  } else if (catId === 'basketball') {
    const xs = [-6, 0, 6];
    for (let i = 0; i < count; i++)
      slots.push({ pos: new THREE.Vector3(xs[i], 0, -11.5), rotY: 0 });
  } else {
    // limited — island slots are local to the rotating group
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.PI / 2;
      slots.push({
        pos: new THREE.Vector3(Math.cos(a) * 2.3, 0.18, Math.sin(a) * 2.3),
        rotY: -a + Math.PI / 2,
      });
    }
  }
  return slots;
}

export const VIEWPOINTS = {
  entrance:   { pos: new THREE.Vector3(0, 1.7, 13.2),  look: new THREE.Vector3(0, 1.6, 0) },
  running:    { pos: new THREE.Vector3(-13, 1.7, 0),   look: new THREE.Vector3(-20, 1.8, 0) },
  basketball: { pos: new THREE.Vector3(0, 1.7, -5),    look: new THREE.Vector3(0, 1.8, -12) },
  lifestyle:  { pos: new THREE.Vector3(13, 1.7, 0),    look: new THREE.Vector3(20, 1.8, 0) },
  limited:    { pos: new THREE.Vector3(0, 1.7, 7.2),   look: new THREE.Vector3(0, 1.7, 0) },
};

/* ---------------- main builder ---------------- */

export function buildShop(scene, camera) {
  const interactables = [];
  const productViews = new Map();
  const animated = []; // { group, baseY, baseRotY, phase }
  const pulsing = [];  // { material, base, amp, speed, phase }
  const shadowTex = shadowTexture();

  /* --- floor / walls / ceiling --- */
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(HALL.w, HALL.d),
    new THREE.MeshStandardMaterial({
      map: floorTexture(), color: 0xffffff,
      metalness: 0.55, roughness: 0.35,
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.userData = { type: 'floor' };
  scene.add(floor);
  interactables.push(floor);

  const wallMat = new THREE.MeshStandardMaterial({ color: 0x151922, roughness: 0.95 });
  const walls = [
    { size: [HALL.w, HALL.h], pos: [0, HALL.h / 2, -HALL.d / 2], rotY: 0 },
    { size: [HALL.w, HALL.h], pos: [0, HALL.h / 2, HALL.d / 2], rotY: Math.PI },
    { size: [HALL.d, HALL.h], pos: [-HALL.w / 2, HALL.h / 2, 0], rotY: Math.PI / 2 },
    { size: [HALL.d, HALL.h], pos: [HALL.w / 2, HALL.h / 2, 0], rotY: -Math.PI / 2 },
  ];
  for (const w of walls) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(...w.size), wallMat);
    m.position.set(...w.pos);
    m.rotation.y = w.rotY;
    scene.add(m);
  }
  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(HALL.w, HALL.d),
    new THREE.MeshStandardMaterial({ color: 0x0b0d12, roughness: 1 })
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = HALL.h;
  scene.add(ceiling);

  // Ceiling light strips
  const stripMat = new THREE.MeshBasicMaterial({ color: 0xbfd9ff, toneMapped: false });
  for (let i = -1.5; i <= 1.5; i++) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(14, 0.06, 0.35), stripMat);
    strip.position.set(i * 11, HALL.h - 0.04, 0);
    scene.add(strip);
  }

  /* --- lighting --- */
  scene.add(new THREE.HemisphereLight(0x99aaff, 0x1a1410, 0.5));
  scene.add(new THREE.AmbientLight(0x404860, 0.6));

  function zoneSpot(x, z, color) {
    const spot = new THREE.SpotLight(color, 320, 26, 0.55, 0.65, 1.7);
    spot.position.set(x, HALL.h - 0.4, z);
    spot.target.position.set(x, 0, z);
    scene.add(spot, spot.target);
    // fake volumetric cone
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(2.6, 6.4, 32, 1, true),
      new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.045,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      })
    );
    cone.position.set(x, HALL.h - 3.4, z);
    scene.add(cone);
  }

  /* --- brand sign on entrance wall (visible when you turn around) --- */
  const brandSign = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 2.5),
    new THREE.MeshBasicMaterial({
      map: buildSignTexture('SOLESPACE', '#00e5ff'),
      transparent: true, toneMapped: false,
    })
  );
  brandSign.position.set(0, 5.4, HALL.d / 2 - 0.1);
  brandSign.rotation.y = Math.PI;
  scene.add(brandSign);
  pulsing.push({ material: brandSign.material, base: 0.9, amp: 0.1, speed: 1.4, phase: 0 });

  /* --- pedestal + card factory --- */
  function addPedestal(product, slot, parent, accent) {
    const group = new THREE.Group();
    group.position.copy(slot.pos);
    group.rotation.y = slot.rotY;

    const pedMat = new THREE.MeshStandardMaterial({
      color: 0x1c202b, metalness: 0.7, roughness: 0.35,
    });
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.52, PED_H, 32), pedMat);
    ped.position.y = PED_H / 2;
    ped.userData = { type: 'product', productId: product.id };
    group.add(ped);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.46, 0.028, 12, 48),
      new THREE.MeshBasicMaterial({ color: accent, toneMapped: false, transparent: true })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = PED_H + 0.01;
    group.add(ring);
    pulsing.push({ material: ring.material, base: 0.75, amp: 0.25, speed: 2.1, phase: Math.random() * 6 });

    // contact shadow
    const sh = new THREE.Mesh(
      new THREE.PlaneGeometry(1.9, 1.9),
      new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false })
    );
    sh.rotation.x = -Math.PI / 2;
    sh.position.y = 0.012;
    group.add(sh);

    // floating product card
    const { texture, redraw } = buildCardTexture(product, accent);
    const card = new THREE.Mesh(
      new THREE.PlaneGeometry(CARD_W, CARD_H),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide })
    );
    const baseY = PED_H + CARD_H / 2 + 0.22;
    card.position.y = baseY;
    card.userData = { type: 'product', productId: product.id };
    group.add(card);

    parent.add(group);
    interactables.push(card, ped);
    animated.push({ group: card, baseY, baseRotY: 0, phase: Math.random() * 6.28 });
    productViews.set(product.id, { group, card, redraw });
  }

  /* --- wall zones --- */
  for (const cat of CATEGORIES) {
    const items = productsInCategory(cat.id);
    const slots = zoneSlots(cat.id, items.length);

    if (cat.wall !== 'center') {
      items.forEach((p, i) => addPedestal(p, slots[i], scene, cat.accent));

      // neon sign on the wall
      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(7, 1.75),
        new THREE.MeshBasicMaterial({
          map: buildSignTexture(cat.name.toUpperCase(), cat.accent),
          transparent: true, toneMapped: false,
        })
      );
      const off = 0.12;
      if (cat.wall === 'west') { sign.position.set(-HALL.w / 2 + off, 5.2, 0); sign.rotation.y = Math.PI / 2; }
      if (cat.wall === 'east') { sign.position.set(HALL.w / 2 - off, 5.2, 0); sign.rotation.y = -Math.PI / 2; }
      if (cat.wall === 'north') { sign.position.set(0, 5.2, -HALL.d / 2 + off); }
      sign.userData = { type: 'sign', zone: cat.id };
      scene.add(sign);
      interactables.push(sign);
      pulsing.push({ material: sign.material, base: 0.85, amp: 0.15, speed: 1.8, phase: Math.random() * 6 });

      // accent strips flanking the sign
      for (const side of [-4.6, 4.6]) {
        const strip = new THREE.Mesh(
          new THREE.BoxGeometry(0.09, 4.2, 0.09),
          new THREE.MeshBasicMaterial({ color: cat.accent, toneMapped: false, transparent: true })
        );
        if (cat.wall === 'west') strip.position.set(-HALL.w / 2 + 0.1, 4.4, side);
        if (cat.wall === 'east') strip.position.set(HALL.w / 2 - 0.1, 4.4, side);
        if (cat.wall === 'north') strip.position.set(side, 4.4, -HALL.d / 2 + 0.1);
        scene.add(strip);
        pulsing.push({ material: strip.material, base: 0.7, amp: 0.3, speed: 1.2, phase: Math.random() * 6 });
      }

      // zone spotlight over the middle of the row
      const mid = slots[Math.floor(slots.length / 2)].pos;
      zoneSpot(mid.x, mid.z, new THREE.Color(cat.accent));
    }
  }

  /* --- limited drops: rotating center island --- */
  const limited = CATEGORIES.find((c) => c.id === 'limited');
  const island = new THREE.Group();
  scene.add(island);

  const platform = new THREE.Mesh(
    new THREE.CylinderGeometry(3.5, 3.7, 0.18, 48),
    new THREE.MeshStandardMaterial({ color: 0x181c26, metalness: 0.7, roughness: 0.3 })
  );
  platform.position.y = 0.09;
  island.add(platform);

  const islandRing = new THREE.Mesh(
    new THREE.TorusGeometry(3.55, 0.045, 12, 72),
    new THREE.MeshBasicMaterial({ color: limited.accent, toneMapped: false, transparent: true })
  );
  islandRing.rotation.x = Math.PI / 2;
  islandRing.position.y = 0.19;
  island.add(islandRing);
  pulsing.push({ material: islandRing.material, base: 0.8, amp: 0.2, speed: 1.5, phase: 1 });

  const limItems = productsInCategory('limited');
  const limSlots = zoneSlots('limited', limItems.length);
  limItems.forEach((p, i) => addPedestal(p, limSlots[i], island, limited.accent));

  // floating billboard above the island (always faces the camera)
  const limSign = new THREE.Mesh(
    new THREE.PlaneGeometry(6, 1.5),
    new THREE.MeshBasicMaterial({
      map: buildSignTexture('LIMITED DROPS', limited.accent),
      transparent: true, toneMapped: false,
    })
  );
  limSign.position.set(0, 4.9, 0);
  limSign.userData = { type: 'sign', zone: 'limited' };
  scene.add(limSign);
  interactables.push(limSign);
  pulsing.push({ material: limSign.material, base: 0.85, amp: 0.15, speed: 2.2, phase: 2 });

  zoneSpot(0, 0, new THREE.Color(limited.accent));

  /* --- dust particles --- */
  const P_COUNT = 320;
  const pGeo = new THREE.BufferGeometry();
  const pPos = new Float32Array(P_COUNT * 3);
  for (let i = 0; i < P_COUNT; i++) {
    pPos[i * 3] = (Math.random() - 0.5) * HALL.w * 0.9;
    pPos[i * 3 + 1] = Math.random() * (HALL.h - 1) + 0.4;
    pPos[i * 3 + 2] = (Math.random() - 0.5) * HALL.d * 0.9;
  }
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  const particles = new THREE.Points(
    pGeo,
    new THREE.PointsMaterial({
      color: 0x7fb8ff, size: 0.035, transparent: true, opacity: 0.45,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    })
  );
  scene.add(particles);

  /* --- per-frame animation --- */
  function update(t, dt) {
    // floating cards
    for (const a of animated) {
      a.group.position.y = a.baseY + Math.sin(t * 1.15 + a.phase) * 0.055;
      a.group.rotation.y = a.baseRotY + Math.sin(t * 0.5 + a.phase) * 0.07;
    }
    // neon pulse
    for (const p of pulsing) {
      p.material.opacity = p.base + Math.sin(t * p.speed + p.phase) * p.amp * 0.5;
    }
    // rotating limited island
    island.rotation.y = t * 0.14;
    // billboard faces camera
    limSign.lookAt(camera.position.x, limSign.position.y, camera.position.z);
    // drifting dust
    const arr = pGeo.attributes.position.array;
    for (let i = 0; i < P_COUNT; i++) {
      arr[i * 3 + 1] += dt * 0.14;
      arr[i * 3] += Math.sin(t * 0.4 + i) * dt * 0.02;
      if (arr[i * 3 + 1] > HALL.h - 0.4) arr[i * 3 + 1] = 0.3;
    }
    pGeo.attributes.position.needsUpdate = true;
  }

  return { interactables, productViews, update };
}
