import * as THREE from 'three';
import { makeBubbleSprite } from './bubbles';

export interface BallTrail {
  add: (pos: { x: number; y: number; z: number }) => void;
  tick: (dt: number) => void;
}

const POOL = 36;
const DURATION = 0.6;

export function createBallTrail(scene: THREE.Scene): BallTrail {
  const tex = makeBubbleSprite();

  const pool: {
    mat: THREE.SpriteMaterial;
    sprite: THREE.Sprite;
    life: number;
    vy: number;
  }[] = [];

  for (let i = 0; i < POOL; i++) {
    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.setScalar(0);
    sprite.visible = false;
    scene.add(sprite);
    pool.push({ mat, sprite, life: -1, vy: 0 });
  }

  let frame = 0;

  return {
    add(pos: { x: number; y: number; z: number }): void {
      if (frame++ % 2 !== 0) return;
      const p = pool.find((pp) => pp.life <= 0);
      if (!p) return;
      p.sprite.position.set(
        pos.x + (Math.random() - 0.5) * 0.14,
        pos.y + 0.08,
        pos.z + (Math.random() - 0.5) * 0.14,
      );
      p.sprite.scale.setScalar(0.11 + Math.random() * 0.09);
      p.sprite.visible = true;
      p.mat.opacity = 0.8;
      p.life = DURATION;
      p.vy = 0.55 + Math.random() * 0.75;
    },
    tick(dt: number): void {
      for (const p of pool) {
        if (p.life <= 0) continue;
        p.life -= dt;
        if (p.life <= 0) {
          p.sprite.visible = false;
          p.mat.opacity = 0;
        } else {
          p.mat.opacity = (p.life / DURATION) * 0.8;
          p.sprite.position.y += p.vy * dt;
        }
      }
    },
  };
}
