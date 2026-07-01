import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setFlipperState } from '../../../src/application/use-cases/set-flipper-state.js';
import type { PhysicsWorld } from '../../../src/application/ports/physics-world.js';
import type { GamePublisher, GameEvent } from '../../../src/application/ports/game-publisher.js';
import type { FlipperSide } from '../../../src/domain/flipper.js';

let lastFlipperCall: { side: FlipperSide; active: boolean } | null = null;
let published: GameEvent[] = [];

const mockPhysics: PhysicsWorld = {
  init: async () => {},
  step: () => {},
  getBallPosition: () => ({ x: 0, y: 0, z: 0 }),
  resetBall: () => {},
  applyBallImpulse: () => {},
  getBallSpeed: () => 0,
  setFlipperActive: (side, active) => {
    lastFlipperCall = { side, active };
  },
  consumeFlipperHits: () => 0,
  consumeBumperHits: () => [],
  getLaneSeparatorX: () => 3.5,
};

const mockPublisher: GamePublisher = {
  broadcast: (event) => {
    published.push(event);
  },
};

describe('setFlipperState', () => {
  beforeEach(() => {
    lastFlipperCall = null;
    published = [];
  });

  it('forwards press to physics and broadcasts active flipper_state', () => {
    setFlipperState(mockPhysics, mockPublisher, 'left', true);
    assert.deepEqual(lastFlipperCall, { side: 'left', active: true });
    assert.equal(published.length, 1);
    assert.equal(published[0]!.type, 'flipper_state');
    assert.deepEqual((published[0] as Extract<GameEvent, { type: 'flipper_state' }>).payload, {
      side: 'left',
      active: true,
    });
  });

  it('forwards release to physics and broadcasts inactive flipper_state', () => {
    setFlipperState(mockPhysics, mockPublisher, 'right', false);
    assert.deepEqual(lastFlipperCall, { side: 'right', active: false });
    assert.equal(published.length, 1);
    assert.deepEqual((published[0] as Extract<GameEvent, { type: 'flipper_state' }>).payload, {
      side: 'right',
      active: false,
    });
  });
});
