import type { PhysicsWorld } from '../ports/physics-world.js';
import type { GamePublisher } from '../ports/game-publisher.js';
import type { FlipperSide } from '../../domain/flipper.js';

export function setFlipperState(
  physics: PhysicsWorld,
  publisher: GamePublisher,
  side: FlipperSide,
  active: boolean,
): void {
  physics.setFlipperActive(side, active);
  publisher.broadcast({
    type: 'flipper_state',
    payload: { side, active },
  });
}
