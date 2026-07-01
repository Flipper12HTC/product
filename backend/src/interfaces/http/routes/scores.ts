import type { FastifyInstance } from 'fastify';
import type { ScoreRepo } from '../../../application/ports/score-repo.js';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

export async function registerScoreRoutes(app: FastifyInstance, repo: ScoreRepo): Promise<void> {
  app.get('/scores/top', async (req) => {
    const raw = (req.query as { limit?: string }).limit;
    const parsed = raw === undefined ? DEFAULT_LIMIT : Number.parseInt(raw, 10);
    const limit = Number.isFinite(parsed)
      ? Math.max(1, Math.min(MAX_LIMIT, parsed))
      : DEFAULT_LIMIT;
    const scores = await repo.listTop(limit);
    return {
      scores: scores.map((s) => ({
        playerId: s.playerId,
        points: s.points,
        achievedAt: s.achievedAt.toISOString(),
      })),
    };
  });
}
