import './style.css';
import type { GameSource } from './application/ports/game-source';
import { createRendererOrchestrator } from './application/renderer-orchestrator';
import { createScoreboardView } from './adapters/components/scoreboard-view';
import { attachKeyboardForwarder } from './infrastructure/keyboard-forwarder';
import { MockGameSource, WsGameSource } from '@flipper/game-sources';

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

function pickSource(): GameSource {
  const kind = import.meta.env.VITE_GAME_SOURCE ?? (import.meta.env.DEV ? 'mock' : 'ws');
  if (kind === 'ws') {
    return new WsGameSource({ url: WS_URL });
  }
  return new MockGameSource();
}

const source = pickSource();
let currentStatus: 'idle' | 'running' | 'over' = 'idle';
let lastStartAt = 0;

source.on('score_update', () => {
  currentStatus = 'running';
});
source.on('game_over', () => {
  currentStatus = 'over';
});

function requestStart(): void {
  if (currentStatus === 'running') return;
  const now = Date.now();
  if (now - lastStartAt < 500) return;
  lastStartAt = now;
  void fetch(`${BACKEND_URL}/game/start`, { method: 'POST' }).catch(() => undefined);
}

const root = document.createElement('main');
root.id = 'root';
document.body.appendChild(root);

const view = createScoreboardView(root, { onStart: requestStart });
const orchestrator = createRendererOrchestrator(source, view);
orchestrator.start();

attachKeyboardForwarder({
  backendUrl: BACKEND_URL,
  isStartAllowed: () => currentStatus !== 'running',
});

interface GameStateDto {
  status?: string;
  score?: number;
  ballsLeft?: number;
  multiplier?: number;
}

fetch(`${BACKEND_URL}/game/state`)
  .then((r) => (r.ok ? (r.json() as Promise<GameStateDto>) : null))
  .then((data) => {
    if (!data) return;
    if (data.status === 'running' || data.status === 'over' || data.status === 'idle') {
      currentStatus = data.status;
      orchestrator.setStatus(data.status);
    }
  })
  .catch(() => undefined);
