import './style.css';
import type { GameSource } from './application/ports/game-source';
import { createRendererOrchestrator } from './application/renderer-orchestrator';
import { attachKeyboardForwarder } from './infrastructure/keyboard-forwarder';
import { createScene } from './adapters/scene/scene';
import { createBall } from './adapters/meshes/ball';
import { createFlipper } from './adapters/meshes/flipper';
import type { Flipper } from './adapters/meshes/flipper';
import { WsGameSource } from '@flipper/game-sources';

// Same-origin by default: the cabinet serves each screen from its own nginx,
// which reverse-proxies /ws, /game and /scores to the backend service. In dev
// (vite) we fall back to the local backend on :8080. Override with
// VITE_BACKEND_URL / VITE_WS_URL at build time if ever needed.
const BACKEND_URL =
  (import.meta.env.VITE_BACKEND_URL as string | undefined) ??
  (import.meta.env.DEV ? 'http://localhost:8080' : '');
const WS_URL =
  (import.meta.env.VITE_WS_URL as string | undefined) ??
  (BACKEND_URL
    ? `${BACKEND_URL.replace(/^http/, 'ws')}/ws`
    : `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`);

const canvas = document.createElement('canvas');
document.body.appendChild(canvas);

const coordsDiv = document.createElement('div');
coordsDiv.className = 'debug-coords';
document.body.appendChild(coordsDiv);

let debugActive = false;

const { scene, render, resize, onMeshesReady, toggleDebug, updateDebugBall, addBallTrail, triggerShake, jellyfishBumpers } =
  createScene(canvas);
const ball = createBall(scene);
const source: GameSource = new WsGameSource({ url: WS_URL });

let flipperLeft: Flipper | null = null;
let flipperRight: Flipper | null = null;

onMeshesReady(({ flipperLeft: leftMesh, flipperRight: rightMesh }) => {
  flipperLeft = createFlipper(scene, leftMesh, { side: 'left' });
  flipperRight = createFlipper(scene, rightMesh, { side: 'right' });
});

const orchestrator = createRendererOrchestrator(source, {
  onBallMoved(position) {
    ball.setPosition(position);
    ball.setVisible(position.y >= 0);
    updateDebugBall(position);
    addBallTrail(position);
    if (debugActive) {
      coordsDiv.textContent =
        `X: ${position.x.toFixed(3)}  Y: ${position.y.toFixed(3)}  Z: ${position.z.toFixed(3)}`;
    }
  },
  onFlipperChanged(state) {
    flipperLeft?.setState(state);
    flipperRight?.setState(state);
  },
  onScoreChanged() {},
  onGameOver() {
    ball.setVisible(false);
  },
  onBumperHit(id) {
    triggerShake();
    jellyfishBumpers.hit(id);
  },
});

attachKeyboardForwarder({
  backendUrl: BACKEND_URL,
  isStartAllowed: () => true,
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'p' || e.key === 'P') {
    debugActive = !debugActive;
    toggleDebug();
    coordsDiv.style.display = debugActive ? 'block' : 'none';
    if (!debugActive) coordsDiv.textContent = '';
  }
});

window.addEventListener('resize', resize);

let lastFrameTime = performance.now();
function loop(): void {
  requestAnimationFrame(loop);
  const now = performance.now();
  const dt = Math.min(0.1, (now - lastFrameTime) / 1000);
  lastFrameTime = now;
  jellyfishBumpers.tick(dt);
  render();
}

orchestrator.start();
loop();
