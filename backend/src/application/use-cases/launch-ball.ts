import type { PhysicsWorld } from '../ports/physics-world.js';
import type { GamePublisher } from '../ports/game-publisher.js';
import type { GameState } from '../../domain/game.js';

export const PLUNGER_MAX_HOLD_MS = 800;
export const PLUNGER_MAX_IMPULSE = 35;

export interface PlungerState {
  pressedAt: number | null;
}

export function createPlungerState(): PlungerState {
  return { pressedAt: null };
}

export function plungerPress(plunger: PlungerState, now: number = Date.now()): void {
  if (plunger.pressedAt !== null) return;
  plunger.pressedAt = now;
}

export function plungerRelease(
  plunger: PlungerState,
  state: GameState,
  physics: PhysicsWorld,
  publisher: GamePublisher,
  now: number = Date.now(),
): number | null {
  const pressedAt = plunger.pressedAt;
  plunger.pressedAt = null;
  if (pressedAt === null) return null;
  if (state.status !== 'running') return null;
  // Plunger only fires when the ball is sitting in the launch lane.
  // Once launched, no more impulses until the ball drains and respawns.
  if (!state.ballInLane) return null;

  const holdMs = Math.max(0, now - pressedAt);
  const force = Math.min(holdMs / PLUNGER_MAX_HOLD_MS, 1);

  physics.applyBallImpulse({ x: 0, y: 0, z: -force * PLUNGER_MAX_IMPULSE }); // -Z = toward far end (Z=-8)
  state.ballInLane = false;
  publisher.broadcast({ type: 'ball_launched', payload: { force } });
  return force;
}
