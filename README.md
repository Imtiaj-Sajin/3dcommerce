# SoleSpace 👟

A virtual sneaker shop you can walk around in — built with Three.js + Vite.

Visitors explore a daylight exhibition hall — brick walls, industrial
windows with sun shafts, a mirror-polished floor — browse sneakers grouped
by category (Running, Basketball, Lifestyle, and a rotating **Limited
Drops** island), and click any product to open a detail view with image
variants, colorways, sizes and a demo cart.

Animated cartoon visitors (KayKit CC0 characters, `public/models/`) wander
the shop with floating name tags, stopping to browse products like players
in a multiplayer lobby.

All environment materials (brick, concrete, tiles) and sneaker artwork are
**generated procedurally** — the only binary assets are the character GLBs.

## Run it

```bash
npm install
npm run dev
```

## Controls

| Action | Input |
| --- | --- |
| Look around | Drag with the mouse / finger |
| Walk | `W A S D` or arrow keys |
| Walk to a spot | Click the floor |
| Jump to a zone | Bottom nav pills, or click a neon wall sign |
| Product details | Click a sneaker card or its pedestal |
| Close / back | `Esc`, ✕, or click the backdrop |

## What's alive

- Intro camera fly-in when the shop opens
- Sunlight pours through the north windows with visible volumetric shafts;
  everything casts soft shadows on the reflective tiled floor
- Animated visitors walk around, browse pedestals, and face the products
- Product cards float and sway above glowing pedestals
- Neon signs pulse; dust motes drift through the light
- The Limited Drops island slowly rotates
- Hovering a card scales it up; picking a colorway in the modal
  **repaints the card in the 3D shop live**

## Structure

```
src/
  main.js          bootstrap, render loop, wiring
  shop.js          the hall: walls, windows, floor mirror, zones, pedestals
  visitors.js      animated wandering characters with name tags
  textures.js      procedural brick / concrete / tile / light-shaft textures
  products.js      catalog data (14 sneakers, 4 categories, colorways)
  sneakerArt.js    procedural SVG sneakers + canvas card/sign textures
  cameraRig.js     drag-look + WASD + smooth glides between zones
  interactions.js  raycast hover/click handling
  ui.js            modal, colorways, sizes, cart drawer, toasts
  style.css        HUD / modal / cart styling
public/models/     KayKit character GLBs (CC0 — see KAYKIT_LICENSE.txt)
```
