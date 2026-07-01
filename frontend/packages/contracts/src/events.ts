export interface BallPositionEvent {
  type: 'ball_position';
  payload: { x: number; y: number; z: number };
}

export interface ScoreUpdateEvent {
  type: 'score_update';
  payload: { score: number; ballsLeft: number; multiplier?: number };
}

export interface BallDrainedEvent {
  type: 'ball_drained';
  payload: { ballsLeft: number };
}

export interface BumperHitEvent {
  type: 'bumper_hit';
  payload: { id: string; x: number; z: number };
}

export interface SlingshotHitEvent {
  type: 'slingshot_hit';
  payload: { id: string; x: number; z: number };
}

export interface GameOverEvent {
  type: 'game_over';
  payload: { finalScore: number };
}

export interface FlipperStateEvent {
  type: 'flipper_state';
  payload: { side: 'left' | 'right'; active: boolean };
}

export interface BallLaunchedEvent {
  type: 'ball_launched';
  payload: { force: number };
}

export interface BoostChangedEvent {
  type: 'boost_changed';
  payload: { active: boolean; multiplier: number; durationMs: number };
}

export type GameEvent =
  | BallPositionEvent
  | ScoreUpdateEvent
  | BallDrainedEvent
  | BumperHitEvent
  | SlingshotHitEvent
  | GameOverEvent
  | FlipperStateEvent
  | BallLaunchedEvent
  | BoostChangedEvent;

export type GameEventType = GameEvent['type'];
