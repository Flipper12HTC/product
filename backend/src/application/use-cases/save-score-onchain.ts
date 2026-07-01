import type { ScoreRepo } from '../ports/score-repo.js';
import type { ChainClient } from '../ports/chain-client.js';
import type { Score } from '../../domain/score.js';

export async function saveScoreOnchain(
  repo: ScoreRepo,
  chain: ChainClient,
  wallet: string,
  score: Score,
): Promise<void> {
  await repo.saveFinal(score);
  await chain.recordScore(wallet, score);
}
