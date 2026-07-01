import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { tickGame } from '../../../src/application/use-cases/tick-game.js';
import { createInitialState } from '../../../src/domain/game.js';
import { PLAYFIELD } from '../../../src/domain/playfield.js';
import type { Vec3 } from '../../../src/domain/ball.js';
import type { PhysicsWorld } from '../../../src/application/ports/physics-world.js';
import type { GamePublisher, GameEvent } from '../../../src/application/ports/game-publisher.js';

let stepped = false;
let resetCalled = false;
let ballPos: Vec3 = { x: 1, y: 2, z: 3 };
let hitsToReturn = 0;
let published: GameEvent[] = [];

const mockPhysics: PhysicsWorld = {
  init: async () => {},
  step: () => {
    stepped = true;
  },
  getBallPosition: () => ballPos,
  resetBall: () => {
    resetCalled = true;
    ballPos = { x: 0, y: 0.4, z: 0 };
  },
  applyBallImpulse: () => {},
  getBallSpeed: () => 0,
  setFlipperActive: () => {},
  consumeFlipperHits: () => {
    const n = hitsToReturn;
    hitsToReturn = 0;
    return n;
  },
  consumeBumperHits: () => [],
  getLaneSeparatorX: () => 3.5,
};

const mockPublisher: GamePublisher = {
  broadcast: (event) => {
    published.push(event);
  },
};

describe('tickGame', () => {
  beforeEach(() => {
    stepped = false;
    resetCalled = false;
    ballPos = { x: 1, y: 2, z: 3 };
    hitsToReturn = 0;
    published = [];
  });

  it('does nothing when status is idle', () => {
    const state = createInitialState();
    tickGame(state, mockPhysics, mockPublisher, 1 / 60);
    assert.equal(stepped, false);
    assert.equal(published.length, 0);
  });

  it('does nothing when status is over', () => {
    const state = createInitialState();
    state.status = 'over';
    tickGame(state, mockPhysics, mockPublisher, 1 / 60);
    assert.equal(stepped, false);
    assert.equal(published.length, 0);
  });

  it('steps physics and broadcasts ball_position when running', () => {
    const state = createInitialState();
    state.status = 'running';
    tickGame(state, mockPhysics, mockPublisher, 1 / 60);
    assert.ok(stepped, 'physics.step should be called');
    assert.equal(published.length, 1);
    assert.equal(published[0]!.type, 'ball_position');
    assert.deepEqual((published[0] as Extract<GameEvent, { type: 'ball_position' }>).payload, {
      x: 1,
      y: 2,
      z: 3,
    });
  });

  it('adds 50 * multiplier per flipper hit and broadcasts score_update', () => {
    const state = createInitialState();
    state.status = 'running';
    state.score = 0;
    state.multiplier = 1;
    hitsToReturn = 2;

    tickGame(state, mockPhysics, mockPublisher, 1 / 60);

    assert.equal(state.score, 100);
    const scoreEvt = published.find((e) => e.type === 'score_update');
    assert.ok(scoreEvt);
    assert.equal((scoreEvt as Extract<GameEvent, { type: 'score_update' }>).payload.score, 100);
  });

  it('drains ball, decrements ballsLeft and respawns when balls remain', () => {
    const state = createInitialState();
    state.status = 'running';
    state.ballsLeft = 3;
    ballPos = { x: 0, y: -2, z: 0 };

    tickGame(state, mockPhysics, mockPublisher, 1 / 60);

    assert.equal(state.ballsLeft, 2);
    assert.equal(state.status, 'running');
    assert.ok(resetCalled, 'resetBall should be called');
    const drained = published.find((e) => e.type === 'ball_drained');
    assert.ok(drained);
    assert.equal((drained as Extract<GameEvent, { type: 'ball_drained' }>).payload.ballsLeft, 2);
  });

  it('detects drain via z threshold (ball passed bottom wall gap)', () => {
    const state = createInitialState();
    state.status = 'running';
    state.ballsLeft = 3;
    ballPos = { x: 0, y: 0.4, z: PLAYFIELD.depth / 2 + 1 };

    tickGame(state, mockPhysics, mockPublisher, 1 / 60);

    assert.equal(state.ballsLeft, 2);
    const drained = published.find((e) => e.type === 'ball_drained');
    assert.ok(drained);
  });

  it('transitions to over and emits game_over when last ball drains', () => {
    const state = createInitialState();
    state.status = 'running';
    state.ballsLeft = 1;
    state.score = 4242;
    ballPos = { x: 0, y: -2, z: 0 };

    tickGame(state, mockPhysics, mockPublisher, 1 / 60);

    assert.equal(state.ballsLeft, 0);
    assert.equal(state.status, 'over');
    assert.ok(state.endedAt !== null);
    assert.equal(resetCalled, false, 'resetBall must NOT be called on final drain');
    const over = published.find((e) => e.type === 'game_over');
    assert.ok(over);
    assert.equal((over as Extract<GameEvent, { type: 'game_over' }>).payload.finalScore, 4242);
  });
});
