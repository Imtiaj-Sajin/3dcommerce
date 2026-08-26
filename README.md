# Meta Mart

A virtual sneaker shop you walk through in third person — built with
Three.js + Vite.

You play a character (KayKit CC0 model) exploring an **L-shaped daylight
showroom**: brick walls, industrial windows with sun shafts, ceiling beams
with fluorescent strips, and a polished large-format stone floor. Sneakers are shown as
**real product photos** on floating display cards, grouped into brand zones
— Nike, Jordan, adidas in the main hall, New Balance, ASICS, Converse in
the wing, plus a rotating **SALE** island in the center. NPC visitors with
name tags wander both halls and stop to browse, like a multiplayer lobby.

> Product photos and brand names are used for demo/portfolio purposes only.

## Run it

```bash
npm install
npm run dev
```

## Controls

| Action | Input |
| --- | --- |
| Walk | `W A S D` / arrow keys (camera-relative) |
| Run | hold `Shift` |
| Orbit camera | drag with the mouse / finger |
| Zoom | mouse wheel |
| Walk to a spot | click the floor |
| Go to a brand zone | bottom nav pills, or click a neon wall sign |
| Product details | click a sneaker card or its pedestal |
| Close / back | `Esc`, ✕, or click the backdrop |

## What's alive

- Third-person chase camera with smooth easing and an intro pull-in
- Sunlight pours through the windows with visible volumetric shafts;
  everything casts soft shadows on the glossy stone floor
- Animated visitors walk both halls, browse pedestals, face the products
- Product cards float and sway above glowing pedestals
- Neon brand signs pulse; dust motes drift through the light
- The SALE island slowly rotates, with strikethrough sale pricing

## Structure

```text
src/
  main.js          bootstrap, render loop, wiring
  shop.js          the L-shaped hall + zones, movement helpers (routing)
  player.js        third-person character controller (WASD + click-to-walk)
  cameraRig.js     chase camera (orbit, zoom, wall clamping)
  visitors.js      NPC visitors wandering both halls
  rig.js           shared character rig utilities (GLB load, name tags)
  textures.js      procedural brick / concrete / tile / light-shaft textures
  products.js      catalog: 25 real sneakers across 6 brands + sale
  sneakerArt.js    photo product-card textures + neon sign textures
  interactions.js  raycast hover/click handling
  ui.js            modal, sizes, sale pricing, cart drawer, toasts
  style.css        HUD / modal / cart styling
public/
  models/          KayKit character GLBs (CC0 — see KAYKIT_LICENSE.txt)
  products/        downloaded product photos (demo use)
```
