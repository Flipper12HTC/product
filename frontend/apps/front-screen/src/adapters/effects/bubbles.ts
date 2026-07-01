import * as THREE from 'three';
import { TABLE } from '@flipper/contracts';

export function makeBubbleSprite(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 6, 32, 32, 28);
  g.addColorStop(0,   'rgba(135,206,250,0)');
  g.addColorStop(0.6, 'rgba(135,206,250,0.07)');
  g.addColorStop(0.8, 'rgba(180,230,255,0.7)');
  g.addColorStop(1,   'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(32, 32, 28, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  ctx.arc(24, 24, 4, 0, Math.PI * 2);
  ctx.fill();
  return new THREE.CanvasTexture(c);
}

export function createBubbleLayer(
  scene: THREE.Scene,
  count: number,
  size: number,
  opacity: number,
): (t: number) => void {
  const px = new Float32Array(count);
  const py = new Float32Array(count);
  const pz = new Float32Array(count);
  const vy = new Float32Array(count);
  const wf = new Float32Array(count);
  const wa = new Float32Array(count);
  const wp = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    px[i] = (Math.random() - 0.5) * (TABLE.width + 3);
    py[i] = Math.random() * 26 - 3;
    pz[i] = (Math.random() - 0.5) * (TABLE.depth + 3);
    vy[i] = 0.3 + Math.random() * 0.9;
    wf[i] = 0.35 + Math.random() * 0.75;
    wa[i] = 0.07 + Math.random() * 0.22;
    wp[i] = Math.random() * Math.PI * 2;
  }

  const positions = new Float32Array(count * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const mat = new THREE.PointsMaterial({
    size,
    map: makeBubbleSprite(),
    transparent: true,
    opacity,
    sizeAttenuation: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  scene.add(new THREE.Points(geo, mat));
  const attr = geo.attributes['position'] as THREE.BufferAttribute;
  const WRAP = 28;

  return (t: number) => {
    for (let i = 0; i < count; i++) {
      const x = (px[i] ?? 0) + Math.sin(t * (wf[i] ?? 0) + (wp[i] ?? 0)) * (wa[i] ?? 0);
      const y = (((py[i] ?? 0) + t * (vy[i] ?? 0)) % WRAP) - 3;
      const z = pz[i] ?? 0;
      attr.setXYZ(i, x, y, z);
    }
    attr.needsUpdate = true;
  };
}
