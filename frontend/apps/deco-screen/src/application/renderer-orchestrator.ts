import type { GameSource } from './ports/game-source';
import type { DecoTrigger } from '../domain/deco-event';

export interface EffectsRunner {
  trigger: (event: DecoTrigger) => void;
  tick: (deltaMs: number) => void;
}

export interface Orchestrator {
  start: () => void;
  stop: () => void;
}

export function createRendererOrchestrator(
  source: GameSource,
  effects: EffectsRunner,
): Orchestrator {
  const unsubs: (() => void)[] = [];

  return {
    start(): void {
      unsubs.push(
        source.on('bumper_hit', (event) => {
          effects.trigger({ kind: 'bumper', at: { x: event.payload.x, z: event.payload.z } });
        }),
        source.on('slingshot_hit', (event) => {
          effects.trigger({ kind: 'slingshot', at: { x: event.payload.x, z: event.payload.z } });
        }),
      );
      source.start();
    },
    stop(): void {
      for (const u of unsubs) u();
      unsubs.length = 0;
      source.stop();
    },
  };
}
