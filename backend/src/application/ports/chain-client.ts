import type { Score } from '../../domain/score.js';

export interface ChainClient {
  recordScore(wallet: string, score: Score): Promise<void>;
  payoutWinners(wallets: string[]): Promise<void>;
}
