// The exhibition hall — an L-shaped premium showroom.
//
//   MAIN HALL  x:[-23,23] z:[-15,15]   Nike / Jordan / adidas + SALE island
//   WING       x:[3,23]   z:[15,40]    New Balance / ASICS / Converse
//
// Brick walls, industrial windows with sun shafts, ceiling beams with
// fluorescent strips, a mirror floor, pedestals with photo product cards.

import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { CATEGORIES, productsInCategory } from './products.js';
import { buildCardTexture, buildSignTexture } from './sneakerArt.js';
import { brickTexture, concreteTexture, tileTexture, shaftGradientTexture } from './textures.js';

export const HALL = { h: 8 };

export const RECTS = [
  { x0: -23, x1: 23, z0: -15, z1: 15 }, // main hall
  { x0: 3, x1: 23, z0: 15, z1: 40 },    // wing
];

export const JUNCTION = new THREE.Vector3(13, 0, 13);

export function regionOf(z) {
  return z <= 15 ? 0 : 1;
}

/** Clamp a point into the L-shaped floor plan (with wall margin).
 *  Clamps against the actual wall segments so the junction between the
 *  two halls stays completely open — no dead zone at the seam. */
export function clampToHall(x, z, m = 1.6) {
  x = THREE.MathUtils.clamp(x, -23 + m, 23 - m);
  z = THREE.MathUtils.clamp(z, -15 + m, 40 - m);
  // the notch outside the L (south-west of the wing opening)
  if (z > 15 - m && x < 3 + m) {
    const pushNorth = z - (15 - m);
    const pushEast = (3 + m) - x;
    if (pushNorth <= pushEast) z = 15 - m;
    else x = 3 + m;
  }
  return { x, z };
}

/** Waypoint route between two floor points, going through the L junction. */
export function routeTo(from, to) {
  if (regionOf(from.z) === regionOf(to.z)) return [to.clone()];
  return [JUNCTION.clone(), to.clone()];
}

const CARD_W = 1.4;
const CARD_H = CARD_W * (640 / 512);
const PED_H = 1.0;

/* ---------------- zone layout ---------------- */

const ZONES = {
  nike:       { slots: [[-19.5, -8.25], [-19.5, -2.75], [-19.5, 2.75], [-19.5, 8.25]], rotY: Math.PI / 2 },
  jordan:     { slots: [[-6, -11.5], [0, -11.5], [6, -11.5]], rotY: 0 },
  adidas:     { slots: [[19.5, 8.25], [19.5, 2.75], [19.5, -2.75], [19.5, -8.25]], rotY: -Math.PI / 2 },
  newbalance: { slots: [[6.5, 21], [6.5, 27.5], [6.5, 34]], rotY: Math.PI / 2 },
  asics:      { slots: [[19.5, 19], [19.5, 24.5], [19.5, 30], [19.5, 35.5]], rotY: -Math.PI / 2 },
  converse:   { slots: [[8, 36.5], [13, 36.5], [18, 36.5]], rotY: Math.PI },
};

const SIGNS = {
  nike:       { pos: [-22.88, 5.2, 0], rotY: Math.PI / 2 },
  jordan:     { pos: [0, 5.2, -14.88], rotY: 0 },
  adidas:     { pos: [22.88, 5.2, 0], rotY: -Math.PI / 2 },
  newbalance: { pos: [3.12, 5.2, 27.5], rotY: Math.PI / 2 },
  asics:      { pos: [22.88, 5.2, 27.5], rotY: -Math.PI / 2 },
  converse:   { pos: [13, 5.2, 39.88], rotY: Math.PI },
};

export const VIEWPOINTS = {
  entrance:   { pos: new THREE.Vector3(0, 0, 12.2),    look: new THREE.Vector3(0, 0, 0) },
  nike:       { pos: new THREE.Vector3(-14, 0, 0),     look: new THREE.Vector3(-20, 0, 0) },
  jordan:     { pos: new THREE.Vector3(0, 0, -6),      look: new THREE.Vector3(0, 0, -12) },
  adidas:     { pos: new THREE.Vector3(14, 0, 0),      look: new THREE.Vector3(20, 0, 0) },
  newbalance: { pos: new THREE.Vector3(11, 0, 27.5),   look: new THREE.Vector3(5, 0, 27.5) },
  asics:      { pos: new THREE.Vector3(15, 0, 27.5),   look: new THREE.Vector3(21, 0, 27.5) },
  converse:   { pos: new THREE.Vector3(13, 0, 31),     look: new THREE.Vector3(13, 0, 38) },
  sale:       { pos: new THREE.Vector3(0, 0, 7.4),     look: new THREE.Vector3(0, 0, 0) },
};

/* ---------------- main builder ---------------- */

export function buildShop(scene, camera) {
  const interactables = [];
  const productViews = new Map();
  const browsePoints = [];
  const colliders = [{ x: 0, z: 0, r: 4.0 }]; // sale island
  const animated = [];
  const pulsing = [];

  /* --- floor: one big mirror + tiled overlays for each hall --- */
  const mirror = new Reflector(new THREE.PlaneGeometry(46, 55), {
    clipBias: 0.003,
    textureWidth: 1024,
    textureHeight: 1024,
    color: 0xa8abb0,
  });
  mirror.rotation.x = -Math.PI / 2;
  mirror.position.z = 12.5;
  scene.add(mirror);

  const tileTex = tileTexture();
  function tileFloor(w, d, x, z) {
    const mat = new THREE.MeshStandardMaterial({
      map: tileTex.clone(),
      transparent: true,
      opacity: 0.84,
      roughness: 0.5,
      metalness: 0.05,
    });
    mat.map.repeat.set(w / 4.6, d / 4.6);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.02, z);
    m.receiveShadow = true;
    m.userData = { type: 'floor' };
    scene.add(m);
    interactables.push(m);
  }
  tileFloor(46, 30, 0, 0);      // main hall
  tileFloor(20, 25, 13, 27.5);  // wing

  // yellow showroom guide markings
  const markMat = new THREE.MeshBasicMaterial({ color: 0xd9b53f, transparent: true, opacity: 0.75 });
  const marks = [
    { size: [34, 0.09], pos: [0, 0.035, -10.2] },
    { size: [26, 0.09], pos: [-10, 0.035, 11.6] },
    { size: [0.09, 21.8], pos: [-17, 0.035, 0.7] },
    { size: [0.09, 21.8], pos: [17, 0.035, 0.7] },
    { size: [0.09, 20], pos: [9.5, 0.035, 25] },
    { size: [0.09, 20], pos: [16.5, 0.035, 25] },
  ];
  for (const m of marks) {
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(m.size[0], m.size[1]), markMat);
    plane.rotation.x = -Math.PI / 2;
    plane.position.set(...m.pos);
    scene.add(plane);
  }

  /* --- walls --- */
  const brickTex = brickTexture();
  const concTex = concreteTexture();

  function wall(kind, w, pos, rotY) {
    const src = kind === 'brick' ? brickTex : concTex;
    const mat = new THREE.MeshStandardMaterial({
      map: src.clone(),
      roughness: kind === 'brick' ? 0.92 : 0.9,
    });
    mat.map.repeat.set(kind === 'brick' ? w / 4.4 : w / 6, kind === 'brick' ? 2.8 : 1.4);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, HALL.h), mat);
    m.position.set(...pos);
    m.rotation.y = rotY;
    m.receiveShadow = true;
    scene.add(m);
  }
  wall('brick', 46, [0, 4, -15], 0);                    // north
  wall('conc', 30, [-23, 4, 0], Math.PI / 2);           // west (main)
  wall('conc', 55, [23, 4, 12.5], -Math.PI / 2);        // east (full length)
  wall('brick', 26, [-10, 4, 15], Math.PI);             // south (main, beside wing opening)
  wall('conc', 25, [3, 4, 27.5], Math.PI / 2);          // wing west
  wall('brick', 20, [13, 4, 40], Math.PI);              // wing south

  /* --- ceilings, beams, fluorescent fixtures --- */
  const ceilTex = concreteTexture([52, 54, 58]);
  function ceilingPlane(w, d, x, z) {
    const mat = new THREE.MeshStandardMaterial({ map: ceilTex.clone(), roughness: 1 });
    mat.map.repeat.set(w / 6, d / 6);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    m.rotation.x = Math.PI / 2;
    m.position.set(x, HALL.h, z);
    scene.add(m);
  }
  ceilingPlane(46, 30, 0, 0);
  ceilingPlane(20, 25, 13, 27.5);

  const beamMat = new THREE.MeshStandardMaterial({ color: 0x1e2023, roughness: 0.7, metalness: 0.3 });
  const tubeMat = new THREE.MeshBasicMaterial({ color: 0xf2f6ff, toneMapped: false });
  function beamRow(span, cx, cz, fixturesX) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(span, 0.55, 0.38), beamMat);
    beam.position.set(cx, HALL.h - 0.28, cz);
    scene.add(beam);
    for (const fx of fixturesX) {
      const housing = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.1, 0.42), beamMat);
      housing.position.set(fx, HALL.h - 0.6, cz);
      scene.add(housing);
      const tube = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.05, 0.3), tubeMat);
      tube.position.set(fx, HALL.h - 0.66, cz);
      scene.add(tube);
    }
  }
  for (const bz of [-12, -6, 0, 6, 12]) beamRow(46, 0, bz, [-12, 0, 12]);
  for (const bz of [18, 24, 30, 36]) beamRow(20, 13, bz, [8, 18]);

  /* --- industrial windows --- */
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x24262a, roughness: 0.6, metalness: 0.4 });
  const paneMat = new THREE.MeshBasicMaterial({ color: 0xf6f9ff, toneMapped: false });
  const shaftTex = shaftGradientTexture();

  function addWindow(x, wallZ, withShaft) {
    const dir = wallZ < 0 ? 1 : -1; // faces into the room
    const z = wallZ + dir * 0.06;
    const W = 4.6, H = 3.4, cy = 4.7;

    const pane = new THREE.Mesh(new THREE.PlaneGeometry(W, H), paneMat);
    pane.position.set(x, cy, z);
    if (dir < 0) pane.rotation.y = Math.PI;
    scene.add(pane);

    for (const [bw, bh, by] of [[W + 0.24, 0.24, cy + H / 2], [W + 0.24, 0.24, cy - H / 2]]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.18), frameMat);
      b.position.set(x, by, z);
      scene.add(b);
    }
    for (const off of [-W / 2, -W / 6, W / 6, W / 2]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.14, H + 0.2, 0.18), frameMat);
      b.position.set(x + off, cy, z);
      scene.add(b);
    }
    for (const off of [-H / 6, H / 6]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(W, 0.1, 0.16), frameMat);
      b.position.set(x, cy + off, z);
      scene.add(b);
    }

    if (withShaft) {
      const shaft = new THREE.Mesh(
        new THREE.PlaneGeometry(W - 0.4, 10.2),
        new THREE.MeshBasicMaterial({
          map: shaftTex, color: 0xffedc9, transparent: true, opacity: 0.34,
          blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
        })
      );
      const up = new THREE.Vector3(0.28, 0.46, -0.84).normalize();
      shaft.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
      shaft.position.set(x - 1.45, 2.35, wallZ + 4.3);
      scene.add(shaft);
    }
  }
  addWindow(-10, -15, true);   // north wall, sun shafts
  addWindow(10, -15, true);
  addWindow(6.5, 40, false);   // wing south wall, flanking the Converse sign
  addWindow(19.5, 40, false);

  /* --- lighting --- */
  scene.add(new THREE.HemisphereLight(0xfff7ec, 0x8a8478, 0.85));
  scene.add(new THREE.AmbientLight(0x9aa2b5, 0.35));

  const sun = new THREE.DirectionalLight(0xffeed8, 3.2);
  sun.position.set(8, 16, -30);
  sun.target.position.set(0, 0, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -34;
  sun.shadow.camera.right = 34;
  sun.shadow.camera.top = 32;
  sun.shadow.camera.bottom = -34;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 90;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);

  function zoneSpot(x, z, color) {
    const spot = new THREE.SpotLight(color, 140, 24, 0.55, 0.7, 1.8);
    spot.position.set(x, HALL.h - 0.6, z);
    spot.target.position.set(x, 0, z);
    scene.add(spot, spot.target);
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(2.6, 6.4, 32, 1, true),
      new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.028,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      })
    );
    cone.position.set(x, HALL.h - 3.6, z);
    scene.add(cone);
  }

  /* --- signage --- */
  function addSign(text, accent, position, rotY, zone) {
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(7.7, 2.05),
      new THREE.MeshStandardMaterial({ color: 0x111318, roughness: 0.55, metalness: 0.35 })
    );
    board.position.set(...position);
    board.rotation.y = rotY;
    scene.add(board);

    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(7, 1.75),
      new THREE.MeshBasicMaterial({
        map: buildSignTexture(text, accent),
        transparent: true, toneMapped: false,
      })
    );
    sign.position.set(...position);
    sign.position.x += Math.sin(rotY) * 0.04;
    sign.position.z += Math.cos(rotY) * 0.04;
    sign.rotation.y = rotY;
    if (zone) {
      sign.userData = { type: 'sign', zone };
      interactables.push(sign);
    }
    scene.add(sign);
    pulsing.push({ material: sign.material, base: 0.88, amp: 0.12, speed: 1.8, phase: Math.random() * 6 });
  }

  addSign('SOLESPACE', '#00e5ff', [-10, 5.6, 14.9], Math.PI, null);

  /* --- pedestal + card factory --- */
  function addPedestal(product, slotPos, rotY, parent, accent) {
    const group = new THREE.Group();
    group.position.copy(slotPos);
    group.rotation.y = rotY;

    const ped = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.52, PED_H, 32),
      new THREE.MeshStandardMaterial({ color: 0xe8e6e1, metalness: 0.1, roughness: 0.4 })
    );
    ped.position.y = PED_H / 2;
    ped.castShadow = true;
    ped.receiveShadow = true;
    ped.userData = { type: 'product', productId: product.id };
    group.add(ped);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.46, 0.028, 12, 48),
      new THREE.MeshBasicMaterial({ color: accent, toneMapped: false, transparent: true })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = PED_H + 0.01;
    group.add(ring);
    pulsing.push({ material: ring.material, base: 0.8, amp: 0.2, speed: 2.1, phase: Math.random() * 6 });

    const { texture, redraw } = buildCardTexture(product, accent);
    const card = new THREE.Mesh(
      new THREE.PlaneGeometry(CARD_W, CARD_H),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide })
    );
    const baseY = PED_H + CARD_H / 2 + 0.22;
    card.position.y = baseY;
    card.castShadow = true;
    card.userData = { type: 'product', productId: product.id };
    group.add(card);

    parent.add(group);
    interactables.push(card, ped);
    animated.push({ group: card, baseY, baseRotY: 0, phase: Math.random() * 6.28 });
    productViews.set(product.id, { group, card, redraw });

    if (parent === scene) {
      colliders.push({ x: slotPos.x, z: slotPos.z, r: 0.75 });
      const out = new THREE.Vector3(Math.sin(rotY), 0, Math.cos(rotY));
      browsePoints.push({
        pos: slotPos.clone().addScaledVector(out, 1.9),
        look: slotPos.clone().setY(1.4),
      });
    }
  }

  /* --- brand zones --- */
  for (const cat of CATEGORIES) {
    if (cat.id === 'sale') continue;
    const items = productsInCategory(cat.id);
    const zone = ZONES[cat.id];
    items.forEach((p, i) => {
      const [x, z] = zone.slots[i % zone.slots.length];
      addPedestal(p, new THREE.Vector3(x, 0, z), zone.rotY, scene, cat.accent);
    });
    const s = SIGNS[cat.id];
    addSign(cat.name.toUpperCase(), cat.accent, s.pos, s.rotY, cat.id);

    const mid = zone.slots[Math.floor(zone.slots.length / 2)];
    zoneSpot(mid[0], mid[1], new THREE.Color(cat.accent));
  }

  /* --- SALE: rotating center island --- */
  const sale = CATEGORIES.find((c) => c.id === 'sale');
  const island = new THREE.Group();
  scene.add(island);

  const platform = new THREE.Mesh(
    new THREE.CylinderGeometry(3.5, 3.7, 0.18, 48),
    new THREE.MeshStandardMaterial({ color: 0x23262e, metalness: 0.6, roughness: 0.35 })
  );
  platform.position.y = 0.09;
  platform.castShadow = true;
  platform.receiveShadow = true;
  island.add(platform);

  const islandRing = new THREE.Mesh(
    new THREE.TorusGeometry(3.55, 0.045, 12, 72),
    new THREE.MeshBasicMaterial({ color: sale.accent, toneMapped: false, transparent: true })
  );
  islandRing.rotation.x = Math.PI / 2;
  islandRing.position.y = 0.19;
  island.add(islandRing);
  pulsing.push({ material: islandRing.material, base: 0.8, amp: 0.2, speed: 1.5, phase: 1 });

  const saleItems = productsInCategory('sale');
  saleItems.forEach((p, i) => {
    const a = (i / saleItems.length) * Math.PI * 2 + Math.PI / 2;
    addPedestal(
      p,
      new THREE.Vector3(Math.cos(a) * 2.3, 0.18, Math.sin(a) * 2.3),
      -a + Math.PI / 2,
      island,
      sale.accent
    );
  });

  const saleSign = new THREE.Mesh(
    new THREE.PlaneGeometry(5, 1.6),
    new THREE.MeshBasicMaterial({
      map: buildSignTexture('SALE %', sale.accent),
      transparent: true, toneMapped: false,
    })
  );
  saleSign.position.set(0, 4.9, 0);
  saleSign.userData = { type: 'sign', zone: 'sale' };
  scene.add(saleSign);
  interactables.push(saleSign);
  pulsing.push({ material: saleSign.material, base: 0.88, amp: 0.12, speed: 2.4, phase: 2 });

  zoneSpot(0, 0, new THREE.Color(sale.accent));

  /* --- dust motes --- */
  const P_COUNT = 420;
  const pGeo = new THREE.BufferGeometry();
  const pPos = new Float32Array(P_COUNT * 3);
  for (let i = 0; i < P_COUNT; i++) {
    const inWing = i % 3 === 2;
    pPos[i * 3] = inWing ? 3 + Math.random() * 20 : (Math.random() - 0.5) * 44;
    pPos[i * 3 + 1] = Math.random() * (HALL.h - 1) + 0.4;
    pPos[i * 3 + 2] = inWing ? 15 + Math.random() * 24 : (Math.random() - 0.5) * 28;
  }
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  const particles = new THREE.Points(
    pGeo,
    new THREE.PointsMaterial({
      color: 0xfff2cc, size: 0.03, transparent: true, opacity: 0.3,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    })
  );
  scene.add(particles);

  /* --- per-frame animation --- */
  function update(t, dt) {
    for (const a of animated) {
      a.group.position.y = a.baseY + Math.sin(t * 1.15 + a.phase) * 0.055;
      a.group.rotation.y = a.baseRotY + Math.sin(t * 0.5 + a.phase) * 0.07;
    }
    for (const p of pulsing) {
      p.material.opacity = p.base + Math.sin(t * p.speed + p.phase) * p.amp * 0.5;
    }
    island.rotation.y = t * 0.14;
    saleSign.lookAt(camera.position.x, saleSign.position.y, camera.position.z);

    const arr = pGeo.attributes.position.array;
    for (let i = 0; i < P_COUNT; i++) {
      arr[i * 3 + 1] += dt * 0.14;
      if (arr[i * 3 + 1] > HALL.h - 0.4) arr[i * 3 + 1] = 0.3;
    }
    pGeo.attributes.position.needsUpdate = true;
  }

  return { interactables, productViews, browsePoints, colliders, update };
}
