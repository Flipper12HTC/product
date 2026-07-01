import * as THREE from 'three';

export function createSpongeMaterial(): THREE.MeshStandardMaterial {
  const SIZE = 512;
  const rng  = (seed: number) => { let s = seed; return () => { s = (s * 16807 + 0) % 2147483647; return (s - 1) / 2147483646; }; };
  const rand = rng(42);

  const PORES = 140;
  const pores: { x: number; y: number; r: number; ry: number; a: number }[] = [];
  for (let i = 0; i < PORES; i++) {
    pores.push({
      x:  rand() * SIZE,
      y:  rand() * SIZE,
      r:  5  + rand() * 18,
      ry: 0.55 + rand() * 0.7,
      a:  rand() * Math.PI,
    });
  }

  // ── Canvas diffuse : jaune SpongeBob + pores sombres ──
  const dc  = document.createElement('canvas');
  dc.width  = dc.height = SIZE;
  const dctx = dc.getContext('2d')!;

  const imgD = dctx.createImageData(SIZE, SIZE);
  for (let py = 0; py < SIZE; py++) {
    for (let px = 0; px < SIZE; px++) {
      const n = 0.5
        + 0.12 * Math.sin(px * 0.045 + py * 0.03 + 1.2)
        + 0.07 * Math.cos(px * 0.08  - py * 0.06 + 2.5);
      const idx = (py * SIZE + px) * 4;
      imgD.data[idx]     = Math.round(248 + n * 7);
      imgD.data[idx + 1] = Math.round(208 + n * 15);
      imgD.data[idx + 2] = Math.round(30  + n * 20);
      imgD.data[idx + 3] = 255;
    }
  }
  dctx.putImageData(imgD, 0, 0);

  for (const p of pores) {
    dctx.save();
    dctx.translate(p.x, p.y);
    dctx.rotate(p.a);
    dctx.scale(1, p.ry);
    dctx.translate(-p.x, -p.y);
    const g = dctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
    g.addColorStop(0,    'rgba(38, 16, 2, 0.98)');
    g.addColorStop(0.45, 'rgba(70, 30, 5, 0.85)');
    g.addColorStop(0.75, 'rgba(130, 75, 10, 0.55)');
    g.addColorStop(0.90, 'rgba(200, 150, 30, 0.22)');
    g.addColorStop(1,    'rgba(255, 220, 50, 0)');
    dctx.fillStyle = g;
    dctx.beginPath();
    dctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    dctx.fill();
    dctx.restore();
  }
  const diffTex = new THREE.CanvasTexture(dc);
  diffTex.wrapS = diffTex.wrapT = THREE.RepeatWrapping;
  diffTex.colorSpace = THREE.SRGBColorSpace;

  // ── Canvas bump : noir dans les pores, blanc sur les rebords ──
  const bc  = document.createElement('canvas');
  bc.width  = bc.height = SIZE;
  const bctx = bc.getContext('2d')!;

  const imgB = bctx.createImageData(SIZE, SIZE);
  for (let py = 0; py < SIZE; py++) {
    for (let px = 0; px < SIZE; px++) {
      const n = 128 + 18 * Math.sin(px * 0.09 + py * 0.07)
                    + 10 * Math.cos(px * 0.18 - py * 0.13 + 1.4);
      const idx = (py * SIZE + px) * 4;
      imgB.data[idx] = imgB.data[idx + 1] = imgB.data[idx + 2] = Math.round(n);
      imgB.data[idx + 3] = 255;
    }
  }
  bctx.putImageData(imgB, 0, 0);

  for (const p of pores) {
    bctx.save();
    bctx.translate(p.x, p.y);
    bctx.rotate(p.a);
    bctx.scale(1, p.ry);
    bctx.translate(-p.x, -p.y);
    const rim = bctx.createRadialGradient(p.x, p.y, p.r * 0.6, p.x, p.y, p.r * 1.3);
    rim.addColorStop(0,   'rgba(255,255,255,0)');
    rim.addColorStop(0.5, 'rgba(255,255,255,0.65)');
    rim.addColorStop(1,   'rgba(255,255,255,0)');
    bctx.fillStyle = rim;
    bctx.beginPath();
    bctx.arc(p.x, p.y, p.r * 1.3, 0, Math.PI * 2);
    bctx.fill();
    const hole = bctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 0.85);
    hole.addColorStop(0,   'rgba(0,0,0,0.98)');
    hole.addColorStop(0.6, 'rgba(0,0,0,0.80)');
    hole.addColorStop(1,   'rgba(0,0,0,0)');
    bctx.fillStyle = hole;
    bctx.beginPath();
    bctx.arc(p.x, p.y, p.r * 0.85, 0, Math.PI * 2);
    bctx.fill();
    bctx.restore();
  }
  const bumpTex = new THREE.CanvasTexture(bc);
  bumpTex.wrapS = bumpTex.wrapT = THREE.RepeatWrapping;

  return new THREE.MeshStandardMaterial({
    map:      diffTex,
    bumpMap:  bumpTex,
    bumpScale: 4.0,
    color:    new THREE.Color(0xffe040),
    roughness: 0.78,
    metalness: 0.0,
    envMapIntensity: 0.9,
    side: THREE.DoubleSide,
  });
}
