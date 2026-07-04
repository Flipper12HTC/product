import './style.css';
import type { GameSource } from './application/ports/game-source';
import { createRendererOrchestrator, type DecoStage } from './application/renderer-orchestrator';
import { createDecoScene } from './adapters/scene/deco-scene';
import { createLeaderboardView } from './adapters/components/leaderboard-view';
import { mountUnderwaterBackground } from './adapters/components/underwater-bg';
import { MockGameSource, WsGameSource } from '@flipper/game-sources';

const WS_URL = 'ws://localhost:8080/ws';
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:8080';

function pickSource(): GameSource {
  // Default to the real backend (WS) so the screen mirrors the live game even in
  // dev; opt into the offline demo loop with VITE_GAME_SOURCE=mock.
  const kind = import.meta.env.VITE_GAME_SOURCE ?? 'ws';
  if (kind === 'ws') {
    return new WsGameSource({ url: WS_URL });
  }
  return new MockGameSource();
}

interface ScoreDto {
  playerId: string;
  points: number;
  achievedAt: string;
}

interface ScoresResponseDto {
  scores: ScoreDto[];
}

// ---- Background + leaderboard first: these must always render, even if WebGL
//      is unavailable. The 3D stage is layered on top and is best-effort.
mountUnderwaterBackground();

const leaderboard = createLeaderboardView();
leaderboard.mount();

// A no-op stage keeps the orchestrator + render loop safe if the 3D scene
// cannot be created (no WebGL, model load failure, etc.).
const NULL_STAGE: DecoStage = {
  trigger: () => {},
  reactScore: () => {},
  reactBoost: () => {},
  reactDrain: () => {},
  reactGameOver: () => {},
  reactReset: () => {},
  tick: () => {},
  dispose: () => {},
};

let stage: DecoStage = NULL_STAGE;
try {
  const canvas = document.createElement('canvas');
  document.body.appendChild(canvas);
  stage = createDecoScene(canvas);
} catch (err) {
  console.warn('[deco-screen] 3D scene unavailable, running leaderboard only:', err);
}

const source = pickSource();
const orchestrator = createRendererOrchestrator(source, stage);
orchestrator.start();

async function refreshLeaderboard(): Promise<void> {
  try {
    const r = await fetch(`${BACKEND_URL}/scores/top?limit=5`);
    if (!r.ok) return;
    const data = (await r.json()) as ScoresResponseDto;
    leaderboard.render(
      data.scores.map((s, i) => ({
        rank: i + 1,
        playerId: s.playerId,
        points: s.points,
        achievedAt: s.achievedAt,
      })),
    );
  } catch {
    /* backend unreachable */
  }
}

void refreshLeaderboard();
source.on('game_over', () => {
  setTimeout(() => {
    void refreshLeaderboard();
  }, 200);
});

let last = performance.now();
function loop(now: number): void {
  const delta = now - last;
  last = now;
  try {
    stage.tick(delta);
  } catch (err) {
    // A render error must not kill the loop or freeze the page.
    console.warn('[deco-screen] stage tick error:', err);
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
