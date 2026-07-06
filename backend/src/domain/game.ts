import type { Ball } from './ball.js';
import type { FlipperSide } from './flipper.js';

// Pure game rules and state. This file has zero framework imports on purpose:
// the whole game design (balls per game, boost rules) is readable and tunable
// here, and every other layer depends on it — never the other way around.

// State machine of one game. Transitions are owned by the use-cases:
// idle --startGame--> running --(3 balls drained)--> over --startGame--> running
export type GameStatus = 'idle' | 'running' | 'over';

export interface PlayerIdentity {
  /** Optional player identity used as leaderboard name; null -> saved as "guest". */
  wallet: string | null;
}

// Single source of truth for one game. Mutated ONLY by the use-cases
// (startGame / tickGame / endGame); adapters and routes just read it.
export interface GameState {
  status: GameStatus;
  ball: Ball;
  /** True while the ball is still inside the launch lane (drain rules differ there). */
  ballInLane: boolean;
  activeFlipper: FlipperSide | null;
  score: number;
  ballsLeft: number;
  /** Current score multiplier: 1 normally, 3 while the boost is active. */
  multiplier: number;
  /** Total jellyfish-bumper hits this game — drives the x3 boost threshold. */
  bumperHitCount: number;
  /** Wall-clock ms at which the active x3 boost ends, or null when inactive. */
  boostUntil: number | null;
  player: PlayerIdentity;
  startedAt: number | null;
  endedAt: number | null;
}

// Named game-design constants: changing the rules is a one-line edit here,
// and the unit tests immediately tell us if anything downstream breaks.
export const INITIAL_BALLS = 3;
export const INITIAL_MULTIPLIER = 1;

// x3 boost: hitting every Nth bumper grants a timed score multiplier.
export const BOOST_MULTIPLIER = 3;
export const BOOST_DURATION_MS = 10_000;
export const BUMPER_BOOST_THRESHOLD = 10;

// Fresh state at server boot: no game running until someone presses start.
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
