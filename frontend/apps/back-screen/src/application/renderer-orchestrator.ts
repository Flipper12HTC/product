import type { GameSource } from './ports/game-source';
import {
  INITIAL_SCOREBOARD,
  withBallDrained,
  withBoost,
  withGameOver,
  withScore,
  withStatus,
  type GameStatus,
  type Scoreboard,
} from '../domain/scoreboard';

export interface ScoreboardView {
  render: (state: Scoreboard) => void;
}

export interface Orchestrator {
  start: () => void;
  stop: () => void;
  setStatus: (status: GameStatus) => void;
  getStatus: () => GameStatus;
}

export function createRendererOrchestrator(source: GameSource, view: ScoreboardView): Orchestrator {
  let state: Scoreboard = INITIAL_SCOREBOARD;
  const unsubs: (() => void)[] = [];

  function update(next: Scoreboard): void {
    state = next;
    view.render(state);
  }

  return {
    start(): void {
      view.render(state);
      unsubs.push(
        source.on('score_update', (event) => {
          const { score, ballsLeft, multiplier } = event.payload;
          update(withScore(state, score, ballsLeft, multiplier ?? state.multiplier));
        }),
        source.on('ball_drained', (event) => {
          update(withBallDrained(state, event.payload.ballsLeft));
        }),
        source.on('game_over', (event) => {
          update(withGameOver(state, event.payload.finalScore));
        }),
        source.on('boost_changed', (event) => {
          update(withBoost(state, event.payload.active, event.payload.durationMs));
        }),
      );
      source.start();
    },
    stop(): void {
      for (const u of unsubs) u();
      unsubs.length = 0;
      source.stop();
    },
    setStatus(status: GameStatus): void {
      update(withStatus(state, status));
    },
    getStatus(): GameStatus {
      return state.status;
    },
  };
}
