// The Concourse — the shared plaza that SoleSpace opens onto, plus the
// storefront threshold between the two.
//
//   STOREFRONT  z=15,  x -16.47..-3.53   glazed bay + door in the hall's south wall
//   VESTIBULE   x -16.47..-3.53, z 15..21.10, ceiling 5.2   (low, on purpose)
//   PLAZA       centre (-10,30), r=11, drum 12 high, dome to ~16.1
//
// The drum is a ten-sided polygon rather than a smooth cylinder: nine 32°
// tenant faces plus one 72° face that is the SoleSpace gate.  Flat faces
// mean flat shopfronts — portals, signs and glazing all sit square to the
// wall, and the whole drum merges down to a handful of draw calls.
//
// Compression then release is the whole idea: you leave an 8-high hall
// through a 5.2-high threshold and the drum opens to 16 above you.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/* ---------------- plan geometry (shared with shop.js) ---------------- */

export const PLAZA = { x: -10, z: 30, r: 11, h: 12 };

const GATE_SPAN = THREE.MathUtils.degToRad(72); // SoleSpace gets a double bay
export const BAY_COUNT = 9;
const BAY_SPAN = (Math.PI * 2 - GATE_SPAN) / BAY_COUNT; // 32°

const FACE_W = 2 * PLAZA.r * Math.sin(BAY_SPAN / 2);  // 6.06 — one tenant face
const APOTHEM = PLAZA.r * Math.cos(BAY_SPAN / 2);     // 10.57 — face centre radius

/** Half-width of the gate face — also the vestibule's half-width. */
export const GATE_HW = PLAZA.r * Math.sin(GATE_SPAN / 2);          // 6.4656
/** Where the vestibule mouth meets the drum (the gate face's chord). */
export const GATE_Z = PLAZA.z - PLAZA.r * Math.cos(GATE_SPAN / 2); // 21.1008
export const GATE_CEIL = 5.2;
export const STORE_Z = 15;   // the shop's south wall
export const DOOR_HW = 3.2;  // clear door opening, half-width
export const DOOR_H = 4.4;
export const BAY_H = 5.2;    // full height of the glazed storefront opening

/* dome: a spherical cap whose rim lands exactly on the drum */
const DOME_T = THREE.MathUtils.degToRad(42);
const OCULUS_R = 2.0;
const DOME_R = PLAZA.r / Math.sin(DOME_T);
const DOME_Y = PLAZA.h - DOME_R * Math.cos(DOME_T);
const OCULUS_T = Math.asin(OCULUS_R / DOME_R);
const OCULUS_Y = DOME_Y + DOME_R * Math.cos(OCULUS_T);

/* ---------------- tenants ----------------
 * Nine faces. Index 4 sits dead opposite the gate, so it is the first
 * thing you see walking out of SoleSpace — give it a loud one. */

export const TENANTS = [
  { id: 'menswear',   name: "MEN'S WEAR",      accent: '#4cc9f0' },
  { id: 'womenswear', name: "WOMEN'S WEAR",    accent: '#ff7ab6' },
  { id: 'gadgets',    name: 'GADGETS',         accent: '#9b5de5' },
  { id: 'bags',       name: 'BAGS & LUGGAGE',  accent: '#c98b5e' },
  { id: 'sports',     name: 'SPORTS & JERSEYS', accent: '#3ddc84' }, // on axis
  { id: 'watches',    name: 'WATCHES',         accent: '#ffd166' },
  { id: 'beauty',     name: 'BEAUTY',          accent: '#ff6a8a' },
  { id: 'kids',       name: 'KIDS & TOYS',     accent: '#ffa94d' },
  { id: 'home',       name: 'HOME & LIVING',   accent: '#2ec4b6' },
];

/* ---------------- canvas art ---------------- */

function plaqueTexture(name, accent, status) {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 384;
  const ctx = c.getContext('2d');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  let px = 116;
  ctx.font = `800 ${px}px "Segoe UI", sans-serif`;
  while (ctx.measureText(name).width > 900 && px > 44) {
    px -= 5;
    ctx.font = `800 ${px}px "Segoe UI", sans-serif`;
  }
  ctx.shadowColor = accent;
  ctx.shadowBlur = 54;
  ctx.fillStyle = accent;
  ctx.fillText(name, 512, 140);
  ctx.shadowBlur = 22;
  ctx.fillText(name, 512, 140);
  ctx.shadowBlur = 8;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(name, 512, 140);

  // status pill
  const open = status === 'open';
  ctx.shadowBlur = 0;
  ctx.font = '700 52px "Segoe UI", sans-serif';
  const label = open ? 'NOW OPEN' : 'UPCOMING';
  const w = ctx.measureText(label).width + 76;
  const x = 512 - w / 2;
  ctx.strokeStyle = open ? accent : 'rgba(214,222,236,0.8)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect(x, 250, w, 78, 39);
  if (open) {
    ctx.fillStyle = accent;
    ctx.fill();
  }
  ctx.stroke();
  ctx.fillStyle = open ? '#05161b' : 'rgba(232,238,248,0.96)';
  ctx.letterSpacing = '6px';
  ctx.fillText(label, 512 + 3, 291);
  ctx.letterSpacing = '0px';

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Coffered dome: ribs and rings painted straight into the texture —
 *  radial in u, concentric in v once it wraps a spherical cap. */
function domeTexture() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 256;
  const ctx = c.getContext('2d');

  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#c6c0b4'); // near the oculus — catches the light
  g.addColorStop(1, '#8b8c93'); // down at the cornice
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1024, 256);

  ctx.strokeStyle = 'rgba(0,0,0,0.32)';
  ctx.lineWidth = 5;
  for (let i = 0; i < 30; i++) {
    const x = (i / 30) * 1024;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 256);
    ctx.stroke();
  }
  for (const y of [58, 118, 186]) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(1024, y);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.09)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 30; i++) {
    const x = (i / 30) * 1024 + 4;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 256);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

/** The rotating directory drum on the centre pylon. */
function drumTexture() {
  const c = document.createElement('canvas');
  c.width = 2048;
  c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#0b0e14';
  ctx.fillRect(0, 0, 2048, 256);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // three copies at 683px pitch — the glyph run is ~594px wide, so they
  // clear each other instead of overlapping into mush
  ctx.font = '800 92px "Segoe UI", sans-serif';
  ctx.letterSpacing = '12px';
  for (let i = 0; i < 3; i++) {
    const x = 341 + i * 683;
    ctx.shadowColor = '#00e5ff';
    ctx.shadowBlur = 40;
    ctx.fillStyle = '#00e5ff';
    ctx.fillText('METAMART', x, 118);
    ctx.shadowBlur = 12;
    ctx.fillStyle = '#ffffff';
    ctx.fillText('METAMART', x, 118);
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(0,229,255,0.55)';
    ctx.fillText('.', x + 342, 108);
  }
  ctx.letterSpacing = '0px';
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(0,229,255,0.5)';
  ctx.fillRect(0, 196, 2048, 3);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

/* ---------------- builder ---------------- */

/**
 * @param scene      the shop's scene
 * @param ctx.floorMaterial  (w,d,x,z) → material locked to the world tile grid
 * @param ctx.concTex        shared concrete texture (cloned per surface)
 * @param ctx.shaftTex       shared light-shaft gradient
 * @param ctx.interactables  raycast list to append to
 * @param ctx.colliders      {x,z,r} list to append to
 * @param ctx.pulsing        materials the shop's loop breathes
 */
export function buildConcourse(scene, ctx) {
  const { floorMaterial, concTex, shaftTex, interactables, colliders, pulsing } = ctx;

  // merge buckets — one draw call each
  const wallGeos = [];    // drum + vestibule walls (matte concrete)
  const trimGeos = [];    // jambs, heads, mullions, cornices, thresholds
  const glassGeos = [];   // storefront glazing
  const doorGeos = [];    // tenant door leaves (dark glass)
  const glowGeos = [];    // clerestory panes + cove strips
  const brightGeos = [];  // door pulls — brushed, so they read on dark glass
  const markGeos = [];    // floor inlay

  const face = (arr, w, h, m4, x, y, z) => {
    const g = new THREE.PlaneGeometry(w, h);
    g.translate(x, y, z);
    if (m4) g.applyMatrix4(m4);
    arr.push(g);
  };
  const solid = (arr, w, h, d, m4, x, y, z) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, y, z);
    if (m4) g.applyMatrix4(m4);
    arr.push(g);
  };

  /** World matrix for a drum face: local +x runs along the wall,
   *  local +z points at the centre of the plaza. */
  function faceMatrix(angle, radius) {
    return new THREE.Matrix4()
      .makeRotationY(angle + Math.PI)
      .setPosition(
        PLAZA.x + Math.sin(angle) * radius,
        0,
        PLAZA.z + Math.cos(angle) * radius
      );
  }

  /* ---------------- floors ---------------- */

  function slab(geo, w, d, x, z, y) {
    const m = new THREE.Mesh(geo, floorMaterial(w, d, x, z));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    m.receiveShadow = true;
    m.userData = { type: 'floor' };
    scene.add(m);
    interactables.push(m);
    return m;
  }

  // vestibule sits a hair lower so it loses the coplanar overlap with the
  // plaza disc instead of z-fighting it
  slab(
    new THREE.PlaneGeometry(GATE_HW * 2, GATE_Z - STORE_Z),
    GATE_HW * 2, GATE_Z - STORE_Z, PLAZA.x, (STORE_Z + GATE_Z) / 2, 0.019
  );
  const discR = PLAZA.r + 0.2;
  slab(new THREE.CircleGeometry(discR, 72), discR * 2, discR * 2, PLAZA.x, PLAZA.z, 0.02);

  /* --- floor inlay: the lane language, gone radial ---
   * Same 2.5 standoff rule as the halls: the outer ring sits 2.5 in from
   * the bay thresholds, and ten spokes point at the ten faces. */
  const RING_OUT = PLAZA.r - 2.5;   // 8.5
  const RING_IN = 3.6;
  for (const r of [RING_OUT, RING_IN]) {
    const g = new THREE.RingGeometry(r - 0.045, r + 0.045, 108);
    g.rotateX(-Math.PI / 2);
    g.translate(PLAZA.x, 0.035, PLAZA.z);
    markGeos.push(g);
  }
  const spokeAngles = [Math.PI];
  for (let i = 0; i < BAY_COUNT; i++) {
    spokeAngles.push(Math.PI + GATE_SPAN / 2 + (i + 0.5) * BAY_SPAN);
  }
  for (const a of spokeAngles) {
    const g = new THREE.PlaneGeometry(0.09, RING_OUT - RING_IN);
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0.035, (RING_OUT + RING_IN) / 2);
    g.applyMatrix4(
      new THREE.Matrix4()
        .makeRotationY(a + Math.PI)
        .setPosition(PLAZA.x, 0, PLAZA.z)
    );
    markGeos.push(g);
  }

  /* ---------------- vestibule ---------------- */

  const gateDepth = GATE_Z - STORE_Z;
  const gateMid = (STORE_Z + GATE_Z) / 2;

  // side walls (single planes, each facing into the threshold)
  for (const s of [-1, 1]) {
    const g = new THREE.PlaneGeometry(gateDepth, GATE_CEIL);
    g.rotateY(-s * Math.PI / 2); // normal points back at the walkway
    g.translate(PLAZA.x + s * GATE_HW, GATE_CEIL / 2, gateMid);
    wallGeos.push(g);
  }
  // ceiling — low, and the reason the drum lands
  const ceil = new THREE.Mesh(
    new THREE.PlaneGeometry(GATE_HW * 2, gateDepth),
    new THREE.MeshLambertMaterial({ color: 0x2a2c33 })
  );
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(PLAZA.x, GATE_CEIL, gateMid);
  scene.add(ceil);
  // cove strip washing the threshold
  solid(glowGeos, GATE_HW * 1.7, 0.08, 0.5, null, PLAZA.x, GATE_CEIL - 0.14, gateMid);

  /* ---------------- storefront glazing (in the shop's wall) ----------------
   * The wall opening is the full 12.93 bay; the clear door is 6.4 of it.
   * Everything else is glass, so the concourse is visible from inside the
   * hall — a door you can see through reads as an opening, not a hole. */
  const glassZ = STORE_Z + 0.02;
  for (const s of [-1, 1]) {
    const w = GATE_HW - DOOR_HW;
    face(glassGeos, w, BAY_H, null, PLAZA.x + s * (DOOR_HW + w / 2), BAY_H / 2, glassZ);
  }
  face(glassGeos, DOOR_HW * 2, BAY_H - DOOR_H, null, PLAZA.x, (BAY_H + DOOR_H) / 2, glassZ);

  // mullions + head rail + door jambs
  for (const s of [-1, 1]) {
    solid(trimGeos, 0.16, BAY_H, 0.4, null, PLAZA.x + s * DOOR_HW, BAY_H / 2, glassZ);
    solid(trimGeos, 0.16, BAY_H, 0.4, null, PLAZA.x + s * (GATE_HW - 0.08), BAY_H / 2, glassZ);
    solid(trimGeos, GATE_HW - DOOR_HW, 0.12, 0.34, null,
      PLAZA.x + s * (DOOR_HW + (GATE_HW - DOOR_HW) / 2), BAY_H * 0.55, glassZ);
  }
  solid(trimGeos, GATE_HW * 2, 0.22, 0.44, null, PLAZA.x, BAY_H + 0.11, glassZ);
  solid(trimGeos, DOOR_HW * 2, 0.14, 0.4, null, PLAZA.x, DOOR_H, glassZ);
  solid(trimGeos, DOOR_HW * 2 + 0.3, 0.05, 0.5, null, PLAZA.x, 0.025, glassZ); // threshold

  /* ---------------- drum: nine tenant faces ---------------- */

  for (let i = 0; i < BAY_COUNT; i++) {
    const t = TENANTS[i];
    const a = Math.PI + GATE_SPAN / 2 + (i + 0.5) * BAY_SPAN;
    const m4 = faceMatrix(a, APOTHEM);

    // The face is built AROUND the portal — two piers and a spandrel — so
    // the opening is a real hole. A full wall plane here would simply bury
    // the recessed door leaf behind it.
    const PORTAL_W = 4.2;
    const PORTAL_H = 5.3;
    const pier = (FACE_W - PORTAL_W) / 2;
    for (const s2 of [-1, 1]) {
      face(wallGeos, pier, PLAZA.h, m4, s2 * (PORTAL_W + pier) / 2, PLAZA.h / 2, 0);
    }
    face(wallGeos, PORTAL_W, PLAZA.h - PORTAL_H, m4, 0, (PLAZA.h + PORTAL_H) / 2, 0);

    // dark glass leaf, set back behind the reveal so the portal has depth
    face(doorGeos, PORTAL_W + 0.04, PORTAL_H + 0.1, m4, 0, (PORTAL_H + 0.1) / 2, -0.3);
    for (const s of [-1, 1]) {
      solid(trimGeos, 0.22, 5.3, 0.4, m4, s * 2.21, 2.65, -0.16);
      solid(brightGeos, 0.08, 1.7, 0.08, m4, s * 0.34, 1.32, -0.24); // push bars
    }
    solid(trimGeos, 4.64, 0.24, 0.4, m4, 0, 5.42, -0.16);
    solid(trimGeos, PORTAL_W, 0.13, 0.34, m4, 0, 3.55, -0.24); // transom
    solid(glowGeos, PORTAL_W - 0.34, 0.07, 0.1, m4, 0, PORTAL_H - 0.16, -0.03);
    solid(trimGeos, 4.2, 0.05, 0.42, m4, 0, 0.025, -0.16);

    // fascia band above the shopfronts — one datum right around the drum
    solid(trimGeos, FACE_W, 0.18, 0.26, m4, 0, 5.75, 0.13);

    // clerestory: a lit band that makes the drum read tall
    face(glowGeos, 4.8, 1.5, m4, 0, 9.9, 0.05);
    for (const x of [-1.6, 0, 1.6]) solid(trimGeos, 0.09, 1.5, 0.14, m4, x, 9.9, 0.09);
    for (const s of [-1, 1]) solid(trimGeos, 5.0, 0.14, 0.14, m4, 0, 9.9 + s * 0.78, 0.09);

    // cornice + cove, per face so they follow the polygon exactly
    solid(trimGeos, FACE_W, 0.3, 0.5, m4, 0, 11.62, 0.2);
    solid(glowGeos, FACE_W - 0.4, 0.1, 0.12, m4, 0, 11.3, 0.3);

    // tenant plaque (its own draw call — it carries the name)
    const plaque = new THREE.Mesh(
      new THREE.PlaneGeometry(5.4, 2.03),
      new THREE.MeshBasicMaterial({
        map: plaqueTexture(t.name, t.accent, 'upcoming'),
        transparent: true, toneMapped: false, depthWrite: false,
      })
    );
    plaque.applyMatrix4(m4);
    plaque.position.add(
      new THREE.Vector3(0, 6.9, 0.06).applyMatrix4(
        new THREE.Matrix4().extractRotation(m4)
      )
    );
    plaque.userData = { type: 'tenant', tenantId: t.id };
    scene.add(plaque);
    interactables.push(plaque);
    // dim and slow — these shops aren't open yet
    pulsing.push({ material: plaque.material, base: 0.82, amp: 0.12, speed: 0.9, phase: i * 0.7 });

    // an invisible click target over the door itself, so the portal is
    // clickable and not just the sign
    const hit = new THREE.Mesh(
      new THREE.PlaneGeometry(4.4, 5.2),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    hit.applyMatrix4(m4);
    hit.position.add(
      new THREE.Vector3(0, 2.6, 0.02).applyMatrix4(
        new THREE.Matrix4().extractRotation(m4)
      )
    );
    hit.userData = { type: 'tenant', tenantId: t.id };
    scene.add(hit);
    interactables.push(hit);
  }

  /* ---------------- drum: the SoleSpace gate face ---------------- */
  {
    const m4 = faceMatrix(Math.PI, PLAZA.r * Math.cos(GATE_SPAN / 2));
    const w = GATE_HW * 2;

    // wall only above the threshold ceiling — below it is the way in
    face(wallGeos, w, PLAZA.h - GATE_CEIL, m4, 0, (PLAZA.h + GATE_CEIL) / 2, 0);
    solid(trimGeos, w, 0.26, 0.5, m4, 0, GATE_CEIL + 0.13, 0.14);
    for (const s of [-1, 1]) solid(trimGeos, 0.3, GATE_CEIL, 0.44, m4, s * (GATE_HW - 0.15), GATE_CEIL / 2, 0.1);

    face(glowGeos, 9.0, 1.5, m4, 0, 9.9, 0.05);
    for (const x of [-3, -1, 1, 3]) solid(trimGeos, 0.09, 1.5, 0.14, m4, x, 9.9, 0.09);
    for (const s of [-1, 1]) solid(trimGeos, 9.2, 0.14, 0.14, m4, 0, 9.9 + s * 0.78, 0.09);

    solid(trimGeos, w, 0.3, 0.5, m4, 0, 11.62, 0.2);
    solid(glowGeos, w - 0.6, 0.1, 0.12, m4, 0, 11.3, 0.3);

    const plaque = new THREE.Mesh(
      new THREE.PlaneGeometry(9.6, 3.6),
      new THREE.MeshBasicMaterial({
        map: plaqueTexture('SOLESPACE', '#00e5ff', 'open'),
        transparent: true, toneMapped: false, depthWrite: false,
      })
    );
    plaque.applyMatrix4(m4);
    plaque.position.add(
      new THREE.Vector3(0, 7.4, 0.06).applyMatrix4(
        new THREE.Matrix4().extractRotation(m4)
      )
    );
    plaque.userData = { type: 'sign', zone: 'entrance' };
    scene.add(plaque);
    interactables.push(plaque);
    pulsing.push({ material: plaque.material, base: 0.9, amp: 0.12, speed: 1.8, phase: 3 });
  }

  /* ---------------- flush the merged geometry ---------------- */

  const concMap = concTex.clone();
  concMap.repeat.set(1.6, 2.2);
  const drum = new THREE.Mesh(
    mergeGeometries(wallGeos),
    new THREE.MeshLambertMaterial({ map: concMap })
  );
  drum.receiveShadow = true;
  scene.add(drum);

  const trim = new THREE.Mesh(
    mergeGeometries(trimGeos),
    new THREE.MeshStandardMaterial({ color: 0x24272e, roughness: 0.42, metalness: 0.72 })
  );
  trim.receiveShadow = true;
  scene.add(trim);

  scene.add(new THREE.Mesh(
    mergeGeometries(doorGeos),
    new THREE.MeshStandardMaterial({
      color: 0x121722, roughness: 0.2, metalness: 0.06, envMapIntensity: 0.9,
    })
  ));

  scene.add(new THREE.Mesh(
    mergeGeometries(brightGeos),
    new THREE.MeshStandardMaterial({ color: 0xa9b2bd, roughness: 0.28, metalness: 0.9 })
  ));

  scene.add(new THREE.Mesh(
    mergeGeometries(glassGeos),
    new THREE.MeshStandardMaterial({
      color: 0xcfe6f0, roughness: 0.05, metalness: 0.1,
      envMapIntensity: 2.4, transparent: true, opacity: 0.17,
      side: THREE.DoubleSide, depthWrite: false,
    })
  ));

  scene.add(new THREE.Mesh(
    mergeGeometries(glowGeos),
    new THREE.MeshBasicMaterial({ color: 0xfff1d8, toneMapped: false })
  ));

  scene.add(new THREE.Mesh(
    mergeGeometries(markGeos),
    new THREE.MeshBasicMaterial({
      color: 0xd9b53f, transparent: true, opacity: 0.75, side: THREE.DoubleSide,
    })
  ));

  /* ---------------- dome + oculus ---------------- */

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(DOME_R, 48, 16, 0, Math.PI * 2, OCULUS_T, DOME_T - OCULUS_T),
    new THREE.MeshLambertMaterial({
      map: domeTexture(), side: THREE.BackSide, emissive: 0x24262b,
    })
  );
  dome.position.set(PLAZA.x, DOME_Y, PLAZA.z);
  scene.add(dome);

  const oculus = new THREE.Mesh(
    new THREE.CircleGeometry(OCULUS_R, 40),
    new THREE.MeshBasicMaterial({ color: 0xfff6e2, toneMapped: false })
  );
  oculus.rotation.x = Math.PI / 2;
  oculus.position.set(PLAZA.x, OCULUS_Y - 0.05, PLAZA.z);
  scene.add(oculus);

  // the light itself, falling the full height of the drum
  const shaft = new THREE.Mesh(
    new THREE.ConeGeometry(6.4, OCULUS_Y - 1.5, 40, 1, true),
    new THREE.MeshBasicMaterial({
      map: shaftTex, color: 0xffeccd, transparent: true, opacity: 0.13,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    })
  );
  shaft.position.set(PLAZA.x, (OCULUS_Y - 1.5) / 2 + 0.4, PLAZA.z);
  scene.add(shaft);

  /* ---------------- centre: the directory pylon ---------------- */

  const pylon = new THREE.Group();
  pylon.position.set(PLAZA.x, 0, PLAZA.z);
  scene.add(pylon);

  const dark = new THREE.MeshStandardMaterial({ color: 0x1c1f26, roughness: 0.35, metalness: 0.65 });
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.7, 0.24, 10), dark);
  plinth.position.y = 0.12;
  plinth.castShadow = true;
  plinth.receiveShadow = true;
  pylon.add(plinth);

  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.9, 2.5, 10), dark);
  column.position.y = 1.49;
  column.castShadow = true;
  pylon.add(column);

  const drumTex = drumTexture();
  drumTex.repeat.set(1, 1);
  const directory = new THREE.Mesh(
    new THREE.CylinderGeometry(1.15, 1.15, 1.6, 32, 1, true),
    new THREE.MeshBasicMaterial({ map: drumTex, toneMapped: false })
  );
  directory.position.y = 3.55;
  pylon.add(directory);

  const cap = new THREE.Mesh(new THREE.CylinderGeometry(1.32, 1.26, 0.2, 32), dark);
  cap.position.y = 4.45;
  pylon.add(cap);

  const beaconMat = new THREE.MeshBasicMaterial({
    color: 0x00e5ff, toneMapped: false, transparent: true,
  });
  const beacon = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.045, 8, 48), beaconMat);
  beacon.rotation.x = Math.PI / 2;
  beacon.position.y = 4.56;
  pylon.add(beacon);
  pulsing.push({ material: beaconMat, base: 0.85, amp: 0.15, speed: 1.4, phase: 0 });

  colliders.push({ x: PLAZA.x, z: PLAZA.z, r: 1.8 });

  /* ---------------- light ---------------- */

  const sky = new THREE.SpotLight(0xfff0d6, 430, 34, 0.62, 0.85, 1.5);
  sky.position.set(PLAZA.x, OCULUS_Y - 0.6, PLAZA.z);
  sky.target.position.set(PLAZA.x, 0, PLAZA.z);
  scene.add(sky, sky.target);

  // sits at cornice height in the middle so it washes the dome from below —
  // the oculus spot only ever throws light downwards
  const cove = new THREE.PointLight(0xffdcae, 150, 32, 1.6);
  cove.position.set(PLAZA.x, 10.9, PLAZA.z);
  scene.add(cove);

  const threshold = new THREE.PointLight(0x8fe9ff, 34, 14, 1.8);
  threshold.position.set(PLAZA.x, 4.4, gateMid);
  scene.add(threshold);

  /* ---------------- per-frame ---------------- */

  return {
    update(t) {
      directory.rotation.y = -t * 0.12;
    },
  };
}
