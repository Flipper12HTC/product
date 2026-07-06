import './style.css';
import type { GameSource } from './application/ports/game-source';
import { createDmdDisplay } from './adapters/dmd/dmd-display';
import { MockGameSource, WsGameSource } from '@flipper/game-sources';

const WS_URL = 'ws://localhost:8080/ws';
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:8080';

function pickSource(): GameSource {
  // Default to the real backend (WS) so the display mirrors the live game even in
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

// The deco-screen is a dot-matrix display (DMD): the high-score board rendered as
// glowing dots, with callouts flashed on game events.
const canvas = document.createElement('canvas');
document.body.appendChild(canvas);

const dmd = createDmdDisplay(canvas);
dmd.start();

const source = pickSource();

async function refreshLeaderboard(): Promise<void> {
  try {
    const r = await fetch(`${BACKEND_URL}/scores/top?limit=5`);
    if (!r.ok) return;
    const data = (await r.json()) as ScoresResponseDto;
    dmd.setScores(
      data.scores.map((s, i) => ({
        rank: i + 1,
        playerId: s.playerId,
        points: s.points,
      })),
    );
  } catch {
    /* backend unreachable — keep the last board */
  }
}

void refreshLeaderboard();

source.on('boost_changed', (event) => {
  if (event.payload.active) dmd.flash('x3 BOOST!');
});
source.on('game_over', () => {
  dmd.flash('GAME OVER', 2600);
  // Let the score persist, then pull the fresh board.
  setTimeout(() => void refreshLeaderboard(), 600);
});

source.start();
