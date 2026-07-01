import * as THREE from 'three';

export function createOceanSky(scene: THREE.Scene): (t: number) => void {
  const W = 512, H = 256;
  const can = document.createElement('canvas');
  can.width = W; can.height = H;
  const ctx = can.getContext('2d')!;
  const tex = new THREE.CanvasTexture(can);
  const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(85, 32, 16), mat));

  let frame = 0;
  return (t: number) => {
    if (frame++ % 3 !== 0) return;

    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0.00, '#c8f0ff');
    bg.addColorStop(0.12, '#5bbde0');
    bg.addColorStop(0.35, '#1a7ab8');
    bg.addColorStop(0.60, '#0a4a78');
    bg.addColorStop(0.80, '#052a50');
    bg.addColorStop(1.00, '#010e1e');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    const CX = W / 2, CY = -H * 0.08;
    const RAY_COUNT = 14;
    for (let i = 0; i < RAY_COUNT; i++) {
      const baseAngle = (i / RAY_COUNT) * Math.PI - Math.PI / 2;
      const wobble    = Math.sin(t * 0.22 + i * 0.9) * 0.06
                      + Math.sin(t * 0.11 + i * 1.7) * 0.03;
      const angle     = baseAngle + wobble;
      const len       = H * (0.65 + Math.sin(t * 0.18 + i * 0.55) * 0.15);
      const halfW     = (8 + (i % 5) * 7) * (0.7 + Math.sin(t * 0.3 + i) * 0.3);
      const alpha     = 0.04 + Math.sin(t * 0.4 + i * 1.1) * 0.025;

      const ex = CX + Math.cos(angle) * len;
      const ey = CY + Math.sin(angle) * len;
      const px = -Math.sin(angle) * halfW;
      const py =  Math.cos(angle) * halfW;

      const rg = ctx.createLinearGradient(CX, CY, ex, ey);
      rg.addColorStop(0,   `rgba(220, 248, 255, ${alpha * 2.2})`);
      rg.addColorStop(0.3, `rgba(160, 220, 255, ${alpha})`);
      rg.addColorStop(1,   'rgba(60, 160, 220, 0)');

      ctx.beginPath();
      ctx.moveTo(CX, CY);
      ctx.lineTo(ex + px, ey + py);
      ctx.lineTo(ex - px, ey - py);
      ctx.closePath();
      ctx.fillStyle = rg;
      ctx.fill();
    }

    for (let i = 0; i < 22; i++) {
      const cx = W * 0.5 + Math.sin(t * 0.28 + i * 1.3) * W * 0.38;
      const cy = Math.abs(Math.cos(t * 0.21 + i * 0.85)) * H * 0.18;
      const cr = 18 + Math.sin(t * 0.5 + i * 0.7) * 10;
      const ca = 0.10 + Math.sin(t * 0.4 + i * 1.05) * 0.06;
      const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, cr);
      cg.addColorStop(0,   `rgba(210, 248, 255, ${ca})`);
      cg.addColorStop(0.5, `rgba(120, 210, 245, ${ca * 0.4})`);
      cg.addColorStop(1,   'rgba(60, 160, 220, 0)');
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.arc(cx, cy, cr, 0, Math.PI * 2);
      ctx.fill();
    }

    const vl = ctx.createLinearGradient(0, 0, W * 0.3, 0);
    vl.addColorStop(0, 'rgba(1,10,28,0.55)');
    vl.addColorStop(1, 'rgba(1,10,28,0)');
    ctx.fillStyle = vl;
    ctx.fillRect(0, 0, W * 0.3, H);
    const vr = ctx.createLinearGradient(W, 0, W * 0.7, 0);
    vr.addColorStop(0, 'rgba(1,10,28,0.55)');
    vr.addColorStop(1, 'rgba(1,10,28,0)');
    ctx.fillStyle = vr;
    ctx.fillRect(W * 0.7, 0, W * 0.3, H);

    tex.needsUpdate = true;
  };
}
