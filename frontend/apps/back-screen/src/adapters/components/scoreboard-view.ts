import type { Scoreboard } from '../../domain/scoreboard';
import type { ScoreboardView } from '../../application/renderer-orchestrator';

export interface ScoreboardViewOptions {
  onStart: () => void;
}

const BANNERS = {
  idle: 'ARE YOU READY KIDS?',
  running: "I'M READY!",
  over: 'BARNACLES!',
} as const;

const CTA_LABELS = {
  idle: 'PULL TO LAUNCH!',
  over: 'PULL TO PLAY AGAIN!',
} as const;

interface FlowerSpec {
  src: string;
  leftPct: number;
  bottomPct: number;
  size: number; // px
  opacity: number;
  rotate: number;
  delay: number;
}

// Hand-tuned flower scatter: dense outline-flowers in the water that frame the
// central UI column, plus a tiny "garden" on the sand line.
const FLOWERS: FlowerSpec[] = [
  // upper water — large soft outlines
  { src: 'BlueFlower.png',   leftPct: 4,  bottomPct: 78, size: 90, opacity: 0.5,  rotate: -8,  delay: 0 },
  { src: 'PurpleFlower.png', leftPct: 16, bottomPct: 60, size: 70, opacity: 0.45, rotate: 6,   delay: -1.2 },
  { src: 'YellowFlower.png', leftPct: 30, bottomPct: 88, size: 60, opacity: 0.5,  rotate: -4,  delay: -2.5 },
  { src: 'GreenFlower.png',  leftPct: 22, bottomPct: 42, size: 55, opacity: 0.45, rotate: 10,  delay: -3.5 },
  { src: 'RedFlower.png',    leftPct: 70, bottomPct: 78, size: 70, opacity: 0.5,  rotate: -10, delay: -0.8 },
  { src: 'BlueFlower.png',   leftPct: 92, bottomPct: 70, size: 90, opacity: 0.5,  rotate: 4,   delay: -2 },
  { src: 'YellowFlower.png', leftPct: 82, bottomPct: 88, size: 55, opacity: 0.5,  rotate: -6,  delay: -4 },
  { src: 'PurpleFlower.png', leftPct: 78, bottomPct: 50, size: 65, opacity: 0.45, rotate: 8,   delay: -5 },
  // small "garden" on the sand line (visible + saturated)
  { src: 'RedFlower.png',    leftPct: 40, bottomPct: 22, size: 38, opacity: 0.95, rotate: -6,  delay: -1 },
  { src: 'YellowFlower.png', leftPct: 48, bottomPct: 20, size: 34, opacity: 0.95, rotate: 4,   delay: -2.3 },
  { src: 'GreenFlower.png',  leftPct: 56, bottomPct: 23, size: 40, opacity: 0.95, rotate: -8,  delay: -3.1 },
  { src: 'PurpleFlower.png', leftPct: 62, bottomPct: 21, size: 34, opacity: 0.95, rotate: 6,   delay: -1.7 },
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

function spawnHouses(host: HTMLElement): void {
  const houses = [
    { cls: 'sb-house--krusty',    src: 'KrabRestaurant.png',  alt: 'The Krusty Krab' },
    { cls: 'sb-house--sandy',     src: 'SandyHouse.png',      alt: "Sandy's Treedome" },
    { cls: 'sb-house--squidward', src: 'SquidwardHouse.png',  alt: "Squidward's Easter Island" },
    { cls: 'sb-house--patrick',   src: 'PatrickHouse.png',    alt: "Patrick's Rock" },
    { cls: 'sb-house--bob',       src: 'BobHouse.png',        alt: "SpongeBob's Pineapple" },
  ];
  for (const h of houses) {
    const wrap = document.createElement('div');
    wrap.className = `sb-house ${h.cls}`;
    const img = document.createElement('img');
    img.src = `/image/${h.src}`;
    img.alt = h.alt;
    wrap.appendChild(img);
    host.appendChild(wrap);
  }
}

// Idempotent: re-mounting the view (e.g. HMR) shouldn't duplicate background layers.
function ensureBackgroundLayers(): void {
  const layers: Array<{ id: string; cls: string; fill?: (el: HTMLElement) => void }> = [
    { id: 'sb-flowers', cls: 'sb-flowers', fill: spawnFlowers },
    { id: 'sb-sand',    cls: 'sb-sand' },
    { id: 'sb-sand-speckles', cls: 'sb-sand-speckles' },
    { id: 'sb-houses',  cls: 'sb-houses', fill: spawnHouses },
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

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function formatScore(n: number): string {
  return n.toLocaleString('en-US');
}

export function createScoreboardView(
  root: HTMLElement,
  options: ScoreboardViewOptions,
): ScoreboardView {
  root.innerHTML = '';
  root.className =
    'flex flex-col items-center justify-center gap-6 p-8 w-full min-h-screen text-center';

  ensureBackgroundLayers();

  // ---- Title (logo image)
  const titleImg = document.createElement('img');
  titleImg.src = '/image/Flipper12.png';
  titleImg.alt = 'Flipper 12 — Bikini Bottom';
  titleImg.className = 'sb-title-img';

  // ---- Banner (READY / I'M READY! / BARNACLES!)
  const banner = document.createElement('div');
  banner.className = 'sb-banner text-[clamp(1.2rem,2.4vw,2rem)] opacity-0';
  banner.textContent = BANNERS.idle;

  // ---- Score panel (label morphs into FINAL CATCH on game over)
  const scorePanel = document.createElement('div');
  scorePanel.className = 'sb-score-panel flex flex-col items-center';

  const scoreLabel = document.createElement('div');
  scoreLabel.className = 'sb-score-label';
  scoreLabel.textContent = 'JELLYFISH POINTS';

  const scoreEl = document.createElement('div');
  scoreEl.className = 'sb-score-value';
  scoreEl.textContent = '0';

  const popupEl = document.createElement('div');
  popupEl.className = 'sb-score-popup';

  scorePanel.append(scoreLabel, scoreEl, popupEl);

  // ---- HUD row: multiplier pill + patties group (single compact line)
  const hud = document.createElement('div');
  hud.className = 'sb-hud';

  const multPill = document.createElement('span');
  multPill.className = 'sb-mult-pill';
  multPill.textContent = 'x1';

  const pattiesGroup = document.createElement('div');
  pattiesGroup.className = 'sb-patties-group';
  const pattiesLabel = document.createElement('span');
  pattiesLabel.className = 'sb-patties-label';
  pattiesLabel.textContent = 'PATTIES';

  const pattiesRow = document.createElement('div');
  pattiesRow.className = 'sb-patties';
  const patties: HTMLDivElement[] = [];
  for (let i = 0; i < 3; i++) {
    const p = document.createElement('div');
    p.className = 'sb-patty';
    patties.push(p);
    pattiesRow.appendChild(p);
  }
  pattiesGroup.append(pattiesLabel, pattiesRow);
  hud.append(multPill, pattiesGroup);

  // ---- Plunger call-to-action (visual cue — back-screen is non-interactive)
  const cta = document.createElement('div');
  cta.className = 'sb-cta';

  const ctaLabel = document.createElement('div');
  ctaLabel.className = 'sb-cta-label';
  ctaLabel.textContent = CTA_LABELS.idle;

  const plunger = document.createElement('div');
  plunger.className = 'sb-plunger';
  plunger.innerHTML = `
    <div class="sb-plunger-spring"></div>
    <div class="sb-plunger-rod"><div class="sb-plunger-knob"></div></div>
    <div class="sb-plunger-arrow">←</div>
  `;

  const hint = document.createElement('p');
  hint.className = 'sb-hint';
  hint.textContent = 'pull the plunger to launch';

  cta.append(ctaLabel, plunger, hint);

  // ---- Boost overlay (x3 jellyfish boost) — fixed, electric, with countdown
  const boostOverlay = document.createElement('div');
  boostOverlay.className = 'sb-boost sb-hidden';
  boostOverlay.innerHTML = `
    <div class="sb-boost-flash"></div>
    <div class="sb-boost-banner">
      <span class="sb-boost-zap">⚡</span>
      <span class="sb-boost-text">x3 BOOST!</span>
      <span class="sb-boost-zap">⚡</span>
    </div>
    <div class="sb-boost-bar"><div class="sb-boost-bar-fill"></div></div>
  `;
  document.body.appendChild(boostOverlay);
  const boostBarFill = boostOverlay.querySelector<HTMLElement>('.sb-boost-bar-fill');

  root.append(titleImg, banner, scorePanel, hud, cta);

  // Keep onStart wired up so the keyboard forwarder / external triggers
  // (e.g. SPACE) still work even though there is no on-screen button.
  void options;

  // -----------------------------------------------
  // Score tween: smooth count up from old → new
  // -----------------------------------------------
  let displayedScore = 0;
  let targetScore = 0;
  let tweenFrame: number | null = null;
  let popupTimer: number | null = null;

  function tweenScoreTo(next: number): void {
    if (next === targetScore && next === displayedScore) return;
    const from = displayedScore;
    const to = next;
    targetScore = to;

    if (tweenFrame !== null) cancelAnimationFrame(tweenFrame);

    if (to > from) {
      scoreEl.classList.remove('is-pulsing');
      void scoreEl.offsetWidth;
      scoreEl.classList.add('is-pulsing');

      popupEl.textContent = `+${formatScore(to - from)}`;
      popupEl.classList.remove('is-active');
      void popupEl.offsetWidth;
      popupEl.classList.add('is-active');
      if (popupTimer !== null) window.clearTimeout(popupTimer);
      popupTimer = window.setTimeout(() => {
        popupEl.classList.remove('is-active');
      }, 950);
    }

    const delta = to - from;
    const duration = Math.min(900, 300 + Math.sqrt(Math.abs(delta)) * 12);
    const start = performance.now();

    const step = (now: number): void => {
      const t = Math.min(1, (now - start) / duration);
      const eased = easeOutCubic(t);
      const value = Math.round(from + delta * eased);
      displayedScore = value;
      scoreEl.textContent = formatScore(value);
      if (t < 1) {
        tweenFrame = requestAnimationFrame(step);
      } else {
        tweenFrame = null;
        displayedScore = to;
        scoreEl.textContent = formatScore(to);
      }
    };
    tweenFrame = requestAnimationFrame(step);
  }

  function snapScore(value: number): void {
    if (tweenFrame !== null) {
      cancelAnimationFrame(tweenFrame);
      tweenFrame = null;
    }
    displayedScore = value;
    targetScore = value;
    scoreEl.textContent = formatScore(value);
  }

  function applyPatties(ballsLeft: number, status: string): void {
    const visibleCount = status === 'idle' ? 3 : Math.max(0, ballsLeft);
    patties.forEach((p, i) => {
      p.classList.toggle('is-eaten', i >= visibleCount);
    });
  }

  // Boost: react only to transitions so the countdown bar restarts cleanly.
  let boostActive = false;
  function applyBoost(active: boolean, durationMs: number): void {
    if (active === boostActive) return;
    boostActive = active;
    multPill.classList.toggle('is-boosting', active);

    if (active) {
      boostOverlay.classList.remove('sb-hidden');
      // restart the pop animation
      boostOverlay.classList.remove('is-active');
      void boostOverlay.offsetWidth;
      boostOverlay.classList.add('is-active');
      // drive the countdown bar with the real boost duration
      if (boostBarFill) {
        boostBarFill.style.transition = 'none';
        boostBarFill.style.transform = 'scaleX(1)';
        void boostBarFill.offsetWidth;
        boostBarFill.style.transition = `transform ${durationMs}ms linear`;
        boostBarFill.style.transform = 'scaleX(0)';
      }
    } else {
      boostOverlay.classList.remove('is-active');
      boostOverlay.classList.add('sb-hidden');
    }
  }

  return {
    render(state: Scoreboard): void {
      if (state.status === 'idle' && state.score === 0) {
        snapScore(0);
      } else {
        tweenScoreTo(state.score);
      }

      multPill.textContent = `x${String(state.multiplier)}`;
      applyPatties(state.ballsLeft, state.status);
      applyBoost(state.boostActive, state.boostDurationMs);

      banner.classList.toggle('is-over', state.status === 'over');
      scoreLabel.classList.toggle('is-final', state.status === 'over');

      if (state.status === 'idle') {
        banner.textContent = BANNERS.idle;
        banner.style.opacity = '1';
        scoreLabel.textContent = 'JELLYFISH POINTS';
        ctaLabel.textContent = CTA_LABELS.idle;
        cta.classList.remove('sb-hidden');
      } else if (state.status === 'running') {
        banner.textContent = BANNERS.running;
        banner.style.opacity = '0.85';
        scoreLabel.textContent = 'JELLYFISH POINTS';
        cta.classList.add('sb-hidden');
      } else {
        banner.textContent = BANNERS.over;
        banner.style.opacity = '1';
        scoreLabel.textContent = 'FINAL CATCH!';
        ctaLabel.textContent = CTA_LABELS.over;
        cta.classList.remove('sb-hidden');
      }
    },
  };
}
