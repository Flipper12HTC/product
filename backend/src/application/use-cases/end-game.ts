import type { GamePublisher } from '../ports/game-publisher.js';
import type { ScoreRepo } from '../ports/score-repo.js';
import type { GameState } from '../../domain/game.js';

export function endGame(state: GameState, publisher: GamePublisher, repo?: ScoreRepo): void {
  if (state.status !== 'running') return;

  state.status = 'over';
  state.endedAt = Date.now();

  publisher.broadcast({
    type: 'game_over',
    payload: { finalScore: state.score },
  });

  if (repo && state.score > 0) {
    void repo
      .saveFinal({
        playerId: state.player.wallet ?? 'guest',
        points: state.score,
        achievedAt: new Date(),
      })
      .catch(() => {
        /* repo errors are non-fatal for the game loop */
      });
  }
}
