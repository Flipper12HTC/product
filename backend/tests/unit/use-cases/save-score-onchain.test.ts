import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { saveScoreOnchain } from '../../../src/application/use-cases/save-score-onchain.js';
import type { ScoreRepo } from '../../../src/application/ports/score-repo.js';
import type { ChainClient } from '../../../src/application/ports/chain-client.js';
import type { Score } from '../../../src/domain/score.js';

const score: Score = { playerId: 'p1', points: 42, achievedAt: new Date() };

let savedScore: Score | null = null;
let recordedWallet: string | null = null;

const mockRepo: ScoreRepo = {
  saveFinal: async (s) => {
    savedScore = s;
  },
  listTop: async () => [],
};

const mockChain: ChainClient = {
  recordScore: async (wallet) => {
    recordedWallet = wallet;
  },
  payoutWinners: async () => {},
};

describe('saveScoreOnchain', () => {
  it('saves to repo and records on chain', async () => {
    await saveScoreOnchain(mockRepo, mockChain, '0xabc', score);
    assert.deepEqual(savedScore, score);
    assert.equal(recordedWallet, '0xabc');
  });
});
