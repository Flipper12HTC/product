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
  /** Total jellyfish-bumper hits this game — drives the x3 boost threshold. */
  bumperHitCount: number;
  /** Wall-clock ms at which the active x3 boost ends, or null when inactive. */
  boostUntil: number | null;
  player: PlayerIdentity;
  startedAt: number | null;
  endedAt: number | null;
}

export const INITIAL_BALLS = 3;
export const INITIAL_MULTIPLIER = 1;

// x3 boost: hitting every Nth bumper grants a timed score multiplier.
export const BOOST_MULTIPLIER = 3;
export const BOOST_DURATION_MS = 10_000;
export const BUMPER_BOOST_THRESHOLD = 10;

export function createInitialState(): GameState {
  return {
    status: 'idle',
    ball: { position: { x: 0, y: 0.4, z: 0 } },
    ballInLane: true,
    activeFlipper: null,
    score: 0,
    ballsLeft: INITIAL_BALLS,
    multiplier: INITIAL_MULTIPLIER,
    bumperHitCount: 0,
    boostUntil: null,
    player: { wallet: null },
    startedAt: null,
    endedAt: null,
  };
}
