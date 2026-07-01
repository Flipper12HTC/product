import type { Ball } from './ball.js';
import type { FlipperSide } from './flipper.js';

export type GameStatus = 'idle' | 'running' | 'over';

export interface PlayerIdentity {
  wallet: string | null;
}

export interface GameState {
  status: GameStatus;
  ball: Ball;
  ballInLane: boolean;
  activeFlipper: FlipperSide | null;
  score: number;
  ballsLeft: number;
  multiplier: number;
  player: PlayerIdentity;
  startedAt: number | null;
  endedAt: number | null;
}

export const INITIAL_BALLS = 3;
export const INITIAL_MULTIPLIER = 1;

export function createInitialState(): GameState {
  return {
    status: 'idle',
    ball: { position: { x: 0, y: 0.4, z: 0 } },
    ballInLane: true,
    activeFlipper: null,
    score: 0,
    ballsLeft: INITIAL_BALLS,
    multiplier: INITIAL_MULTIPLIER,
    player: { wallet: null },
    startedAt: null,
    endedAt: null,
  };
}
