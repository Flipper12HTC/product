export type GameStatus = 'idle' | 'running' | 'over';

export interface Scoreboard {
  readonly status: GameStatus;
  readonly score: number;
  readonly ballsLeft: number;
  readonly multiplier: number;
  readonly finalScore: number | null;
  readonly boostActive: boolean;
  readonly boostDurationMs: number;
}

export const INITIAL_SCOREBOARD: Scoreboard = {
  status: 'idle',
  score: 0,
  ballsLeft: 3,
  multiplier: 1,
  finalScore: null,
  boostActive: false,
  boostDurationMs: 0,
};

export function withStatus(state: Scoreboard, status: GameStatus): Scoreboard {
  return { ...state, status };
}

export function withScore(
  state: Scoreboard,
  score: number,
  ballsLeft: number,
  multiplier: number = state.multiplier,
): Scoreboard {
  return {
    ...state,
    status: 'running',
    score,
    ballsLeft,
    multiplier,
    finalScore: null,
  };
}

export function withBallDrained(state: Scoreboard, ballsLeft: number): Scoreboard {
  return { ...state, ballsLeft };
}

export function withGameOver(state: Scoreboard, finalScore: number): Scoreboard {
  return { ...state, status: 'over', finalScore, boostActive: false };
}

export function withBoost(
  state: Scoreboard,
  active: boolean,
  durationMs: number,
): Scoreboard {
  return { ...state, boostActive: active, boostDurationMs: durationMs };
}
