import * as THREE from 'three';
import { TABLE } from '@flipper/contracts';

export type FloorSampler = { getY: (x: number, z: number) => number; rotX: number };

// ── Caustiques sous-marines animées (overlay canvas sur le sol) ──
export function createCausticOverlay(scene: THREE.Scene, floor: FloorSampler): (t: number) => void {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const tex = new THREE.CanvasTexture(canvas);

  const geo = new THREE.PlaneGeometry(TABLE.width + 0.5, TABLE.depth + 0.5);
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const plane = new THREE.Mesh(geo, mat);
  plane.rotation.x = floor.rotX;
  plane.position.set(0, floor.getY(0, 0) + 0.025, 0);
  scene.add(plane);

  let frame = 0;
  return (t: number) => {
    if (frame++ % 2 !== 0) return;
    ctx.clearRect(0, 0, size, size);
    for (let i = 0; i < 38; i++) {
      const bx = size / 2 + Math.sin(t * 0.34 + i * 1.27) * size * 0.45;
      const by = size / 2 + Math.cos(t * 0.28 + i * 0.91) * size * 0.45;
      const br = size * 0.040 + Math.sin(t * 0.55 + i * 0.62) * size * 0.022;
      const a  = 0.30 + Math.sin(t * 0.45 + i * 1.1) * 0.18;
      const g  = ctx.createRadialGradient(bx, by, 0, bx, by, br);
      g.addColorStop(0,   `rgba(180,240,210,${a})`);
      g.addColorStop(0.4, `rgba(100,210,180,${a * 0.5})`);
      g.addColorStop(1,   'rgba(40,160,140,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(bx, by, br, 0, Math.PI * 2);
      ctx.fill();
    }
    tex.needsUpdate = true;
  };
}

// ── Points lumineux mouvants (caustiques volumétriques) ──
export function createCausticLights(scene: THREE.Scene): (t: number) => void {
  const defs = [
    { x: -1.5, z: -5.5 },
    { x:  2.2, z: -2.0 },
    { x: -2.0, z:  1.0 },
    { x:  1.5, z:  4.5 },
    { x:  0.0, z: -7.0 },
  ];

  const lights: {
    light: THREE.PointLight;
    ox: number; oz: number;
    spd: number; ph: number; amp: number;
  }[] = [];

  for (const d of defs) {
    const light = new THREE.PointLight(0x55ddff, 3.2, 7.5);
    light.position.set(d.x, 2.0, d.z);
    scene.add(light);
    lights.push({
      light, ox: d.x, oz: d.z,
      spd: 0.20 + Math.random() * 0.38,
      ph:  Math.random() * Math.PI * 2,
      amp: 1.4 + Math.random() * 1.6,
    });
  }

  return (t: number) => {
    for (const c of lights) {
      c.light.position.x = c.ox + Math.sin(t * c.spd + c.ph) * c.amp;
      c.light.position.z = c.oz + Math.cos(t * c.spd * 0.73 + c.ph) * c.amp;
      c.light.intensity  = 2.5 + Math.sin(t * c.spd * 2.1 + c.ph) * 1.2;
    }
  };
}

// ── Inserts lumineux dans le sol ──
export function createInsertLights(scene: THREE.Scene, floor: FloorSampler): (t: number) => void {
  const inserts: {
    mat: THREE.MeshBasicMaterial;
    phase: number;
    freq: number;
    r: number;
    g: number;
    b: number;
  }[] = [];

  const defs: { x: number; z: number; color: number; r: number }[] = [];

  const c = new THREE.Color();
  for (const d of defs) {
    c.setHex(d.color);
    const mat = new THREE.MeshBasicMaterial({
      color: d.color,
      transparent: true,
      opacity: 0.92,
    });
    const circle = new THREE.Mesh(new THREE.CircleGeometry(d.r, 16), mat);
    circle.rotation.x = floor.rotX;
    circle.position.set(d.x, floor.getY(d.x, d.z), d.z);
    scene.add(circle);

    inserts.push({
      mat,
      phase: Math.random() * Math.PI * 2,
      freq: 0.5 + Math.random() * 0.9,
      r: c.r,
      g: c.g,
      b: c.b,
    });
  }

  return (t: number) => {
    for (const ins of inserts) {
      const pulse = 0.55 + Math.sin(t * ins.freq + ins.phase) * 0.45;
      ins.mat.color.setRGB(ins.r * pulse, ins.g * pulse, ins.b * pulse);
    }
  };
}

// ── Flaques d'eau animées ──
export function createWaterPuddles(scene: THREE.Scene, floor: FloorSampler): (t: number) => void {
  const spots = [
    { x: 0.5, z: 1.4, rx: 0.75, rz: 0.50, seed: 1.3 },
    { x:  1.5, z: -3.0, rx: 0.60, rz: 0.44, seed: 2.7 },
    { x: -2.8, z:  3.8, rx: 0.62, rz: 0.46, seed: 0.8 },
    { x:  0.0, z: -0.5, rx: 0.68, rz: 0.50, seed: 4.1 },
    { x: -2.0, z: -3.5, rx: 0.48, rz: 0.38, seed: 3.5 },
  ];

  const SZ = 256;
  const ticks: ((t: number) => void)[] = [];

  for (const sp of spots) {
    const N    = 28;
    const vArr: number[] = [0, 0, 0];
    const uvArr: number[] = [0.5, 0.5];
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const r = 1.0
        + 0.20 * Math.sin(a * 2.3 + sp.seed)
        + 0.13 * Math.sin(a * 4.7 + sp.seed * 1.8)
        + 0.07 * Math.cos(a * 7.1 + sp.seed * 0.6);
      const vx = Math.cos(a) * sp.rx * r;
      const vy = Math.sin(a) * sp.rz * r;
      vArr.push(vx, vy, 0);
      uvArr.push(vx / (sp.rx * 1.5) * 0.5 + 0.5, vy / (sp.rz * 1.5) * 0.5 + 0.5);
    }
    const idxArr: number[] = [];
    for (let i = 0; i < N; i++) idxArr.push(0, i + 1, (i + 1) % N + 1);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vArr,  3));
    geo.setAttribute('uv',       new THREE.Float32BufferAttribute(uvArr, 2));
    geo.setIndex(idxArr);
    geo.computeVertexNormals();

    const can = document.createElement('canvas');
    can.width = can.height = SZ;
    const ctx = can.getContext('2d')!;
    const tex = new THREE.CanvasTexture(can);

    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      transparent: true,
      opacity: 0.82,
      metalness: 0.92,
      roughness: 0.03,
      depthWrite: false,
      envMapIntensity: 5.0,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = floor.rotX;
    mesh.position.set(sp.x, floor.getY(sp.x, sp.z) + 0.016, sp.z);
    scene.add(mesh);

    const ph = sp.seed * 1.57;

    ticks.push((t: number) => {
      ctx.clearRect(0, 0, SZ, SZ);
      const cx = SZ / 2, cy = SZ / 2, R = SZ / 2;

      const bg = ctx.createRadialGradient(cx, cy, SZ * 0.04, cx, cy, R);
      bg.addColorStop(0,    'rgba(10, 55, 120, 0.95)');
      bg.addColorStop(0.45, 'rgba( 8, 45, 105, 0.85)');
      bg.addColorStop(0.80, 'rgba( 5, 32,  90, 0.48)');
      bg.addColorStop(1,    'rgba( 2, 20,  72, 0)');
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fill();

      for (let i = 0; i < 6; i++) {
        const a1 = t * 0.17 + ph + i * 1.047;
        const a2 = t * 0.12 + ph + i * 0.873;
        const px = cx + Math.sin(a1) * R * 0.38;
        const py = cy + Math.cos(a2) * R * 0.32;
        const pr = R * (0.10 + 0.05 * Math.sin(t * 0.35 + i * 0.9));
        const pa = 0.28 + 0.14 * Math.sin(t * 0.28 + i * 0.65);
        const cg = ctx.createRadialGradient(px, py, 0, px, py, pr);
        cg.addColorStop(0,   `rgba(190, 238, 255, ${pa})`);
        cg.addColorStop(0.5, `rgba(110, 195, 240, ${pa * 0.45})`);
        cg.addColorStop(1,   'rgba(60, 155, 220, 0)');
        ctx.fillStyle = cg;
        ctx.beginPath();
        ctx.arc(px, py, pr, 0, Math.PI * 2);
        ctx.fill();
      }

      const hx = cx - R * 0.22, hy = cy - R * 0.26;
      const hl = ctx.createRadialGradient(hx, hy, 0, hx, hy, R * 0.30);
      hl.addColorStop(0,   'rgba(255, 255, 255, 0.62)');
      hl.addColorStop(0.25,'rgba(240, 252, 255, 0.32)');
      hl.addColorStop(0.7, 'rgba(210, 242, 255, 0.10)');
      hl.addColorStop(1,   'rgba(190, 232, 255, 0)');
      ctx.fillStyle = hl;
      ctx.beginPath();
      ctx.arc(hx, hy, R * 0.30, 0, Math.PI * 2);
      ctx.fill();

      const sx = cx + R * 0.18 + Math.sin(t * 1.1 + ph) * R * 0.06;
      const sy = cy + R * 0.22 + Math.cos(t * 0.9 + ph) * R * 0.05;
      ctx.beginPath();
      ctx.arc(sx, sy, R * 0.06, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.38)';
      ctx.fill();

      tex.needsUpdate = true;
    });
  }

  let frame = 0;
  return (t: number) => {
    if (frame++ % 2 !== 0) return;
    for (const tick of ticks) tick(t);
  };
}

// ── Animation rides de sable ──
export function createSandRipples(
  scene: THREE.Scene,
  floor: FloorSampler,
  sandNorm: THREE.Texture,
): (t: number) => void {
  const SZ  = 512;
  const can = document.createElement('canvas');
  can.width = can.height = SZ;
  const ctx = can.getContext('2d')!;
  const tex = new THREE.CanvasTexture(can);

  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(TABLE.width - 0.5, TABLE.depth - 0.5), mat);
  plane.rotation.x = floor.rotX;
  plane.position.set(0, floor.getY(0, 0) + 0.02, 0);
  scene.add(plane);

  let frame = 0;
  return (t: number) => {
    sandNorm.offset.x = Math.sin(t * 0.06) * 0.08;
    sandNorm.offset.y = (t * 0.012) % 1;

    if (frame++ % 2 !== 0) return;
    ctx.clearRect(0, 0, SZ, SZ);

    const BANDS = 28;
    for (let b = 0; b < BANDS; b++) {
      const phase  = ((b / BANDS) + t * 0.04) % 1;
      const yBase  = phase * SZ;
      const freq   = 2.0 + (b % 5) * 0.9;
      const amp    = 10  + (b % 6) * 4;
      const spd    = 0.12 + (b % 4) * 0.06;
      const alpha  = 0.16 + (b % 4) * 0.07;
      const width  = 1.0  + (b % 3) * 0.6;

      ctx.beginPath();
      for (let x = 0; x <= SZ; x += 2) {
        const y = yBase + Math.sin((x / SZ) * Math.PI * 2 * freq + t * spd + b * 1.3) * amp
                        + Math.sin((x / SZ) * Math.PI * 2 * freq * 0.53 + t * spd * 0.7) * amp * 0.45;
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.strokeStyle = `rgba(130, 100, 55, ${alpha})`;
      ctx.lineWidth = width;
      ctx.stroke();
    }
    tex.needsUpdate = true;
  };
}

// ── Détail sable multi-couche ──
export function createSandDetail(scene: THREE.Scene, floor: FloorSampler, sandDiff: THREE.Texture): void {
  const W  = TABLE.width  - 0.6;
  const D  = TABLE.depth  - 0.6;
  const Y0 = floor.getY(0, 0);
  const RX = floor.rotX;

  const fineTex = sandDiff.clone();
  fineTex.wrapS = fineTex.wrapT = THREE.RepeatWrapping;
  fineTex.repeat.set(20, 33);
  fineTex.needsUpdate = true;

  const fineMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(W, D),
    new THREE.MeshBasicMaterial({
      map: fineTex,
      transparent: true,
      opacity: 0.40,
      blending: THREE.MultiplyBlending,
      premultipliedAlpha: true,
      depthWrite: false,
    }),
  );
  fineMesh.rotation.x = RX;
  fineMesh.position.set(0, Y0 + 0.008, 0);
  scene.add(fineMesh);

  const SZ = 256;
  const can = document.createElement('canvas');
  can.width = can.height = SZ;
  const ctx = can.getContext('2d')!;
  const img = ctx.createImageData(SZ, SZ);

  for (let py = 0; py < SZ; py++) {
    for (let px = 0; px < SZ; px++) {
      const nx = (px / SZ) * 4.5;
      const nz = (py / SZ) * 7.0;
      const n = 0.50
        + 0.22 * Math.sin(nx * 0.68 + nz * 0.42 + 1.10)
        + 0.14 * Math.sin(nx * 1.55 + nz * 1.08 + 2.45)
        + 0.08 * Math.cos(nx * 2.90 + nz * 0.75 + 0.65)
        + 0.05 * Math.sin(nx * 0.32 + nz * 2.10 + 3.20);
      const v = Math.max(0, Math.min(1, n));
      const idx = (py * SZ + px) * 4;
      img.data[idx]     = Math.round(242 + v * 13);
      img.data[idx + 1] = Math.round(232 + v * 14);
      img.data[idx + 2] = Math.round(200 + v * 20);
      img.data[idx + 3] = 210;
    }
  }
  ctx.putImageData(img, 0, 0);

  const varMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(W, D),
    new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(can),
      transparent: true,
      opacity: 0.42,
      blending: THREE.MultiplyBlending,
      premultipliedAlpha: true,
      depthWrite: false,
    }),
  );
  varMesh.rotation.x = RX;
  varMesh.position.set(0, Y0 + 0.012, 0);
  scene.add(varMesh);
}
