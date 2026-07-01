import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { endGame } from '../../../src/application/use-cases/end-game.js';
import { createInitialState } from '../../../src/domain/game.js';
import type { GamePublisher, GameEvent } from '../../../src/application/ports/game-publisher.js';
import type { ScoreRepo } from '../../../src/application/ports/score-repo.js';
import type { Score } from '../../../src/domain/score.js';

let published: GameEvent | null = null;
let savedScore: Score | null = null;

const mockPublisher: GamePublisher = {
  broadcast: (event) => {
    published = event;
  },
};

const mockRepo: ScoreRepo = {
  saveFinal: async (score) => {
    savedScore = score;
    return Promise.resolve();
  },
  listTop: async () => Promise.resolve([]),
};

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('endGame', () => {
  beforeEach(() => {
    published = null;
    savedScore = null;
  });

  it('passes status to over and broadcasts game_over with finalScore', () => {
    const state = createInitialState();
    state.status = 'running';
    state.score = 1234;

    endGame(state, mockPublisher);

    assert.equal(state.status, 'over');
    assert.ok(state.endedAt !== null);
    assert.ok(published !== null);
    assert.equal(published!.type, 'game_over');
    assert.equal((published as Extract<GameEvent, { type: 'game_over' }>).payload.finalScore, 1234);
  });

  it('does nothing if already over', () => {
    const state = createInitialState();
    state.status = 'over';

    endGame(state, mockPublisher);

    assert.equal(published, null);
  });

  it('does nothing if idle', () => {
    const state = createInitialState();
    endGame(state, mockPublisher);
    assert.equal(published, null);
  });

  it('saves the final score via repo when repo provided', async () => {
    const state = createInitialState();
    state.status = 'running';
    state.score = 4242;

    endGame(state, mockPublisher, mockRepo);
    await flushMicrotasks();

    assert.ok(savedScore !== null);
    assert.equal(savedScore!.points, 4242);
    assert.equal(savedScore!.playerId, 'guest');
  });

  it('uses wallet as playerId when provided', async () => {
    const state = createInitialState();
    state.status = 'running';
    state.score = 100;
    state.player.wallet = 'WALLET_ABC';

    endGame(state, mockPublisher, mockRepo);
    await flushMicrotasks();

    assert.ok(savedScore !== null);
    assert.equal(savedScore!.playerId, 'WALLET_ABC');
  });

  it('does not save when score is 0', async () => {
    const state = createInitialState();
    state.status = 'running';
    state.score = 0;

    endGame(state, mockPublisher, mockRepo);
    await flushMicrotasks();

    assert.equal(savedScore, null);
  });
});
