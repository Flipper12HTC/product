import type { GameEvent, GameEventType, GameSource, Unsubscribe } from '@flipper/contracts';
import { GameEventEmitter } from './event-emitter';

export interface MockGameSourceOptions {
  tickMs?: number;
  scoreEveryTicks?: number;
  gameOverTick?: number;
}

export class MockGameSource implements GameSource {
  private readonly emitter = new GameEventEmitter();
  private readonly tickMs: number;
  private readonly scoreEveryTicks: number;
  private readonly gameOverTick: number;

  private intervalId: ReturnType<typeof setInterval> | null = null;
  private tick = 0;
  private score = 0;
  private ballsLeft = 3;

  constructor(options: MockGameSourceOptions = {}) {
    this.tickMs = options.tickMs ?? 1000 / 60;
    this.scoreEveryTicks = options.scoreEveryTicks ?? 120;
    this.gameOverTick = options.gameOverTick ?? 600;
  }

  start(): void {
    if (this.intervalId !== null) return;
    this.intervalId = setInterval(() => {
      this.step();
    }, this.tickMs);
  }

  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.emitter.clear();
    this.tick = 0;
    this.score = 0;
    this.ballsLeft = 3;
  }

  on<T extends GameEventType>(
    type: T,
    handler: (event: Extract<GameEvent, { type: T }>) => void,
  ): Unsubscribe {
    return this.emitter.on(type, handler);
  }

  private step(): void {
    this.tick++;

    const x = Math.sin(this.tick * 0.05) * 3;
    const z = Math.cos(this.tick * 0.03) * 5;
    this.emitter.emit({
      type: 'ball_position',
      payload: { x, y: 0.4, z },
    });

    if (this.tick % this.scoreEveryTicks === 0) {
      this.score += 100;
      this.emitter.emit({
        type: 'score_update',
        payload: { score: this.score, ballsLeft: this.ballsLeft },
      });
    }

    if (this.tick === this.gameOverTick) {
      this.emitter.emit({ type: 'game_over', payload: { finalScore: this.score } });
      this.tick = 0;
      this.score = 0;
      this.ballsLeft = 3;
    }
  }
}
