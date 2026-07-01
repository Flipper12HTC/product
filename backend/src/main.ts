import { RapierPhysicsWorld } from './infrastructure/physics/rapier-world.js';
import { MqttInputSource } from './infrastructure/mqtt/mqtt-input-source.js';
import { FastifyWsPublisher } from './infrastructure/ws/fastify-ws-publisher.js';
import { PostgresScoreRepo } from './infrastructure/storage/postgres-score-repo.js';
import { SolanaClient } from './infrastructure/blockchain/solana-client.js';
import { buildApp, startApp, stopApp } from './interfaces/http/app.js';
import { tickGame } from './application/use-cases/tick-game.js';
import { setFlipperState } from './application/use-cases/set-flipper-state.js';
import { createInitialState } from './domain/game.js';

const physics = new RapierPhysicsWorld();
const publisher = new FastifyWsPublisher();
const mqttInput = new MqttInputSource();

new SolanaClient();

const scoreRepo = new PostgresScoreRepo();
try {
  await scoreRepo.init();
} catch (err) {
  console.error('[score-repo] init failed, scores will not persist:', err);
}

await physics.init();

const state = createInitialState();

const app = await buildApp({
  onWsConnect: (socket) => publisher.addClient(socket),
  physics,
  publisher,
  state,
  scoreRepo,
});

await startApp(app);

mqttInput.onButtonPress((side) => setFlipperState(physics, publisher, side, true));
mqttInput.onButtonRelease((side) => setFlipperState(physics, publisher, side, false));
mqttInput.connect();

const DT = 1 / 60;
setInterval(() => {
  tickGame(state, physics, publisher, DT, scoreRepo);
}, DT * 1000);

function shutdown(signal: string): void {
  console.log(`${signal} received, shutting down`);
  stopApp(app)
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
