import type { Vec3 } from '../../domain/ball.js';
import type { FlipperSide } from '../../domain/flipper.js';

export interface BallConfig {
  radius: number;
  mass: number;
  restitution: number;
  friction: number;
}

export interface BumperHit {
  id: string;
  x: number;
  z: number;
}

export interface PhysicsWorld {
  init(config?: Partial<BallConfig>): Promise<void>;
  step(dt: number): void;
  getBallPosition(): Vec3;
  getBallSpeed(): number;
  resetBall(): void;
  applyBallImpulse(impulse: Vec3): void;
  setFlipperActive(side: FlipperSide, active: boolean): void;
  consumeFlipperHits(): number;
  consumeBumperHits(): BumperHit[];
  /** X coordinate of the separator between the launch lane and the main playfield.
   *  Derived from the GLB geometry at init time — not hardcoded. */
  getLaneSeparatorX(): number;
}
