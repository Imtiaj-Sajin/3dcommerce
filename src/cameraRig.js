// Third-person chase camera: orbits the player with drag, zooms with the
// wheel, and eases smoothly wherever the player goes.

import * as THREE from 'three';
import { damp } from './rig.js';
import { clampToHall } from './shop.js';

const PITCH_MIN = -0.1;
const PITCH_MAX = 1.15;
const DIST_MIN = 2.6;
const DIST_MAX = 9;

export class ThirdPersonCamera {
  constructor(camera, domElement) {
    this.camera = camera;
    this.dom = domElement;

    this.yaw = 0;
    this.pitch = 0.85;   // intro starts high…
    this.dist = 16;      // …and far away
    this.targetYaw = 0;
    this.targetPitch = 0.34;
    this.targetDist = 4.8;

    this.focus = new THREE.Vector3(0, 1.5, 12.2);

    this.dragging = false;
    this.moved = 0;

    this._bind();
  }

  _bind() {
    const dom = this.dom;
    dom.addEventListener('pointerdown', (e) => {
      this.dragging = true;
      this.moved = 0;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      dom.setPointerCapture(e.pointerId);
    });
    dom.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      const dx = e.clientX - this.lastX;
      const dy = e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.moved += Math.abs(dx) + Math.abs(dy);
      this.targetYaw -= dx * 0.0042;
      this.targetPitch = THREE.MathUtils.clamp(
        this.targetPitch + dy * 0.003, PITCH_MIN, PITCH_MAX
      );
    });
    const end = () => { this.dragging = false; };
    dom.addEventListener('pointerup', end);
    dom.addEventListener('pointercancel', end);
    dom.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.targetDist = THREE.MathUtils.clamp(
        this.targetDist + e.deltaY * 0.004, DIST_MIN, DIST_MAX
      );
    }, { passive: false });
  }

  /** True when the last pointer gesture was a click, not a drag. */
  wasClick() {
    return this.moved < 8;
  }

  /** Swing the camera to look in a given ground direction (for zone nav). */
  faceDirection(dir) {
    let target = Math.atan2(-dir.x, -dir.z);
    const twoPi = Math.PI * 2;
    while (target - this.targetYaw > Math.PI) target -= twoPi;
    while (target - this.targetYaw < -Math.PI) target += twoPi;
    this.targetYaw = target;
  }

  update(dt, playerPos) {
    const k = damp(5.5, dt);
    this.yaw += (this.targetYaw - this.yaw) * k;
    this.pitch += (this.targetPitch - this.pitch) * k;
    this.dist += (this.targetDist - this.dist) * damp(4, dt);

    // smoothed focus point just above the player's shoulders
    this.focus.x += (playerPos.x - this.focus.x) * damp(8, dt);
    this.focus.z += (playerPos.z - this.focus.z) * damp(8, dt);
    this.focus.y += (playerPos.y + 1.5 - this.focus.y) * damp(8, dt);

    const cp = Math.cos(this.pitch);
    const pos = new THREE.Vector3(
      this.focus.x + Math.sin(this.yaw) * cp * this.dist,
      this.focus.y + Math.sin(this.pitch) * this.dist,
      this.focus.z + Math.cos(this.yaw) * cp * this.dist
    );

    // keep the camera inside the hall so it doesn't fly through outer walls
    const c = clampToHall(pos.x, pos.z, 0.5);
    pos.x = c.x;
    pos.z = c.z;
    pos.y = THREE.MathUtils.clamp(pos.y, 0.5, 7.5);

    this.camera.position.copy(pos);
    this.camera.lookAt(this.focus);
  }
}
