import type { PhysicsWorld } from '../ports/physics-world.js';
import type { GamePublisher } from '../ports/game-publisher.js';
import type { ScoreRepo } from '../ports/score-repo.js';
import type { GameState } from '../../domain/game.js';
import { PLAYFIELD } from '../../domain/playfield.js';

// Ball drains when it reaches the back wall behind the flippers (Z≈7.5, clearly past the
// flipper pivot at Z≈6.635). Using the flipper pivot as threshold was too aggressive —
// the ball was reset while still near the flippers before the player could react.
const DRAIN_Z = PLAYFIELD.drain.zThreshold;
const FLIPPER_HIT_POINTS = 50;
const BUMPER_HIT_POINTS = 100;

function publishScoreUpdate(state: GameState, publisher: GamePublisher): void {
  publisher.broadcast({
    type: 'score_update',
    payload: {
      score: state.score,
      ballsLeft: state.ballsLeft,
      multiplier: state.multiplier,
    },
  });
}

export function tickGame(
  state: GameState,
  physics: PhysicsWorld,
  publisher: GamePublisher,
  dt: number,
  repo?: ScoreRepo,
): void {
  if (state.status !== 'running') return;

  physics.step(dt);
  const pos = physics.getBallPosition();
  publisher.broadcast({ type: 'ball_position', payload: pos });

  const hits = physics.consumeFlipperHits();
  const bumperHits = physics.consumeBumperHits();
  let scoreChanged = false;
  if (hits > 0) {
    state.score += hits * FLIPPER_HIT_POINTS * state.multiplier;
    scoreChanged = true;
  }
  for (const b of bumperHits) {
    state.score += BUMPER_HIT_POINTS * state.multiplier;
    publisher.broadcast({ type: 'bumper_hit', payload: { id: b.id, x: b.x, z: b.z } });
    scoreChanged = true;
  }
  if (scoreChanged) publishScoreUpdate(state, publisher);
  const sep = physics.getLaneSeparatorX();
  if (!state.ballInLane) {
    // Nudge ball toward main field when near far end of lane (Z≈-7 to -8).
    const nearMouthX = sep > 0 ? pos.x > sep - 0.6 : pos.x < sep + 0.6;
    const nearMouthZ = pos.z < PLAYFIELD.launchLane.zMin + 0.5; // near far end (Z=-8)
    if (nearMouthX && nearMouthZ) {
      physics.applyBallImpulse({ x: sep > 0 ? -3 : 3, y: 0, z: 0.5 });
    }
  }

  // Ball is outside the lane when it has crossed the separator toward the main field.
  const outsideLane = sep > 0 ? pos.x < sep : pos.x > sep;
  // Drain: ball passed flippers (Z≈-1.9) going toward +Z.
  const drained = pos.y < PLAYFIELD.drain.yThreshold || (pos.z > DRAIN_Z && outsideLane);
  if (!drained) return;

  state.ballsLeft -= 1;
  publisher.broadcast({
    type: 'ball_drained',
    payload: { ballsLeft: state.ballsLeft },
  });

  if (state.ballsLeft <= 0) {
    state.status = 'over';
    state.endedAt = Date.now();
    publisher.broadcast({
      type: 'game_over',
      payload: { finalScore: state.score },
    });
    if (repo && state.score > 0) {
      void repo
        .saveFinal({
          playerId: state.player.wallet ?? 'guest',
          points: state.score,
          achievedAt: new Date(),
        })
        .catch(() => {
          /* repo errors are non-fatal */
        });
    }
    return;
  }

  physics.resetBall();
  state.ballInLane = true;
  publisher.broadcast({
    type: 'ball_position',
    payload: physics.getBallPosition(),
  });
}
