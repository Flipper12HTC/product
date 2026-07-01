import type { PhysicsWorld } from '../ports/physics-world.js';
import type { GamePublisher } from '../ports/game-publisher.js';
import type { GameState } from '../../domain/game.js';
import { INITIAL_BALLS, INITIAL_MULTIPLIER } from '../../domain/game.js';

export function startGame(state: GameState, physics: PhysicsWorld, publisher: GamePublisher): void {
  state.status = 'running';
  state.score = 0;
  state.ballsLeft = INITIAL_BALLS;
  state.multiplier = INITIAL_MULTIPLIER;
  state.activeFlipper = null;
  state.ballInLane = true;
  state.startedAt = Date.now();
  state.endedAt = null;

  physics.resetBall();

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
