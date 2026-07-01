import type { Vec3 } from '../../domain/ball.js';
import type { FlipperSide } from '../../domain/flipper.js';

export interface BallPositionEvent {
  type: 'ball_position';
  payload: Vec3;
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
  payload: { side: FlipperSide; active: boolean };
}

export interface BallLaunchedEvent {
  type: 'ball_launched';
  payload: { force: number };
}

export type GameEvent =
  | BallPositionEvent
  | ScoreUpdateEvent
  | BallDrainedEvent
  | BumperHitEvent
  | SlingshotHitEvent
  | GameOverEvent
  | FlipperStateEvent
  | BallLaunchedEvent;

export interface GamePublisher {
  broadcast(event: GameEvent): void;
}
