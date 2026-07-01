import type { GameEvent, GameEventType } from './events';

export type Unsubscribe = () => void;

export interface GameSource {
  start(): void;
  stop(): void;
  on<T extends GameEventType>(
    type: T,
    handler: (event: Extract<GameEvent, { type: T }>) => void,
  ): Unsubscribe;
}

export type FlipperSide = 'left' | 'right';

export interface InputSink {
  start(): void;
  stop(): void;
  onPress(handler: (side: FlipperSide) => void): Unsubscribe;
  onRelease(handler: (side: FlipperSide) => void): Unsubscribe;
}
