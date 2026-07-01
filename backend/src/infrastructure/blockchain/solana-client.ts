import type { ChainClient } from '../../application/ports/chain-client.js';
import type { Score } from '../../domain/score.js';

export class SolanaClient implements ChainClient {
  async recordScore(_wallet: string, _score: Score): Promise<void> {
    // TODO: implement Solana score recording
  }

  async payoutWinners(_wallets: string[]): Promise<void> {
    // TODO: implement payout logic
  }
}
