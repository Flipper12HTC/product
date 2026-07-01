import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { RapierPhysicsWorld } from '../../src/infrastructure/physics/rapier-world.js';
import { tickGame } from '../../src/application/use-cases/tick-game.js';
import { createInitialState } from '../../src/domain/game.js';
import type { GamePublisher, GameEvent } from '../../src/application/ports/game-publisher.js';

const DT = 1 / 60;
const physics = new RapierPhysicsWorld();

const nullPublisher: GamePublisher = {
  broadcast: (_event: GameEvent) => {
    /* no-op */
  },
};

describe('physics loop performance', () => {
  before(async () => {
    await physics.init();
  });

  it('1000 ticks: max < 50ms (GC spikes ok), mean < 10ms', () => {
    const state = createInitialState();
    state.status = 'running';
    state.ballsLeft = Number.MAX_SAFE_INTEGER;

    for (let i = 0; i < 100; i++) tickGame(state, physics, nullPublisher, DT);

    const durations: number[] = [];
    for (let i = 0; i < 1000; i++) {
      const t0 = performance.now();
      tickGame(state, physics, nullPublisher, DT);
      durations.push(performance.now() - t0);
    }

    const max = Math.max(...durations);
    const mean = durations.reduce((a, b) => a + b, 0) / durations.length;

    assert.ok(max < 50, `max tick ${max.toFixed(2)}ms >= 50ms`);
    assert.ok(mean < 10, `mean tick ${mean.toFixed(2)}ms >= 10ms`);
  });
});
