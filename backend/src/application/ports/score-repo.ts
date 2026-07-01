import type { Score } from '../../domain/score.js';

export interface ScoreRepo {
  saveFinal(score: Score): Promise<void>;
  listTop(n: number): Promise<Score[]>;
}
