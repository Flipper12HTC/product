import { RapierPhysicsWorld } from '../src/infrastructure/physics/rapier-world.js';

const physics = new RapierPhysicsWorld();
await physics.init();

const DT = 1 / 60;

// Settle ball
for (let i = 0; i < 60; i++) physics.step(DT);
const settled = physics.getBallPosition();
console.log(`settled: x=${settled.x.toFixed(3)} y=${settled.y.toFixed(3)} z=${settled.z.toFixed(3)} speed=${physics.getBallSpeed().toFixed(3)}`);

// Launch
physics.applyBallImpulse({ x: 0, y: 0, z: -18 });

console.log('\nt(s),x,y,z,speed');
for (let i = 0; i < 240; i++) {
  physics.step(DT);
  if (i % 6 === 0) {
    const p = physics.getBallPosition();
    const s = physics.getBallSpeed();
    console.log(`${((i + 1) * DT).toFixed(3)},${p.x.toFixed(3)},${p.y.toFixed(3)},${p.z.toFixed(3)},${s.toFixed(2)}`);
  }
}
