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

export interface GameSnapshot {
  readonly ball: BallPosition;
  readonly score: number;
  readonly ballsLeft: number;
  readonly gameOver: boolean;
}

export const INITIAL_SNAPSHOT: GameSnapshot = {
  ball: { x: 0, y: 0.4, z: 0 },
  score: 0,
  ballsLeft: 3,
  gameOver: false,
};
