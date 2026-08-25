// The exhibition hall — premium daylight showroom: brick walls, industrial
// windows with sun shafts, ceiling beams with fluorescent strips, a mirror
// floor, and the product zones (pedestals, cards, neon signs, island).

import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { CATEGORIES, productsInCategory } from './products.js';
import { buildCardTexture, buildSignTexture } from './sneakerArt.js';
import { brickTexture, concreteTexture, tileTexture, shaftGradientTexture } from './textures.js';

export const HALL = { w: 46, d: 30, h: 8 }; // x: ±23, z: ±15

const CARD_W = 1.4;
const CARD_H = CARD_W * (640 / 512);
const PED_H = 1.0;

/* ---------------- zone layout ---------------- */

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
  const browsePoints = []; // spots where visitors stand to look at products
  const animated = [];
  const pulsing = [];

  /* --- floor: real mirror + polished tiles over it --- */
  const mirror = new Reflector(new THREE.PlaneGeometry(HALL.w, HALL.d), {
    clipBias: 0.003,
    textureWidth: 1024,
    textureHeight: 1024,
    color: 0xa8abb0,
  });
  mirror.rotation.x = -Math.PI / 2;
  scene.add(mirror);

  const tiles = new THREE.Mesh(
    new THREE.PlaneGeometry(HALL.w, HALL.d),
    new THREE.MeshStandardMaterial({
      map: tileTexture(),
      transparent: true,
      opacity: 0.84, // lets ~16% of the mirror bleed through = polished look
      roughness: 0.5,
      metalness: 0.05,
    })
  );
  tiles.material.map.repeat.set(HALL.w / 4.6, HALL.d / 4.6);
  tiles.rotation.x = -Math.PI / 2;
  tiles.position.y = 0.02;
  tiles.receiveShadow = true;
  tiles.userData = { type: 'floor' };
  scene.add(tiles);
  interactables.push(tiles);

  // yellow guide markings like a real showroom floor
  const markMat = new THREE.MeshBasicMaterial({ color: 0xd9b53f, transparent: true, opacity: 0.75 });
  const marks = [
    { size: [34, 0.09], pos: [0, 0.035, -10.2] },
    { size: [34, 0.09], pos: [0, 0.035, 11.6] },
    { size: [0.09, 21.8], pos: [-17, 0.035, 0.7], flip: true },
    { size: [0.09, 21.8], pos: [17, 0.035, 0.7], flip: true },
  ];
  for (const m of marks) {
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(m.size[0], m.size[1]), markMat);
    plane.rotation.x = -Math.PI / 2;
    plane.position.set(...m.pos);
    scene.add(plane);
  }

  /* --- walls: brick front/back, light concrete on the signage sides --- */
  const brick = brickTexture();
  const brickMat = new THREE.MeshStandardMaterial({ map: brick, roughness: 0.92 });
  const concrete = concreteTexture();
  const concMat = new THREE.MeshStandardMaterial({ map: concrete, roughness: 0.9 });

  const walls = [
    { mat: brickMat, size: [HALL.w, HALL.h], pos: [0, HALL.h / 2, -HALL.d / 2], rotY: 0, rep: [10.5, 2.8] },
    { mat: brickMat, size: [HALL.w, HALL.h], pos: [0, HALL.h / 2, HALL.d / 2], rotY: Math.PI, rep: [10.5, 2.8] },
    { mat: concMat, size: [HALL.d, HALL.h], pos: [-HALL.w / 2, HALL.h / 2, 0], rotY: Math.PI / 2, rep: [5, 1.4] },
    { mat: concMat, size: [HALL.d, HALL.h], pos: [HALL.w / 2, HALL.h / 2, 0], rotY: -Math.PI / 2, rep: [5, 1.4] },
  ];
  for (const w of walls) {
    const mat = w.mat.clone();
    mat.map = w.mat.map.clone();
    mat.map.repeat.set(...w.rep);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(...w.size), mat);
    m.position.set(...w.pos);
    m.rotation.y = w.rotY;
    m.receiveShadow = true;
    scene.add(m);
  }

  /* --- ceiling: dark concrete, exposed beams, fluorescent fixtures --- */
  const ceilMat = new THREE.MeshStandardMaterial({ map: concreteTexture([52, 54, 58]), roughness: 1 });
  ceilMat.map.repeat.set(8, 5);
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(HALL.w, HALL.d), ceilMat);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = HALL.h;
  scene.add(ceiling);

  const beamMat = new THREE.MeshStandardMaterial({ color: 0x1e2023, roughness: 0.7, metalness: 0.3 });
  const tubeMat = new THREE.MeshBasicMaterial({ color: 0xf2f6ff, toneMapped: false });
  for (const bz of [-12, -6, 0, 6, 12]) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(HALL.w, 0.55, 0.38), beamMat);
    beam.position.set(0, HALL.h - 0.28, bz);
    scene.add(beam);
    for (const fx of [-12, 0, 12]) {
      const housing = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.1, 0.42), beamMat);
      housing.position.set(fx, HALL.h - 0.6, bz);
      scene.add(housing);
      const tube = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.05, 0.3), tubeMat);
      tube.position.set(fx, HALL.h - 0.66, bz);
      scene.add(tube);
    }
  }

  /* --- industrial windows on the brick walls --- */
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

    // frame + mullions
    const bars = [
      [W + 0.24, 0.24, cy + H / 2], [W + 0.24, 0.24, cy - H / 2], // top/bottom
    ];
    for (const [bw, bh, by] of bars) {
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

    // volumetric sun shaft falling into the room (north windows only)
    if (withShaft) {
      const len = 10.2;
      const shaft = new THREE.Mesh(
        new THREE.PlaneGeometry(W - 0.4, len),
        new THREE.MeshBasicMaterial({
          map: shaftTex, color: 0xffedc9, transparent: true, opacity: 0.34,
          blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
        })
      );
      // local +Y points from the floor landing spot back up to the window
      const up = new THREE.Vector3(0.28, 0.46, -0.84).normalize();
      shaft.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
      shaft.position.set(x - 1.45, 2.35, wallZ + 4.3);
      scene.add(shaft);
    }
  }
  addWindow(-10, -HALL.d / 2, true);
  addWindow(10, -HALL.d / 2, true);
  addWindow(-10, HALL.d / 2, false);
  addWindow(10, HALL.d / 2, false);

  /* --- lighting: warm sun through the north windows + soft fill --- */
  scene.add(new THREE.HemisphereLight(0xfff7ec, 0x8a8478, 0.85));
  scene.add(new THREE.AmbientLight(0x9aa2b5, 0.35));

  const sun = new THREE.DirectionalLight(0xffeed8, 3.2);
  sun.position.set(8, 13, -24);
  sun.target.position.set(0, 0, 2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -26;
  sun.shadow.camera.right = 26;
  sun.shadow.camera.top = 20;
  sun.shadow.camera.bottom = -20;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 60;
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

  /* --- signage helpers --- */
  function addSign(text, accent, position, rotY, zone) {
    // dark backing board so the neon pops on bright walls
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(7.7, 2.05),
      new THREE.MeshStandardMaterial({ color: 0x111318, roughness: 0.55, metalness: 0.35 })
    );
    board.position.copy(position);
    board.rotation.y = rotY;
    scene.add(board);

    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(7, 1.75),
      new THREE.MeshBasicMaterial({
        map: buildSignTexture(text, accent),
        transparent: true, toneMapped: false,
      })
    );
    sign.position.copy(position);
    // nudge in front of the board along its facing direction
    sign.position.x += Math.sin(rotY) * 0.04;
    sign.position.z += Math.cos(rotY) * 0.04;
    sign.rotation.y = rotY;
    if (zone) {
      sign.userData = { type: 'sign', zone };
      interactables.push(sign);
    }
    scene.add(sign);
    pulsing.push({ material: sign.material, base: 0.88, amp: 0.12, speed: 1.8, phase: Math.random() * 6 });
    return sign;
  }

  addSign('SOLESPACE', '#00e5ff', new THREE.Vector3(0, 5.6, HALL.d / 2 - 0.1), Math.PI, null);

  /* --- pedestal + card factory --- */
  function addPedestal(product, slot, parent, accent) {
    const group = new THREE.Group();
    group.position.copy(slot.pos);
    group.rotation.y = slot.rotY;

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

    // visitors can come stand in front of wall pedestals
    if (parent === scene) {
      const out = new THREE.Vector3(Math.sin(slot.rotY), 0, Math.cos(slot.rotY));
      browsePoints.push({
        pos: slot.pos.clone().addScaledVector(out, 1.9),
        look: slot.pos.clone().setY(1.4),
      });
    }
  }

  /* --- wall zones --- */
  for (const cat of CATEGORIES) {
    const items = productsInCategory(cat.id);
    const slots = zoneSlots(cat.id, items.length);
    if (cat.wall === 'center') continue;

    items.forEach((p, i) => addPedestal(p, slots[i], scene, cat.accent));

    const off = 0.12;
    let pos, rotY;
    if (cat.wall === 'west') { pos = new THREE.Vector3(-HALL.w / 2 + off, 5.2, 0); rotY = Math.PI / 2; }
    if (cat.wall === 'east') { pos = new THREE.Vector3(HALL.w / 2 - off, 5.2, 0); rotY = -Math.PI / 2; }
    if (cat.wall === 'north') { pos = new THREE.Vector3(0, 5.2, -HALL.d / 2 + off); rotY = 0; }
    addSign(cat.name.toUpperCase(), cat.accent, pos, rotY, cat.id);

    const mid = slots[Math.floor(slots.length / 2)].pos;
    zoneSpot(mid.x, mid.z, new THREE.Color(cat.accent));
  }

  /* --- limited drops: rotating center island --- */
  const limited = CATEGORIES.find((c) => c.id === 'limited');
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
    new THREE.MeshBasicMaterial({ color: limited.accent, toneMapped: false, transparent: true })
  );
  islandRing.rotation.x = Math.PI / 2;
  islandRing.position.y = 0.19;
  island.add(islandRing);
  pulsing.push({ material: islandRing.material, base: 0.8, amp: 0.2, speed: 1.5, phase: 1 });

  const limItems = productsInCategory('limited');
  const limSlots = zoneSlots('limited', limItems.length);
  limItems.forEach((p, i) => addPedestal(p, limSlots[i], island, limited.accent));

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
  pulsing.push({ material: limSign.material, base: 0.88, amp: 0.12, speed: 2.2, phase: 2 });

  zoneSpot(0, 0, new THREE.Color(limited.accent));

  /* --- dust motes drifting through the sunbeams --- */
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
    limSign.lookAt(camera.position.x, limSign.position.y, camera.position.z);

    const arr = pGeo.attributes.position.array;
    for (let i = 0; i < P_COUNT; i++) {
      arr[i * 3 + 1] += dt * 0.14;
      arr[i * 3] += Math.sin(t * 0.4 + i) * dt * 0.02;
      if (arr[i * 3 + 1] > HALL.h - 0.4) arr[i * 3 + 1] = 0.3;
    }
    pGeo.attributes.position.needsUpdate = true;
  }

  return { interactables, productViews, browsePoints, update };
}
