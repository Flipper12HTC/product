import * as THREE from 'three';
import type { DecoEffectKind, DecoTrigger } from '../../domain/deco-event';

interface Particle {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
}

export interface ParticleSystem {
  spawn: (trigger: DecoTrigger) => void;
  tick: (deltaMs: number) => void;
  dispose: () => void;
}

const EFFECT_COLOR: Record<DecoEffectKind, number> = {
  bumper: 0xff79b0,
  slingshot: 0xffec1f,
  drain: 0x6ed8ff,
  'game-over': 0xe23636,
};

const SPAWN_COUNT: Record<DecoEffectKind, number> = {
  bumper: 24,
  slingshot: 16,
  drain: 30,
  'game-over': 90,
};

/**
 * Confetti-style particle bursts that live inside a shared THREE scene. The
 * owner (deco-scene) drives rendering; this only manages particle lifetimes.
 */
export function createParticleSystem(scene: THREE.Scene): ParticleSystem {
  const particles: Particle[] = [];
  const geometry = new THREE.SphereGeometry(0.16, 8, 8);
  const materials = new Map<DecoEffectKind, THREE.MeshBasicMaterial>();

  function materialFor(kind: DecoEffectKind): THREE.MeshBasicMaterial {
    let mat = materials.get(kind);
    if (!mat) {
      mat = new THREE.MeshBasicMaterial({ color: EFFECT_COLOR[kind], transparent: true });
      materials.set(kind, mat);
    }
    return mat;
  }

  function spawn(trigger: DecoTrigger): void {
    const count = SPAWN_COUNT[trigger.kind];
    // Each burst gets its own material instance so opacity can fade per-burst.
    const material = materialFor(trigger.kind).clone();

    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(trigger.at.x, trigger.at.z * 0.4 + 1.5, 0);
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 4;
      const velocity = new THREE.Vector3(
        Math.cos(angle) * speed,
        Math.abs(Math.sin(angle)) * speed + 1,
        (Math.random() - 0.5) * speed,
      );
      scene.add(mesh);
      particles.push({ mesh, velocity, life: 1 });
    }
  }

  function tick(deltaMs: number): void {
    const dt = Math.min(deltaMs, 64) / 1000;
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      if (!p) continue;
      p.mesh.position.addScaledVector(p.velocity, dt);
      p.velocity.y -= 4 * dt; // gentle gravity
      p.velocity.multiplyScalar(0.97);
      p.life -= dt * 0.7;
      const mat = p.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(p.life, 0);
      if (p.life <= 0) {
        scene.remove(p.mesh);
        mat.dispose();
        particles.splice(i, 1);
      }
    }
  }

  function dispose(): void {
    for (const p of particles) {
      scene.remove(p.mesh);
      (p.mesh.material as THREE.Material).dispose();
    }
    particles.length = 0;
    geometry.dispose();
    for (const m of materials.values()) m.dispose();
    materials.clear();
  }

  return { spawn, tick, dispose };
}
