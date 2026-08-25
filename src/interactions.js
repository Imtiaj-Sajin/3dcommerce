// Raycast-driven interactivity: hover glow on product cards, clicks on
// products (open modal), neon signs (glide to zone) and the floor (walk).

import * as THREE from 'three';

export class Interactions {
  constructor(camera, dom, interactables, { onProduct, onSign, onFloor }) {
    this.camera = camera;
    this.dom = dom;
    this.interactables = interactables;
    this.onProduct = onProduct;
    this.onSign = onSign;
    this.onFloor = onFloor;

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.hovered = null;        // hovered product card mesh
    this.scaleTargets = new Map();

    dom.addEventListener('pointermove', (e) => this._updatePointer(e));
    dom.addEventListener('pointerup', (e) => {
      this._updatePointer(e);
      this._click();
    });
  }

  /** rig.wasClick is injected by main so drags don't trigger clicks. */
  setClickGuard(fn) {
    this.clickGuard = fn;
  }

  _updatePointer(e) {
    this.pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    this.pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
  }

  _cast() {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.interactables, false);
    return hits.length ? hits[0] : null;
  }

  _click() {
    if (this.clickGuard && !this.clickGuard()) return;
    const hit = this._cast();
    if (!hit) return;
    const ud = hit.object.userData;
    if (ud.type === 'product') this.onProduct(ud.productId);
    else if (ud.type === 'sign') this.onSign(ud.zone);
    else if (ud.type === 'floor') this.onFloor(hit.point);
  }

  update(dt) {
    const hit = this._cast();
    const ud = hit?.object?.userData;

    let newHover = null;
    if (ud?.type === 'product' && hit.object.geometry.type === 'PlaneGeometry') {
      newHover = hit.object;
    }
    if (newHover !== this.hovered) {
      if (this.hovered) this.scaleTargets.set(this.hovered, 1);
      if (newHover) this.scaleTargets.set(newHover, 1.08);
      this.hovered = newHover;
    }
    this.dom.style.cursor =
      ud?.type === 'product' || ud?.type === 'sign' ? 'pointer' : 'grab';

    // ease card scales toward targets
    const k = 1 - Math.exp(-dt * 10);
    for (const [mesh, target] of this.scaleTargets) {
      const s = mesh.scale.x + (target - mesh.scale.x) * k;
      mesh.scale.setScalar(s);
      if (Math.abs(s - target) < 0.001 && target === 1) this.scaleTargets.delete(mesh);
    }
  }
}
