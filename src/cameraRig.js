// First-person camera rig: drag to look, WASD to walk, smooth glides to
// zone viewpoints. Keeps the visitor inside the hall and off the island.

import * as THREE from 'three';
import { HALL } from './shop.js';

const EYE = 1.7;
const BOUNDS = { x: HALL.w / 2 - 2.2, zMin: -HALL.d / 2 + 2.2, zMax: HALL.d / 2 - 1.6 };
const ISLAND_KEEPOUT = 4.4;
const PITCH_LIMIT = Math.PI / 2 - 0.12;

export class CameraRig {
  constructor(camera, domElement) {
    this.camera = camera;
    this.dom = domElement;

    this.pos = new THREE.Vector3(0, EYE, 13.2);
    this.targetPos = this.pos.clone();
    this.yaw = 0;          // 0 looks toward -z
    this.pitch = 0;
    this.targetYaw = 0;
    this.targetPitch = 0;

    this.dragging = false;
    this.moved = 0;
    this.keys = new Set();

    this._bind();
    this._apply();
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
      this.targetYaw -= dx * 0.0035;
      this.targetPitch = THREE.MathUtils.clamp(
        this.targetPitch - dy * 0.0028, -PITCH_LIMIT, PITCH_LIMIT
      );
    });
    const end = () => { this.dragging = false; };
    dom.addEventListener('pointerup', end);
    dom.addEventListener('pointercancel', end);

    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  /** True when the last pointer gesture was a click, not a drag. */
  wasClick() {
    return this.moved < 8;
  }

  /** Instantly place the camera (used for the intro shot). */
  teleport(pos, look) {
    this.pos.copy(pos);
    this.targetPos.copy(pos);
    const { yaw, pitch } = this._anglesToward(pos, look);
    this.yaw = this.targetYaw = yaw;
    this.pitch = this.targetPitch = pitch;
    this._apply();
  }

  /** Smoothly glide to a viewpoint { pos, look }. */
  navigateTo(view) {
    this.targetPos.copy(view.pos);
    const { yaw, pitch } = this._anglesToward(view.pos, view.look);
    // unwrap yaw so we take the short way around
    const twoPi = Math.PI * 2;
    let target = yaw;
    while (target - this.targetYaw > Math.PI) target -= twoPi;
    while (target - this.targetYaw < -Math.PI) target += twoPi;
    this.targetYaw = target;
    this.targetPitch = pitch;
  }

  /** Walk toward a clicked floor point, keeping the current view direction. */
  walkTo(point) {
    this.targetPos.set(point.x, EYE, point.z);
    this._clampTarget();
  }

  _anglesToward(from, look) {
    const dir = new THREE.Vector3().subVectors(look, from);
    const yaw = Math.atan2(-dir.x, -dir.z);
    const pitch = Math.atan2(dir.y, Math.hypot(dir.x, dir.z));
    return { yaw, pitch: THREE.MathUtils.clamp(pitch, -PITCH_LIMIT, PITCH_LIMIT) };
  }

  _clampTarget() {
    const t = this.targetPos;
    t.x = THREE.MathUtils.clamp(t.x, -BOUNDS.x, BOUNDS.x);
    t.z = THREE.MathUtils.clamp(t.z, BOUNDS.zMin, BOUNDS.zMax);
    const len = Math.hypot(t.x, t.z);
    if (len < ISLAND_KEEPOUT && len > 0.001) {
      t.x = (t.x / len) * ISLAND_KEEPOUT;
      t.z = (t.z / len) * ISLAND_KEEPOUT;
    }
    t.y = EYE;
  }

  update(dt) {
    // WASD walking relative to current yaw
    const speed = 5.2 * dt;
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    let walked = false;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) { this.targetPos.addScaledVector(fwd, speed); walked = true; }
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) { this.targetPos.addScaledVector(fwd, -speed); walked = true; }
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) { this.targetPos.addScaledVector(right, -speed); walked = true; }
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) { this.targetPos.addScaledVector(right, speed); walked = true; }
    if (walked) this._clampTarget();

    // Exponential smoothing toward targets
    const k = 1 - Math.exp(-dt * 4.2);
    this.pos.lerp(this.targetPos, k);
    this.yaw += (this.targetYaw - this.yaw) * k;
    this.pitch += (this.targetPitch - this.pitch) * k;

    this._apply();
  }

  _apply() {
    this.camera.position.copy(this.pos);
    this.camera.rotation.set(0, 0, 0);
    this.camera.rotateY(this.yaw);
    this.camera.rotateX(this.pitch);
  }
}
