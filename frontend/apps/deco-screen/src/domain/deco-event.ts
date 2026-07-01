export type DecoEffectKind = 'bumper' | 'slingshot' | 'drain' | 'game-over';

export interface DecoTrigger {
  readonly kind: DecoEffectKind;
  readonly at: { x: number; z: number };
}
