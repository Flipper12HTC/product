import type { FlipperSide } from '@flipper/contracts';

export interface BallPosition {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface FlipperState {
  readonly side: FlipperSide;
  readonly active: boolean;
}
