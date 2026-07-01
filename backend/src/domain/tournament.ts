import type { Score } from './score.js';

export interface Tournament {
  id: string;
  scores: Score[];
  startedAt: Date;
  endedAt: Date | null;
}
