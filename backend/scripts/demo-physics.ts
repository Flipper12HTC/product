import { RapierPhysicsWorld } from '../src/infrastructure/physics/rapier-world.js';

const physics = new RapierPhysicsWorld();
await physics.init();

const DT = 1 / 60;
const TICKS = Math.floor(5 / DT);

console.log('t(s),x,y,z');

for (let i = 0; i < TICKS; i++) {
  physics.step(DT);
  const t = ((i + 1) * DT).toFixed(3);
  const { x, y, z } = physics.getBallPosition();
  console.log(`${t},${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`);
}
