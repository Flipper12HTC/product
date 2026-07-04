import type { FlipperSide } from '../../domain/flipper.js';

export interface InputSource {
  connect(): void;
  onButtonPress(cb: (side: FlipperSide) => void): void;
  onButtonRelease(cb: (side: FlipperSide) => void): void;
  onStart(cb: () => void): void;
  onRestart(cb: () => void): void;
  onPlunger(cb: (pressed: boolean) => void): void;
}
