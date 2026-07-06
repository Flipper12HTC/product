import type { PhysicsWorld } from '../ports/physics-world.js';
import type { GamePublisher } from '../ports/game-publisher.js';
import type { GameState } from '../../domain/game.js';
import { INITIAL_BALLS, INITIAL_MULTIPLIER } from '../../domain/game.js';

// Starts a NEW game or restarts a finished/running one: same full reset either
// way. There is deliberately no separate "restartGame" — a second reset path
// would duplicate this list and eventually drift (the classic desync bug).
//
// `now` is injected (default wall clock) so tests can control time.
export function startGame(
  state: GameState,
  physics: PhysicsWorld,
  publisher: GamePublisher,
  now: number = Date.now(),
): void {
  // Full reset of the game state — every field, timestamps included, so no
  // leftover from the previous game (score, boost, lane flag) can leak in.
  state.status = 'running';
  state.score = 0;
  state.ballsLeft = INITIAL_BALLS;
  state.multiplier = INITIAL_MULTIPLIER;
  state.bumperHitCount = 0;
  state.boostUntil = null;
  state.activeFlipper = null;
  state.ballInLane = true;
  state.startedAt = now;
  state.endedAt = null;

  // Ball back to the plunger lane, ready to be launched.
  physics.resetBall();

  // Rebroadcast a clean initial state: screens never guess, they resync here.
  // Even a screen that missed events (reload, lag) is now consistent again.
  // Clear any lingering boost overlay from a previous game on all screens.
  publisher.broadcast({
    type: 'boost_changed',
    payload: { active: false, multiplier: state.multiplier, durationMs: 0 },
  });

  publisher.broadcast({
    type: 'score_update',
    payload: {
      score: state.score,
      ballsLeft: state.ballsLeft,
      multiplier: state.multiplier,
    },
  });
  publisher.broadcast({
    type: 'ball_position',
    payload: physics.getBallPosition(),
  });
}
