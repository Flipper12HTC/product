interface FlowerSpec {
  src: string;
  leftPct: number;
  bottomPct: number;
  size: number; // px
  opacity: number;
  rotate: number;
  delay: number;
}

// Coral-flower scatter that frames the central leaderboard column. Same look as
// the back-screen, minus the character houses (per request).
const FLOWERS: FlowerSpec[] = [
  { src: 'BlueFlower.png', leftPct: 4, bottomPct: 70, size: 90, opacity: 0.5, rotate: -8, delay: 0 },
  { src: 'PurpleFlower.png', leftPct: 14, bottomPct: 50, size: 70, opacity: 0.45, rotate: 6, delay: -1.2 },
  { src: 'YellowFlower.png', leftPct: 8, bottomPct: 30, size: 60, opacity: 0.5, rotate: -4, delay: -2.5 },
  { src: 'GreenFlower.png', leftPct: 20, bottomPct: 24, size: 55, opacity: 0.5, rotate: 10, delay: -3.5 },
  { src: 'RedFlower.png', leftPct: 88, bottomPct: 66, size: 70, opacity: 0.5, rotate: -10, delay: -0.8 },
  { src: 'BlueFlower.png', leftPct: 94, bottomPct: 44, size: 90, opacity: 0.5, rotate: 4, delay: -2 },
  { src: 'YellowFlower.png', leftPct: 82, bottomPct: 26, size: 55, opacity: 0.6, rotate: -6, delay: -4 },
  { src: 'PurpleFlower.png', leftPct: 78, bottomPct: 50, size: 65, opacity: 0.45, rotate: 8, delay: -5 },
  // small "garden" on the sand line
  { src: 'RedFlower.png', leftPct: 34, bottomPct: 18, size: 38, opacity: 0.95, rotate: -6, delay: -1 },
  { src: 'YellowFlower.png', leftPct: 64, bottomPct: 16, size: 34, opacity: 0.95, rotate: 4, delay: -2.3 },
  { src: 'GreenFlower.png', leftPct: 72, bottomPct: 19, size: 40, opacity: 0.95, rotate: -8, delay: -3.1 },
];

function spawnBubbles(host: HTMLElement, count = 18): void {
  for (let i = 0; i < count; i++) {
    const b = document.createElement('div');
    b.className = 'sb-bubble';
    const size = 12 + Math.random() * 46;
    b.style.width = `${size}px`;
    b.style.height = `${size}px`;
    b.style.left = `${Math.random() * 100}%`;
    b.style.animationDuration = `${8 + Math.random() * 10}s`;
    b.style.animationDelay = `${-Math.random() * 14}s`;
    host.appendChild(b);
  }
}

function spawnFlowers(host: HTMLElement): void {
  for (const f of FLOWERS) {
    const el = document.createElement('img');
    el.src = `/image/${f.src}`;
    el.alt = '';
    el.className = 'sb-flower';
    el.style.left = `${f.leftPct}%`;
    el.style.bottom = `${f.bottomPct}%`;
    el.style.width = `${f.size}px`;
    el.style.opacity = String(f.opacity);
    el.style.animationDelay = `${f.delay}s`;
    el.style.transform = `rotate(${f.rotate}deg)`;
    host.appendChild(el);
  }
}

/**
 * Mount the Bikini Bottom backdrop (flowers, sand, sand speckles, bubbles).
 * Idempotent: re-mounting (e.g. Vite HMR) will not duplicate layers.
 */
export function mountUnderwaterBackground(): void {
  const layers: Array<{ id: string; cls: string; fill?: (el: HTMLElement) => void }> = [
    { id: 'sb-flowers', cls: 'sb-flowers', fill: spawnFlowers },
    { id: 'sb-sand', cls: 'sb-sand' },
    { id: 'sb-sand-speckles', cls: 'sb-sand-speckles' },
    { id: 'sb-bubbles', cls: 'sb-bubbles', fill: (el) => spawnBubbles(el) },
  ];
  for (const layer of layers) {
    if (document.getElementById(layer.id)) continue;
    const el = document.createElement('div');
    el.id = layer.id;
    el.className = layer.cls;
    if (layer.fill) layer.fill(el);
    document.body.appendChild(el);
  }
}
