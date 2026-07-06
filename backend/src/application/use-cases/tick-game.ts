import type { PhysicsWorld } from '../ports/physics-world.js';
import type { GamePublisher } from '../ports/game-publisher.js';
import type { ScoreRepo } from '../ports/score-repo.js';
import type { GameState } from '../../domain/game.js';
import {
  BOOST_DURATION_MS,
  BOOST_MULTIPLIER,
  BUMPER_BOOST_THRESHOLD,
  INITIAL_MULTIPLIER,
} from '../../domain/game.js';
import { PLAYFIELD } from '../../domain/playfield.js';
import { endGame } from './end-game.js';

// Ball drains when it reaches the back wall behind the flippers (Z≈7.5, clearly past the
// flipper pivot at Z≈6.635). Using the flipper pivot as threshold was too aggressive —
// the ball was reset while still near the flippers before the player could react.
const DRAIN_Z = PLAYFIELD.drain.zThreshold;

// Scoring rules: every hit is worth its base points times the current multiplier.
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

// One simulation tick, called at 60 Hz from the composition root (main.ts).
// The order matters and is the whole contract of this function:
//   1. advance the physics by one fixed timestep,
//   2. expire the boost (wall clock),
//   3. consume the hits accumulated by the physics and turn them into score,
//   4. check the drain -> respawn the ball or end the game.
//
// `dt` and `now` are injected so tests can run with a fixed timestep and a
// controlled clock (e.g. "advance 10s" without actually waiting 10s).
export function tickGame(
  state: GameState,
  physics: PhysicsWorld,
  publisher: GamePublisher,
  dt: number,
  repo?: ScoreRepo,
  now: number = Date.now(),
): void {
  // Outside a running game the loop is a no-op: the interval in main.ts never
  // stops, the state machine decides whether a tick does anything.
  if (state.status !== 'running') return;

  // 1. Advance the simulation by one fixed step and stream the ball position.
  physics.step(dt);
  const pos = physics.getBallPosition();
  publisher.broadcast({ type: 'ball_position', payload: pos });

  let boostChanged = false;
  // 2. Expire the x3 boost on wall-clock time so it survives ball respawns
  // and stays exact even if some ticks run late.
  if (state.boostUntil !== null && now >= state.boostUntil) {
    state.boostUntil = null;
    state.multiplier = INITIAL_MULTIPLIER;
    boostChanged = true;
  }

  // 3. Consume pattern: the physics adapter ACCUMULATED the impacts during
  // step(); consuming reads and resets its counters in one call. No callback
  // from infrastructure into the application layer (that arrow is forbidden),
  // and no hit can be lost between two ticks.
  const hits = physics.consumeFlipperHits();
  const bumperHits = physics.consumeBumperHits();
  let scoreChanged = false;
  if (hits > 0) {
    state.score += hits * FLIPPER_HIT_POINTS * state.multiplier;
    scoreChanged = true;
  }
  for (const b of bumperHits) {
    state.score += BUMPER_HIT_POINTS * state.multiplier;
    // Each bumper hit is broadcast individually: the front screen shakes the
    // camera and animates the exact jellyfish that was hit.
    publisher.broadcast({ type: 'bumper_hit', payload: { id: b.id, x: b.x, z: b.z } });
    scoreChanged = true;

    // Every 10th jellyfish hit (re)triggers a 10s x3 boost.
    state.bumperHitCount += 1;
    if (state.bumperHitCount % BUMPER_BOOST_THRESHOLD === 0) {
      state.multiplier = BOOST_MULTIPLIER;
      state.boostUntil = now + BOOST_DURATION_MS;
      boostChanged = true;
    }
  }

  // Events are only broadcast on change — not 60 times per second — so the
  // screens repaint the score exactly when it moves.
  if (boostChanged) {
    const active = state.boostUntil !== null;
    publisher.broadcast({
      type: 'boost_changed',
      payload: {
        active,
        multiplier: state.multiplier,
        durationMs: active ? BOOST_DURATION_MS : 0,
      },
    });
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

  // 4. Drain detection needs TWO conditions: past the drain line (Z) AND
  // outside the launch lane. Without the lane check, the ball was counted
  // as lost during its own launch (real bug we shipped and fixed).
  // Ball is outside the lane when it has crossed the separator toward the main field.
  const outsideLane = sep > 0 ? pos.x < sep : pos.x > sep;
  // Drain: ball passed the flippers (pivots at Z≈6.48) and crossed the drain threshold (Z=7.5).
  const drained = pos.y < PLAYFIELD.drain.yThreshold || (pos.z > DRAIN_Z && outsideLane);
  if (!drained) return;

  state.ballsLeft -= 1;
  publisher.broadcast({
    type: 'ball_drained',
    payload: { ballsLeft: state.ballsLeft },
  });

  // Last ball lost -> the game is over (endGame broadcasts and persists).
  if (state.ballsLeft <= 0) {
    endGame(state, publisher, repo, now);
    return;
  }

  // Balls remaining -> respawn at the plunger and keep playing.
  physics.resetBall();
  state.ballInLane = true;
  publisher.broadcast({
    type: 'ball_position',
    payload: physics.getBallPosition(),
  });
}
