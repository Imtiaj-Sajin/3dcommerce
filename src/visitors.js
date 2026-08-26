// NPC visitors — KayKit characters that wander both halls of the L,
// stop to browse sneakers, and carry floating name tags.

import { damp, angleLerp, nameTagSprite, createRig, resolveCollisions } from './rig.js';
import { randomSpot, routeTo, clampToHall } from './shop.js';

const NAMES = ['SoleHunter', 'Kicks4Life', 'Mimi', 'AirWalker_7', 'RetroRae', 'HypeKnight', 'LaceLord', 'Jinx', 'DripDoc'];

class Visitor {
  constructor(rig, browsePoints, colliders, seed) {
    this.root = rig.root;
    this.mixer = rig.mixer;
    this.actions = rig.actions;
    this.current = null;
    this.browsePoints = browsePoints;
    this.colliders = colliders;
    this.speed = 1.15 + (seed % 5) * 0.12;
    this.walkClip = seed % 2 === 0 ? 'Walking_A' : 'Walking_B';
    this.heading = Math.random() * Math.PI * 2;
    this.state = 'idle';
    this.timer = 1 + (seed % 4);
    this.path = [];
    this.lookAtPoint = null;

    // spawn anywhere in the mart — both halls and the concourse
    this.root.position.copy(randomSpot(2.6));
    this.root.rotation.y = this.heading;

    this.play('Idle', 0);
    if (this.actions.Idle) this.actions.Idle.time = seed * 0.7; // desync clones
  }

  play(name, fade = 0.25) {
    if (this.current === name || !this.actions[name]) return;
    const next = this.actions[name];
    next.reset().fadeIn(fade).play();
    if (this.current && this.actions[this.current]) this.actions[this.current].fadeOut(fade);
    this.current = name;
  }

  pickTarget() {
    let target;
    if (this.browsePoints.length && Math.random() < 0.55) {
      const bp = this.browsePoints[Math.floor(Math.random() * this.browsePoints.length)];
      target = bp.pos.clone();
      this.lookAtPoint = bp.look;
    } else {
      this.lookAtPoint = null;
      target = randomSpot(3);
    }
    this.path = routeTo(this.root.position, target);
  }

  update(dt, others) {
    const p = this.root.position;

    if (this.state === 'idle') {
      this.timer -= dt;
      this.play('Idle', 0.35);
      if (this.lookAtPoint) {
        const want = Math.atan2(this.lookAtPoint.x - p.x, this.lookAtPoint.z - p.z);
        this.heading = angleLerp(this.heading, want, damp(5, dt));
        this.root.rotation.y = this.heading;
      }
      if (this.timer <= 0) {
        this.pickTarget();
        this.state = 'walk';
      }
    } else {
      const wp = this.path[0];
      const dx = wp.x - p.x;
      const dz = wp.z - p.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.4) {
        this.path.shift();
        if (!this.path.length) {
          this.state = 'idle';
          this.timer = 2.5 + Math.random() * 5;
        }
      } else {
        const want = Math.atan2(dx, dz);
        this.heading = angleLerp(this.heading, want, damp(4.5, dt));
        this.root.rotation.y = this.heading;
        p.x += Math.sin(this.heading) * this.speed * dt;
        p.z += Math.cos(this.heading) * this.speed * dt;
        this.play(this.walkClip);
      }
    }

    // gentle separation from other visitors
    for (const o of others) {
      if (o === this) continue;
      const dx = p.x - o.root.position.x;
      const dz = p.z - o.root.position.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < 0.81 && d2 > 1e-5) {
        const d = Math.sqrt(d2);
        p.x += (dx / d) * (0.9 - d) * 0.5;
        p.z += (dz / d) * (0.9 - d) * 0.5;
      }
    }

    resolveCollisions(p, this.colliders);
    const c = clampToHall(p.x, p.z, 1.8);
    p.x = c.x;
    p.z = c.z;

    this.mixer.update(dt);
  }
}

/** Spawn wandering visitors from already-loaded character gltfs. */
export function spawnVisitors(gltfs, scene, browsePoints, colliders, count = 8) {
  const visitors = [];
  for (let i = 0; i < count; i++) {
    const rig = createRig(gltfs[i % gltfs.length]);
    const v = new Visitor(rig, browsePoints, colliders, i);
    rig.root.add(nameTagSprite(NAMES[i % NAMES.length]));
    scene.add(rig.root);
    visitors.push(v);
  }
  return {
    update(dt) {
      for (const v of visitors) v.update(dt, visitors);
    },
  };
}
