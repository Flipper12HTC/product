import * as THREE from 'three';
import type { DecoEffectKind, DecoTrigger } from '../../domain/deco-event';
import type { EffectsRunner } from '../../application/renderer-orchestrator';

interface Particle {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
}

const EFFECT_COLOR: Record<DecoEffectKind, number> = {
  bumper: 0xec4899,
  slingshot: 0xeab308,
  drain: 0x3b82f6,
  'game-over': 0xa855f7,
};

const SPAWN_COUNT: Record<DecoEffectKind, number> = {
  bumper: 24,
  slingshot: 16,
  drain: 30,
  'game-over': 80,
};

export function createParticleEffects(canvas: HTMLCanvasElement): EffectsRunner {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 0, 18);
  camera.lookAt(0, 0, 0);
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));

  const particles: Particle[] = [];
  const geometry = new THREE.SphereGeometry(0.15, 8, 8);

  function spawn(trigger: DecoTrigger): void {
    const color = EFFECT_COLOR[trigger.kind];
    const count = SPAWN_COUNT[trigger.kind];
    const material = new THREE.MeshBasicMaterial({ color, transparent: true });

    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(trigger.at.x, 0, trigger.at.z);
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 4;
      const velocity = new THREE.Vector3(
        Math.cos(angle) * speed,
        (Math.random() - 0.3) * speed,
        Math.sin(angle) * speed,
      );
      scene.add(mesh);
      particles.push({ mesh, velocity, life: 1 });
    }
  }

  function tick(deltaMs: number): void {
    const dt = deltaMs / 1000;
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      if (!p) continue;
      p.mesh.position.addScaledVector(p.velocity, dt);
      p.velocity.multiplyScalar(0.96);
      p.life -= dt * 0.8;
      const mat = p.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(p.life, 0);
      if (p.life <= 0) {
        scene.remove(p.mesh);
        particles.splice(i, 1);
      }
    }
    renderer.render(scene, camera);
  }

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return {
    trigger: spawn,
    tick,
  };
}
