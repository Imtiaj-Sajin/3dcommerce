// The exhibition hall — an L-shaped premium showroom that opens onto the
// shared METAMART concourse through its south storefront.
//
//   MAIN HALL  x:[-23,23] z:[-15,15]   Nike / Jordan / adidas + SALE island
//   WING       x:[3,23]   z:[15,50]    New Balance / ASICS / Converse
//   VESTIBULE  x:[-16.5,-3.5] z:[15,21.1]   the threshold (see concourse.js)
//   PLAZA      circle (-10,30) r 11        the concourse, nine other tenants
//
// Performance notes: all static trim (window frames, beams, fixtures,
// panes, floor markings) is merged into a handful of draw calls; big matte
// surfaces use cheap Lambert materials; the floor's premium look is baked
// into its textures + env-map sheen — no reflection render pass at all.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CATEGORIES, productsInCategory, HIGHLIGHT } from './products.js';
import { buildCardTexture, buildSignTexture } from './sneakerArt.js';
import { brickTexture, concreteTexture, floorTextures, shaftGradientTexture } from './textures.js';
import {
  buildConcourse, PLAZA, GATE_HW, GATE_Z, GATE_CEIL, STORE_Z, DOOR_HW, BAY_H,
} from './concourse.js';

export const HALL = { h: 8 };

/* ---------------- the walkable plan ----------------
 * The floor you can stand on is a union of simple regions.  Each region
 * insets its CLOSED edges by the caller's wall margin and pushes its OPEN
 * edges — the doorways — well past the boundary, so neighbouring regions
 * always overlap and no threshold is ever a dead band you stick in. */

const SLOP = 4;

export const REGIONS = [
  { id: 'hall', kind: 'rect', x0: -23, x1: 23, z0: -15, z1: 15 },
  { id: 'wing', kind: 'rect', x0: 3, x1: 23, z0: 15, z1: 50, open: { z0: 1 } },
  {
    id: 'door', kind: 'rect', open: { z0: 1, z1: 1 },
    x0: PLAZA.x - DOOR_HW, x1: PLAZA.x + DOOR_HW, z0: STORE_Z, z1: STORE_Z + 2.5,
  },
  {
    id: 'gate', kind: 'rect', open: { z1: 1 },
    x0: PLAZA.x - GATE_HW, x1: PLAZA.x + GATE_HW, z0: STORE_Z, z1: GATE_Z,
  },
  { id: 'plaza', kind: 'circle', cx: PLAZA.x, cz: PLAZA.z, r: PLAZA.r },
];

function nearestIn(region, x, z, m) {
  if (region.kind === 'circle') {
    const rad = region.r - m;
    const dx = x - region.cx;
    const dz = z - region.cz;
    const d = Math.hypot(dx, dz);
    if (d <= rad || d < 1e-6) return { x, z, inside: true };
    return { x: region.cx + (dx / d) * rad, z: region.cz + (dz / d) * rad, inside: false };
  }
  const o = region.open ?? {};
  const x0 = o.x0 ? region.x0 - SLOP : region.x0 + m;
  const x1 = o.x1 ? region.x1 + SLOP : region.x1 - m;
  const z0 = o.z0 ? region.z0 - SLOP : region.z0 + m;
  const z1 = o.z1 ? region.z1 + SLOP : region.z1 - m;
  if (x0 > x1 || z0 > z1) return null; // margin swallowed a narrow region
  const cx = THREE.MathUtils.clamp(x, x0, x1);
  const cz = THREE.MathUtils.clamp(z, z0, z1);
  return { x: cx, z: cz, inside: cx === x && cz === z };
}

/** Slide a point to the nearest spot inside the plan, keeping `m` off walls. */
export function clampToHall(x, z, m = 1.6) {
  let best = null;
  let bestD = Infinity;
  for (const region of REGIONS) {
    const p = nearestIn(region, x, z, m);
    if (!p) continue;
    if (p.inside) return { x, z };
    const d = (p.x - x) ** 2 + (p.z - z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best ? { x: best.x, z: best.z } : { x, z };
}

/** Which room a point is standing in — drives routing and camera headroom. */
export function regionAt(x, z) {
  for (const r of REGIONS) {
    if (r.kind === 'circle') {
      if (Math.hypot(x - r.cx, z - r.cz) <= r.r) return r.id;
    } else if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) {
      return r.id;
    }
  }
  return 'hall';
}

/** How high the chase camera may rise here. The threshold is deliberately
 *  low, and the drum is tall — the camera has to respect both. */
export function cameraCeiling(x, z) {
  const id = regionAt(x, z);
  if (id === 'gate' || id === 'door') return GATE_CEIL - 0.6;
  if (id === 'plaza') return 9.5;
  return 7.5;
}

/* ---------------- routing ----------------
 * The plan is a chain of rooms: wing — hall — gate — plaza.  A route is
 * just the portals between the two ends, walked in order. */

export const JUNCTION = new THREE.Vector3(13, 0, 13);

const CHAIN = ['wing', 'hall', 'gate', 'plaza'];
const HUB = { wing: 'wing', hall: 'hall', door: 'gate', gate: 'gate', plaza: 'plaza' };
const PORTALS = [
  [JUNCTION],                                                       // wing | hall
  [new THREE.Vector3(PLAZA.x, 0, 13.2), new THREE.Vector3(PLAZA.x, 0, 17.8)], // hall | gate
  [new THREE.Vector3(PLAZA.x, 0, GATE_Z + 1.6)],                    // gate | plaza
];

/** Waypoint route between two floor points, threaded through the doorways. */
export function routeTo(from, to) {
  let a = CHAIN.indexOf(HUB[regionAt(from.x, from.z)]);
  let b = CHAIN.indexOf(HUB[regionAt(to.x, to.z)]);
  if (a < 0) a = 1;
  if (b < 0) b = 1;
  const path = [];
  if (a < b) {
    for (let i = a; i < b; i++) for (const w of PORTALS[i]) path.push(w.clone());
  } else {
    for (let i = a - 1; i >= b; i--) {
      for (const w of [...PORTALS[i]].reverse()) path.push(w.clone());
    }
  }
  path.push(to.clone());
  return path;
}

/* ---------------- where the crowd wanders ---------------- */

export const WANDER_AREAS = [
  { kind: 'rect', x0: -23, x1: 23, z0: -15, z1: 15, weight: 4 },
  { kind: 'rect', x0: 3, x1: 23, z0: 15, z1: 50, weight: 3 },
  { kind: 'circle', cx: PLAZA.x, cz: PLAZA.z, r: PLAZA.r, weight: 2 },
];

const WANDER_TOTAL = WANDER_AREAS.reduce((sum, a) => sum + a.weight, 0);

/** Clear of the two centrepieces — the SALE island and the directory pylon. */
export function isClearSpot(x, z) {
  if (Math.hypot(x, z) < 5.5) return false;
  if (Math.hypot(x - PLAZA.x, z - PLAZA.z) < 4.2) return false;
  return true;
}

/** A random standable point somewhere in the mart. */
export function randomSpot(inset = 3, out = new THREE.Vector3()) {
  for (let tries = 0; tries < 30; tries++) {
    let pick = Math.random() * WANDER_TOTAL;
    const area = WANDER_AREAS.find((a) => (pick -= a.weight) <= 0) ?? WANDER_AREAS[0];
    if (area.kind === 'circle') {
      const ang = Math.random() * Math.PI * 2;
      const rad = Math.sqrt(Math.random()) * (area.r - inset);
      out.set(area.cx + Math.cos(ang) * rad, 0, area.cz + Math.sin(ang) * rad);
    } else {
      out.set(
        area.x0 + inset + Math.random() * (area.x1 - area.x0 - inset * 2),
        0,
        area.z0 + inset + Math.random() * (area.z1 - area.z0 - inset * 2)
      );
    }
    if (isClearSpot(out.x, out.z)) return out;
  }
  return out;
}

const CARD_W = 1.4;
const CARD_H = CARD_W * (640 / 512);
const PED_H = 1.0;

/* ---------------- zone layout ---------------- */

const ZONES = {
  nike:       { slots: [[-19.5, -8.25], [-19.5, -2.75], [-19.5, 2.75], [-19.5, 8.25]], rotY: Math.PI / 2 },
  jordan:     { slots: [[-6, -11.5], [0, -11.5], [6, -11.5]], rotY: 0 },
  adidas:     { slots: [[19.5, 8.25], [19.5, 2.75], [19.5, -2.75], [19.5, -8.25]], rotY: -Math.PI / 2 },
  newbalance: { slots: [[6.5, 22], [6.5, 31], [6.5, 40]], rotY: Math.PI / 2 },
  asics:      { slots: [[19.5, 20], [19.5, 27.5], [19.5, 35], [19.5, 42.5]], rotY: -Math.PI / 2 },
  converse:   { slots: [[8, 46.5], [13, 46.5], [18, 46.5]], rotY: Math.PI },
};

const SIGNS = {
  nike:       { pos: [-22.88, 5.2, 0], rotY: Math.PI / 2 },
  jordan:     { pos: [0, 5.2, -14.88], rotY: 0 },
  adidas:     { pos: [22.88, 5.2, 0], rotY: -Math.PI / 2 },
  newbalance: { pos: [3.12, 5.2, 31], rotY: Math.PI / 2 },
  asics:      { pos: [22.88, 5.2, 31], rotY: -Math.PI / 2 },
  converse:   { pos: [13, 5.2, 49.88], rotY: Math.PI },
};

// Physical wall positions in this room, in slot order. A category with
// slot_index 0 goes on the first wall, 1 on the second, and so on - the keys
// below are wall names that happen to be named after the launch brands.
export const ZONE_ORDER = ['nike', 'jordan', 'adidas', 'newbalance', 'asics', 'converse'];

/** Where the camera should stand to look at a given category slot. */
export function viewpointForSlot(slot) {
  return VIEWPOINTS[ZONE_ORDER[slot]] ?? VIEWPOINTS.entrance;
}

export const VIEWPOINTS = {
  entrance:   { pos: new THREE.Vector3(0, 0, 12.2),    look: new THREE.Vector3(0, 0, 0) },
  nike:       { pos: new THREE.Vector3(-14, 0, 0),     look: new THREE.Vector3(-20, 0, 0) },
  jordan:     { pos: new THREE.Vector3(0, 0, -6),      look: new THREE.Vector3(0, 0, -12) },
  adidas:     { pos: new THREE.Vector3(14, 0, 0),      look: new THREE.Vector3(20, 0, 0) },
  newbalance: { pos: new THREE.Vector3(11, 0, 31),     look: new THREE.Vector3(5, 0, 31) },
  asics:      { pos: new THREE.Vector3(15, 0, 31),     look: new THREE.Vector3(21, 0, 31) },
  converse:   { pos: new THREE.Vector3(13, 0, 41),     look: new THREE.Vector3(13, 0, 48) },
  sale:       { pos: new THREE.Vector3(0, 0, 7.4),     look: new THREE.Vector3(0, 0, 0) },
  concourse:  { pos: new THREE.Vector3(PLAZA.x, 0, 24.5), look: new THREE.Vector3(PLAZA.x, 0, 31) },
};

/* ---------------- main builder ---------------- */

export function buildShop(scene, camera, directory = []) {
  const interactables = [];
  const productViews = new Map();
  const browsePoints = [];
  const colliders = [{ x: 0, z: 0, r: 4.0 }]; // sale island
  const animated = [];
  const pulsing = [];

  // merged-geometry buckets (one draw call each at the end)
  const metalGeos = [];    // window frames, beams, fixture housings
  const tubeGeos = [];     // fluorescent tubes, main hall (cool white)
  const tubeGeosWing = []; // fluorescent tubes, wing (warm)
  const paneGeos = [];     // glowing window panes
  const markGeos = [];     // yellow floor markings

  function box(arr, w, h, d, x, y, z) {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, y, z);
    arr.push(g);
  }

  /* --- floor: polished large-format tiles, sheen from the env map ---
   * No reflection pass — the glossy look comes from baked polish streaks
   * plus a roughness map against the studio environment. Nearly free. */
  const floorTex = floorTextures();
  const TILE = 4.6; // world units per texture repeat (the sheet holds 2x2 tiles)

  // UVs are driven off WORLD position, not off the slab's own corner, so
  // every slab — rectangular hall, threshold, or round plaza — samples one
  // shared grid and the grout runs straight through every seam.
  function floorMaterial(w, d, x, z) {
    const worldUV = (t) => {
      t.repeat.set(w / TILE, d / TILE);
      t.offset.set((x - w / 2) / TILE, -(z + d / 2) / TILE);
    };
    const map = floorTex.map.clone();
    worldUV(map);
    const roughnessMap = floorTex.roughnessMap.clone();
    worldUV(roughnessMap);
    return new THREE.MeshStandardMaterial({
      map,
      roughnessMap,
      roughness: 1, // the map carries the value (~0.35 base)
      metalness: 0.16,
      envMapIntensity: 1.15,
    });
  }

  function tileFloor(w, d, x, z) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), floorMaterial(w, d, x, z));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.02, z);
    m.receiveShadow = true;
    m.userData = { type: 'floor' };
    scene.add(m);
    interactables.push(m);
  }
  tileFloor(46, 30, 0, 0);
  tileFloor(20, 35, 13, 32.5);

  // Yellow showroom guide markings (merged) — one continuous circuit whose
  // spacing is a single rule, so the lanes read as architecture and not as
  // decoration:  a SIDE lane runs 2.5 out from its product row, an END line
  // 1.3 in front of it.  That makes every lane sit 6 off its wall and stay
  // symmetric about its hall's centre line (x=0 main, x=13 wing).
  // Nothing crosses the mouth of the wing — the return line stops on the
  // New Balance lane and hands off, leaving the junction open.  Every
  // cross-line runs lane-to-lane and dead-ends on a lane; none of them
  // overhangs past a corner out to a wall.
  for (const [w, d, x, z] of [
    [34, 0.09, 0, -10.2],      // Jordan end line       x -17..17
    [26, 0.09, -4, 11.6],      // main return line      x -17..9
    [8, 0.09, 13, 45.2],       // Converse end line     x   9..17
    [0.09, 21.8, -17, 0.7],    // Nike lane             z -10.2..11.6
    [0.09, 55.4, 17, 17.5],    // adidas + ASICS lane   z -10.2..45.2
    [0.09, 33.6, 9, 28.4],     // New Balance lane      z  11.6..45.2
  ]) {
    const g = new THREE.PlaneGeometry(w, d);
    g.rotateX(-Math.PI / 2);
    g.translate(x, 0.035, z);
    markGeos.push(g);
  }

  /* --- walls (cheap matte Lambert — they're big screen area) --- */
  const brickTex = brickTexture();
  const concTex = concreteTexture();

  function wall(kind, w, pos, rotY, h = HALL.h) {
    const src = kind === 'brick' ? brickTex : concTex;
    const mat = new THREE.MeshLambertMaterial({ map: src.clone() });
    mat.map.repeat.set(
      kind === 'brick' ? w / 4.4 : w / 6,
      (kind === 'brick' ? 2.8 : 1.4) * (h / HALL.h)
    );
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(...pos);
    m.rotation.y = rotY;
    m.receiveShadow = true;
    scene.add(m);
  }
  wall('brick', 46, [0, 4, -15], 0);                    // north
  wall('conc', 30, [-23, 4, 0], Math.PI / 2);           // west (main)
  wall('conc', 65, [23, 4, 17.5], -Math.PI / 2);        // east (full length)
  // South wall — split around the SoleSpace storefront. Two matching brick
  // piers, then a 12.93-wide glazed bay with the sign band over it: the
  // wall reads 6.53 | 12.93 | 6.53 across its 26.
  const pierW = PLAZA.x - GATE_HW + 23;
  wall('brick', pierW, [-23 + pierW / 2, 4, STORE_Z], Math.PI);
  wall('brick', pierW, [3 - pierW / 2, 4, STORE_Z], Math.PI);
  wall('brick', GATE_HW * 2, [PLAZA.x, (HALL.h + BAY_H) / 2, STORE_Z], Math.PI, HALL.h - BAY_H);
  wall('conc', 35, [3, 4, 32.5], Math.PI / 2);          // wing west
  wall('brick', 20, [13, 4, 50], Math.PI);              // wing south

  /* --- ceilings, beams, fluorescent fixtures --- */
  const ceilTex = concreteTexture([52, 54, 58]);
  function ceilingPlane(w, d, x, z) {
    // a touch of emissive so the soffit reads as dark concrete rather than a
    // void — nothing in the hall throws light upward
    const mat = new THREE.MeshLambertMaterial({ map: ceilTex.clone(), emissive: 0x15161a });
    mat.map.repeat.set(w / 6, d / 6);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    m.rotation.x = Math.PI / 2;
    m.position.set(x, HALL.h, z);
    scene.add(m);
  }
  ceilingPlane(46, 30, 0, 0);
  ceilingPlane(20, 35, 13, 32.5);

  function beamRow(span, cx, cz, fixturesX, tubeArr) {
    box(metalGeos, span, 0.55, 0.38, cx, HALL.h - 0.28, cz);
    for (const fx of fixturesX) {
      box(metalGeos, 4.6, 0.1, 0.42, fx, HALL.h - 0.6, cz);
      box(tubeArr, 4.4, 0.05, 0.3, fx, HALL.h - 0.66, cz);
    }
  }
  for (const bz of [-12, -6, 0, 6, 12]) beamRow(46, 0, bz, [-12, 0, 12], tubeGeos);
  for (const bz of [18, 24, 30, 36, 42, 48]) beamRow(20, 13, bz, [8, 18], tubeGeosWing);

  /* --- industrial windows --- */
  const shaftTex = shaftGradientTexture();

  function addWindow(x, wallZ, withShaft) {
    const dir = wallZ < 0 ? 1 : -1; // faces into the room
    const z = wallZ + dir * 0.06;
    const W = 4.6, H = 3.4, cy = 4.7;

    const pane = new THREE.PlaneGeometry(W, H);
    if (dir < 0) pane.rotateY(Math.PI);
    pane.translate(x, cy, z);
    paneGeos.push(pane);

    box(metalGeos, W + 0.24, 0.24, 0.18, x, cy + H / 2, z);
    box(metalGeos, W + 0.24, 0.24, 0.18, x, cy - H / 2, z);
    for (const off of [-W / 2, -W / 6, W / 6, W / 2]) {
      box(metalGeos, 0.14, H + 0.2, 0.18, x + off, cy, z);
    }
    for (const off of [-H / 6, H / 6]) {
      box(metalGeos, W, 0.1, 0.16, x, cy + off, z);
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
  addWindow(-10, -15, true);
  addWindow(10, -15, true);
  addWindow(6.5, 50, false);
  addWindow(19.5, 50, false);

  /* --- flush the merged static geometry (4 draw calls total) --- */
  const metalMesh = new THREE.Mesh(
    mergeGeometries(metalGeos),
    new THREE.MeshLambertMaterial({ color: 0x212327 })
  );
  metalMesh.receiveShadow = true;
  scene.add(metalMesh);

  scene.add(new THREE.Mesh(
    mergeGeometries(tubeGeos),
    new THREE.MeshBasicMaterial({ color: 0xf2f6ff, toneMapped: false })
  ));
  scene.add(new THREE.Mesh(
    mergeGeometries(tubeGeosWing),
    new THREE.MeshBasicMaterial({ color: 0xffe3b8, toneMapped: false })
  ));
  scene.add(new THREE.Mesh(
    mergeGeometries(paneGeos),
    new THREE.MeshBasicMaterial({ color: 0xf6f9ff, toneMapped: false })
  ));
  scene.add(new THREE.Mesh(
    mergeGeometries(markGeos),
    new THREE.MeshBasicMaterial({ color: 0xd9b53f, transparent: true, opacity: 0.75 })
  ));

  /* --- lighting --- */
  scene.add(new THREE.HemisphereLight(0xfff7ec, 0x8a8478, 1.05));

  // The sun's shadow box is small and FOLLOWS THE PLAYER (see main.js) —
  // all the shadow resolution is spent where the camera actually is,
  // which keeps shadows crisp and soft instead of blocky.
  const sun = new THREE.DirectionalLight(0xffeed8, 3.2);
  sun.position.set(6, 16, -10);
  sun.target.position.set(0, 0, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -16;
  sun.shadow.camera.right = 16;
  sun.shadow.camera.top = 16;
  sun.shadow.camera.bottom = -16;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 70;
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.04;
  sun.shadow.camera.layers.enable(1); // characters cast shadows too
  scene.add(sun, sun.target);

  // colored ambience accents — different mood per area, studio style:
  // violet wash over the wing (matches ASICS/NB signage), cool cyan near
  // the entrance, warm amber over the wing's Converse corner
  const wingGlow = new THREE.PointLight(0xb47aff, 60, 28, 1.8);
  wingGlow.position.set(13, 5.6, 28);
  scene.add(wingGlow);
  const entranceGlow = new THREE.PointLight(0x58d4ff, 38, 20, 1.8);
  entranceGlow.position.set(-4, 5.2, 11);
  scene.add(entranceGlow);
  const converseGlow = new THREE.PointLight(0xffb86b, 42, 20, 1.8);
  converseGlow.position.set(13, 5, 46);
  scene.add(converseGlow);

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
      new THREE.MeshLambertMaterial({ color: 0x111318 })
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

  // dead centre of the sign band over the storefront
  addSign('SOLESPACE', '#00e5ff', [PLAZA.x, (HALL.h + BAY_H) / 2, STORE_Z - 0.1], Math.PI, null);

  /* --- pedestal + card factory --- */
  function addPedestal(product, slotPos, rotY, parent, accent) {
    const group = new THREE.Group();
    group.position.copy(slotPos);
    group.rotation.y = rotY;

    const ped = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.52, PED_H, 24),
      new THREE.MeshStandardMaterial({ color: 0xe8e6e1, metalness: 0.1, roughness: 0.4 })
    );
    ped.position.y = PED_H / 2;
    ped.castShadow = true;
    ped.receiveShadow = true;
    ped.userData = { type: 'product', productId: product.id };
    group.add(ped);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.46, 0.028, 8, 36),
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

  /* --- category zones ---
   * Zones are addressed by SLOT, not by brand name, so whatever categories
   * the database hands us drop into the room's physical wall positions. */
  for (const cat of CATEGORIES) {
    const zone = ZONES[ZONE_ORDER[cat.slot]];
    const s = SIGNS[ZONE_ORDER[cat.slot]];
    if (!zone || !s) {
      console.warn(`[shop] no wall slot ${cat.slot} in this room - skipping ${cat.id}`);
      continue;
    }
    const items = productsInCategory(cat.id);
    items.forEach((p, i) => {
      const [x, z] = zone.slots[i % zone.slots.length];
      addPedestal(p, new THREE.Vector3(x, 0, z), zone.rotY, scene, cat.accent);
    });
    addSign(cat.name.toUpperCase(), cat.accent, s.pos, s.rotY, cat.id);

    const mid = zone.slots[Math.floor(zone.slots.length / 2)];
    zoneSpot(mid[0], mid[1], new THREE.Color(cat.accent));
  }

  /* --- highlight island (Sale / Popular / whatever the admin named it) --- */
  const sale = HIGHLIGHT ?? { title: '', accent: '#ff2d55', products: [] };
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
    new THREE.TorusGeometry(3.55, 0.045, 8, 64),
    new THREE.MeshBasicMaterial({ color: sale.accent, toneMapped: false, transparent: true })
  );
  islandRing.rotation.x = Math.PI / 2;
  islandRing.position.y = 0.19;
  island.add(islandRing);
  pulsing.push({ material: islandRing.material, base: 0.8, amp: 0.2, speed: 1.5, phase: 1 });

  const saleItems = sale.products;
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
      map: buildSignTexture(sale.title || 'FEATURED', sale.accent),
      transparent: true, toneMapped: false,
    })
  );
  saleSign.position.set(0, 4.9, 0);
  saleSign.userData = { type: 'sign', zone: 'sale' };
  scene.add(saleSign);
  interactables.push(saleSign);
  pulsing.push({ material: saleSign.material, base: 0.88, amp: 0.12, speed: 2.4, phase: 2 });

  zoneSpot(0, 0, new THREE.Color(sale.accent));

  /* --- the way out: threshold + the shared concourse --- */
  const concourse = buildConcourse(scene, {
    floorMaterial, concTex, shaftTex, interactables, colliders, pulsing, directory,
  });

  /* --- dust motes --- */
  const P_COUNT = 320;
  const pGeo = new THREE.BufferGeometry();
  const pPos = new Float32Array(P_COUNT * 3);
  for (let i = 0; i < P_COUNT; i++) {
    const zone = i % 5; // 0-2 main hall · 3 wing · 4 concourse
    pPos[i * 3 + 1] = Math.random() * (HALL.h - 1) + 0.4;
    if (zone === 4) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * (PLAZA.r - 1);
      pPos[i * 3] = PLAZA.x + Math.cos(a) * r;
      pPos[i * 3 + 2] = PLAZA.z + Math.sin(a) * r;
    } else if (zone === 3) {
      pPos[i * 3] = 3 + Math.random() * 20;
      pPos[i * 3 + 2] = 15 + Math.random() * 34;
    } else {
      pPos[i * 3] = (Math.random() - 0.5) * 44;
      pPos[i * 3 + 2] = (Math.random() - 0.5) * 28;
    }
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
    concourse.update(t, dt);
    saleSign.lookAt(camera.position.x, saleSign.position.y, camera.position.z);

    const arr = pGeo.attributes.position.array;
    for (let i = 0; i < P_COUNT; i++) {
      arr[i * 3 + 1] += dt * 0.14;
      if (arr[i * 3 + 1] > HALL.h - 0.4) arr[i * 3 + 1] = 0.3;
    }
    pGeo.attributes.position.needsUpdate = true;
  }

  return { interactables, productViews, browsePoints, colliders, update, sun, entries: concourse.entries ?? [] };
}
