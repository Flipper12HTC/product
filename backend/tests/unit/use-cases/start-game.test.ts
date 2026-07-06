import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startGame } from '../../../src/application/use-cases/start-game.js';
import { createInitialState } from '../../../src/domain/game.js';
import type { PhysicsWorld } from '../../../src/application/ports/physics-world.js';
import type { GamePublisher, GameEvent } from '../../../src/application/ports/game-publisher.js';

// Unit tests for the startGame use-case. No Rapier, no WebSocket: both ports
// are replaced by test doubles, so these tests run in milliseconds and only
// exercise OUR logic — not the physics engine.

// Spies: plain variables the doubles write into, so each test can observe
// what the use-case did (which port method was called, what was broadcast).
let resetCalled = false;
let published: GameEvent[] = [];

// Test double for the PhysicsWorld port. TypeScript's structural typing
// checks it against the real contract — no `implements` keyword needed.
const mockPhysics: PhysicsWorld = {
  init: async () => {},
  step: () => {},
  getBallPosition: () => ({ x: 0, y: 0.4, z: 0 }),
  resetBall: () => {
    resetCalled = true; // spy: proves startGame sent the ball back to the plunger
  },
  applyBallImpulse: () => {},
  getBallSpeed: () => 0,
  setFlipperActive: () => {},
  consumeFlipperHits: () => 0,
  consumeBumperHits: () => [],
  getLaneSeparatorX: () => 3.5,
};

// Fake publisher: captures every event instead of sending it over the wire,
// so assertions can inspect the exact payloads the screens would receive.
const mockPublisher: GamePublisher = {
  broadcast: (event) => {
    published.push(event);
  },
};

describe('startGame', () => {
  // Reset the spies before EVERY test: tests stay independent of each other
  // (no shared state, no required order).
  beforeEach(() => {
    resetCalled = false;
    published = [];
  });

  it('passes status to running and resets counters', () => {
    // Arrange: a DIRTY state, as left by a finished game.
    const state = createInitialState();
    state.status = 'over';
    state.score = 999;
    state.ballsLeft = 0;
    state.multiplier = 5;

    // Act: one call — startGame is also our restart.
    startGame(state, mockPhysics, mockPublisher);

    // Assert: EVERYTHING is back to a fresh game. This test freezes the
    // design decision "create = restart, one single reset path".
    assert.equal(state.status, 'running');
    assert.equal(state.score, 0);
    assert.equal(state.ballsLeft, 3);
    assert.equal(state.multiplier, 1);
    assert.equal(state.activeFlipper, null);
    assert.ok(state.startedAt !== null);
    assert.equal(state.endedAt, null);
  });

  it('resets the ball', () => {
    startGame(createInitialState(), mockPhysics, mockPublisher);
    // The spy proves the port was called — we test the INTERACTION, not Rapier.
    assert.ok(resetCalled, 'resetBall should be called');
  });

  it('broadcasts score_update with initial counters', () => {
    startGame(createInitialState(), mockPhysics, mockPublisher);
    const score = published.find((e) => e.type === 'score_update');
    assert.ok(score);
    // deepEqual on the payload: the exact shape the screens rely on.
    assert.deepEqual((score as Extract<GameEvent, { type: 'score_update' }>).payload, {
      score: 0,
      ballsLeft: 3,
      multiplier: 1,
    });
  });

  it('broadcasts initial ball_position so frontend can show the ball', () => {
    startGame(createInitialState(), mockPhysics, mockPublisher);
    const pos = published.find((e) => e.type === 'ball_position');
    assert.ok(pos);
  });
});
