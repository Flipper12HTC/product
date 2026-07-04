import type { PhysicsWorld } from '../ports/physics-world.js';
import type { GamePublisher } from '../ports/game-publisher.js';
import type { GameState } from '../../domain/game.js';
import { INITIAL_BALLS, INITIAL_MULTIPLIER } from '../../domain/game.js';

export function startGame(
  state: GameState,
  physics: PhysicsWorld,
  publisher: GamePublisher,
  now: number = Date.now(),
): void {
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

  physics.resetBall();

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
