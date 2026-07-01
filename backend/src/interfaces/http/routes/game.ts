import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../app.js';
import { startGame } from '../../../application/use-cases/start-game.js';
import { endGame } from '../../../application/use-cases/end-game.js';
import { setFlipperState } from '../../../application/use-cases/set-flipper-state.js';
import {
  createPlungerState,
  plungerPress,
  plungerRelease,
} from '../../../application/use-cases/launch-ball.js';
import type { FlipperSide } from '../../../domain/flipper.js';

function parseSide(raw: unknown): FlipperSide | null {
  return raw === 'left' || raw === 'right' ? raw : null;
}

export async function registerGameRoutes(app: FastifyInstance, deps: AppDeps): Promise<void> {
  const { state, physics, publisher, scoreRepo } = deps;
  const plunger = createPlungerState();

  app.post('/game/start', async (_req, reply) => {
    if (state.status === 'running') {
      await reply.code(409).send({ error: 'game already running' });
      return;
    }
    startGame(state, physics, publisher);
    return { ok: true, status: state.status };
  });

  // TEMP test mode: hard reset of the running game (bound to R key on the screens)
  app.post('/game/restart', async () => {
    startGame(state, physics, publisher);
    return { ok: true, status: state.status };
  });

  app.post('/game/end', async (_req, reply) => {
    if (state.status !== 'running') {
      await reply.code(409).send({ error: 'no game running' });
      return;
    }
    endGame(state, publisher, scoreRepo);
    return { ok: true, status: state.status };
  });

  app.post('/game/flipper/:side/:action', async (req, reply) => {
    const params = req.params as { side?: unknown; action?: unknown };
    const side = parseSide(params.side);
    const action = params.action;
    if (side === null) {
      await reply.code(400).send({ error: 'invalid side' });
      return;
    }
    if (action !== 'press' && action !== 'release') {
      await reply.code(400).send({ error: 'invalid action' });
      return;
    }
    setFlipperState(physics, publisher, side, action === 'press');
    return { ok: true, side, action };
  });

  app.get('/game/state', async () => ({
    status: state.status,
    score: state.score,
    ballsLeft: state.ballsLeft,
    multiplier: state.multiplier,
    activeFlipper: state.activeFlipper,
    player: state.player,
    startedAt: state.startedAt,
    endedAt: state.endedAt,
  }));

  app.get('/game/reset', async () => {
    physics.resetBall();
    return { ok: true };
  });

  app.post('/game/plunger/press', async () => {
    plungerPress(plunger);
    return { ok: true };
  });

  app.post('/game/plunger/release', async () => {
    const force = plungerRelease(plunger, state, physics, publisher);
    return { ok: true, force };
  });
}
