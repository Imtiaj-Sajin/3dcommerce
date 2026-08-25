# SoleSpace 👟

A virtual sneaker shop you can walk around in — built with Three.js + Vite.

Visitors explore a neon exhibition hall, browse sneakers grouped by category
(Running, Basketball, Lifestyle, and a rotating **Limited Drops** island),
and click any product to open a detail view with image variants, colorways,
sizes and a demo cart.

All sneaker artwork is **generated procedurally as SVG** — the project has
zero external image assets.

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
- Product cards float and sway above glowing pedestals
- Neon signs and light strips pulse; dust drifts through the spotlights
- The Limited Drops island slowly rotates
- Hovering a card scales it up; picking a colorway in the modal
  **repaints the card in the 3D shop live**

## Structure

```
src/
  main.js          bootstrap, render loop, wiring
  shop.js          the 3D hall: zones, pedestals, signs, lights, particles
  products.js      catalog data (14 sneakers, 4 categories, colorways)
  sneakerArt.js    procedural SVG sneakers + canvas card/sign textures
  cameraRig.js     drag-look + WASD + smooth glides between zones
  interactions.js  raycast hover/click handling
  ui.js            modal, colorways, sizes, cart drawer, toasts
  style.css        HUD / modal / cart styling
```
