import type { GameSource } from './ports/game-source';
import type { DecoTrigger } from '../domain/deco-event';

/**
 * The reactive 3D stage (SpongeBob + particle bursts). Each method maps a class
 * of game event to a visual reaction. Implementations must tolerate being
 * called in any order and at any time.
 */
export interface DecoStage {
  trigger: (event: DecoTrigger) => void;
  reactScore: () => void;
  reactBoost: (active: boolean) => void;
  reactDrain: () => void;
  reactGameOver: () => void;
  reactReset: () => void;
  tick: (deltaMs: number) => void;
  dispose: () => void;
}

export interface Orchestrator {
  start: () => void;
  stop: () => void;
}

export function createRendererOrchestrator(source: GameSource, stage: DecoStage): Orchestrator {
  const unsubs: (() => void)[] = [];
  let wasIdle = true;

  return {
    start(): void {
      unsubs.push(
        source.on('bumper_hit', (event) => {
          stage.trigger({ kind: 'bumper', at: { x: event.payload.x, z: event.payload.z } });
        }),
        source.on('slingshot_hit', (event) => {
          stage.trigger({ kind: 'slingshot', at: { x: event.payload.x, z: event.payload.z } });
        }),
        source.on('score_update', () => {
          // First score after an idle/game-over period = a fresh game started.
          if (wasIdle) {
            stage.reactReset();
            wasIdle = false;
          }
          stage.reactScore();
        }),
        source.on('ball_drained', () => {
          stage.trigger({ kind: 'drain', at: { x: 0, z: 0 } });
          stage.reactDrain();
        }),
        source.on('boost_changed', (event) => {
          stage.reactBoost(event.payload.active);
        }),
        source.on('game_over', () => {
          stage.trigger({ kind: 'game-over', at: { x: 0, z: 0 } });
          stage.reactGameOver();
          wasIdle = true;
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
