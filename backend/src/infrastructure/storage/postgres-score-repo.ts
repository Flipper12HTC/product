import postgres from 'postgres';
import type { ScoreRepo } from '../../application/ports/score-repo.js';
import type { Score } from '../../domain/score.js';

interface ScoreRow {
  player: string | null;
  points: number;
  achieved_at: Date;
}

export class PostgresScoreRepo implements ScoreRepo {
  private sql: postgres.Sql;

  constructor(connectionString?: string) {
    const url =
      connectionString ??
      process.env['DATABASE_URL'] ??
      'postgresql://flipper:flipper@localhost:5432/flipper12';
    this.sql = postgres(url, { max: 5 });
  }

  async init(): Promise<void> {
    await this.sql`
      CREATE TABLE IF NOT EXISTS scores (
        id SERIAL PRIMARY KEY,
        player TEXT,
        points INTEGER NOT NULL,
        achieved_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await this.sql`CREATE INDEX IF NOT EXISTS scores_points_desc ON scores (points DESC)`;
  }

  async saveFinal(score: Score): Promise<void> {
    await this.sql`
      INSERT INTO scores (player, points, achieved_at)
      VALUES (${score.playerId}, ${score.points}, ${score.achievedAt})
    `;
  }

  async listTop(n: number): Promise<Score[]> {
    const limit = Math.max(1, Math.min(100, Math.floor(n)));
    const rows = await this.sql<ScoreRow[]>`
      SELECT player, points, achieved_at
      FROM scores
      ORDER BY points DESC, achieved_at ASC
      LIMIT ${limit}
    `;
    return rows.map((r) => ({
      playerId: r.player ?? 'guest',
      points: r.points,
      achievedAt: r.achieved_at,
    }));
  }

  async close(): Promise<void> {
    await this.sql.end();
  }
}
