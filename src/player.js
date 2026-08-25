// The player — a third-person character you steer with WASD (relative to
// the camera) or by clicking the floor / zone buttons (auto-walk with
// routing through the L-junction).

import * as THREE from 'three';
import { damp, angleLerp, resolveCollisions } from './rig.js';
import { clampToHall, routeTo } from './shop.js';

const WALK_SPEED = 2.6;
const RUN_SPEED = 5.0;

export class Player {
  constructor(rig, scene) {
    this.root = rig.root;
    this.mixer = rig.mixer;
    this.actions = rig.actions;
    this.current = null;
    this.heading = Math.PI;
    this.velocity = new THREE.Vector2(); // xz
    this.path = []; // auto-walk waypoints
    this.keys = new Set();

    this.root.position.set(0, 0, 12.2);
    this.root.rotation.y = this.heading;
    scene.add(this.root);

    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    this.play('Idle', 0);
  }

  play(name, fade = 0.22) {
    if (this.current === name || !this.actions[name]) return;
    const next = this.actions[name];
    next.reset().fadeIn(fade).play();
    if (this.current && this.actions[this.current]) this.actions[this.current].fadeOut(fade);
    this.current = name;
  }

  /** Auto-walk to a floor point (routes through the L junction if needed). */
  setDestination(point) {
    this.path = routeTo(this.root.position, point);
  }

  get isMoving() {
    return this.velocity.length() > 0.3;
  }

  update(dt, cameraYaw, colliders) {
    const p = this.root.position;

    // --- keyboard input, relative to the camera ---
    let ix = 0, iy = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) iy += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) iy -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) ix += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) ix -= 1;
    const running = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');

    let targetVX = 0, targetVZ = 0;

    if (ix !== 0 || iy !== 0) {
      this.path = []; // manual input cancels auto-walk
      const fx = -Math.sin(cameraYaw), fz = -Math.cos(cameraYaw);
      const rx = -fz, rz = fx;
      let wx = fx * iy + rx * ix;
      let wz = fz * iy + rz * ix;
      const len = Math.hypot(wx, wz) || 1;
      const speed = running ? RUN_SPEED : WALK_SPEED;
      targetVX = (wx / len) * speed;
      targetVZ = (wz / len) * speed;
    } else if (this.path.length) {
      const wp = this.path[0];
      const dx = wp.x - p.x;
      const dz = wp.z - p.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.35) {
        this.path.shift();
      } else {
        const speed = dist > 9 ? RUN_SPEED : WALK_SPEED;
        targetVX = (dx / dist) * speed;
        targetVZ = (dz / dist) * speed;
      }
    }

    const k = damp(8, dt);
    this.velocity.x += (targetVX - this.velocity.x) * k;
    this.velocity.y += (targetVZ - this.velocity.y) * k;

    p.x += this.velocity.x * dt;
    p.z += this.velocity.y * dt;

    resolveCollisions(p, colliders);
    const c = clampToHall(p.x, p.z, 1.4);
    p.x = c.x;
    p.z = c.z;
    p.y = 0;

    // face the movement direction, lazily
    const speed = this.velocity.length();
    if (speed > 0.25) {
      const target = Math.atan2(this.velocity.x, this.velocity.y);
      this.heading = angleLerp(this.heading, target, damp(10, dt));
      this.root.rotation.y = this.heading;
    }

    if (speed > 3.4) this.play('Running_A');
    else if (speed > 0.3) this.play('Walking_A');
    else this.play('Idle', 0.3);

    this.mixer.update(dt);
  }
}
