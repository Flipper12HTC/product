import { describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { RapierPhysicsWorld } from '../../src/infrastructure/physics/rapier-world.js';
import { PLAYFIELD } from '../../src/domain/playfield.js';

const DT = 1 / 60;
const physics = new RapierPhysicsWorld();

describe('flipper physics', () => {
  before(async () => {
    await physics.init({ wallHeight: 10 });
  });

  beforeEach(() => {
    physics.setBallPosition({ x: 0, y: 5, z: 0 });
    physics.setFlipperActive('left', false);
    physics.setFlipperActive('right', false);
    for (let i = 0; i < 30; i++) physics.step(DT);
    physics.consumeFlipperHits();
  });

  // Ball rolls into the flipper (+Z) in motion, flip → expect a hit + ball sent back up-field.
  function batsBall(side: 'left' | 'right'): { upField: boolean; hits: number } {
    const f = side === 'left' ? PLAYFIELD.flippers.left : PLAYFIELD.flippers.right;
    const dir = side === 'left' ? 1 : -1;
    physics.setBallPosition({ x: f.x + dir * 1.0, y: f.y + 0.4, z: f.z - 1.0 });
    physics.applyBallImpulse({ x: 0, y: 0, z: 4 });
    physics.setFlipperActive(side, true);
    let hits = 0;
    for (let i = 0; i < 25; i++) {
      physics.step(DT);
      hits += physics.consumeFlipperHits();
    }
    return { upField: physics.getBallPosition().z < f.z, hits };
  }

  it('left flipper bats an incoming ball up-field and registers a hit', () => {
    const { upField, hits } = batsBall('left');
    assert.ok(hits > 0, 'flipper contact should register a hit');
    assert.ok(upField, 'ball should be sent up-field');
  });

  it('right flipper bats an incoming ball up-field and registers a hit', () => {
    const { upField, hits } = batsBall('right');
    assert.ok(hits > 0, 'flipper contact should register a hit');
    assert.ok(upField, 'ball should be sent up-field');
  });

  it('flipper returns to rest after release', () => {
    const flipper = PLAYFIELD.flippers.left;
    physics.setBallPosition({ x: flipper.x + 1.0, y: flipper.y + 0.6, z: flipper.z - 0.4 });
    for (let i = 0; i < 5; i++) physics.step(DT);
    physics.setFlipperActive('left', true);
    for (let i = 0; i < 9; i++) physics.step(DT);
    physics.setFlipperActive('left', false);
    for (let i = 0; i < 90; i++) physics.step(DT);
    const settled = physics.getBallPosition();
    for (let i = 0; i < 30; i++) physics.step(DT);
    const later = physics.getBallPosition();
    assert.ok(later.y <= settled.y + 0.1, 'ball should not keep rising after release');
  });
});
