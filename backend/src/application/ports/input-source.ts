import type { FlipperSide } from '../../domain/flipper.js';

export interface InputSource {
  onButtonPress(cb: (side: FlipperSide) => void): void;
  onButtonRelease(cb: (side: FlipperSide) => void): void;
  onTilt(cb: () => void): void;
  onDrain(cb: () => void): void;
}
