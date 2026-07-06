import type { GamePublisher } from '../ports/game-publisher.js';
import type { ScoreRepo } from '../ports/score-repo.js';
import type { GameState } from '../../domain/game.js';

// Ends the current game: state transition, game_over broadcast, and score
// persistence. Called by tickGame when the last ball drains, and exposed via
// POST /game/end for manual/testing use.
export function endGame(
  state: GameState,
  publisher: GamePublisher,
  repo?: ScoreRepo,
  now: number = Date.now(),
): void {
  // Idempotence guard: ending an idle/over game does nothing, so a double
  // call (route + drain on the same tick) can never end a game twice.
  if (state.status !== 'running') return;

  state.status = 'over';
  state.endedAt = now;

  // Screens first: game over must be visible even if the database is down.
  publisher.broadcast({
    type: 'game_over',
    payload: { finalScore: state.score },
  });

  // Persist only meaningful scores (a 0 would just pollute the leaderboard).
  if (repo && state.score > 0) {
    // Fire-and-forget: the 60 FPS loop must never wait for the database.
    void repo
      .saveFinal({
        playerId: state.player.wallet ?? 'guest',
        points: state.score,
        achievedAt: new Date(),
      })
      .catch((err) => {
        // Repo errors are non-fatal for the game loop, but must stay visible.
        console.error('[score-repo] saveFinal failed:', err);
      });
  }
}
