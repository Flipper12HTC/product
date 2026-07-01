import type { GameEvent, GameEventType, GameSource, Unsubscribe } from '@flipper/contracts';
import { createWsClient, type WsClient } from '@flipper/ws-client';
import { GameEventEmitter } from './event-emitter';

export type ConnectionState = 'connecting' | 'open' | 'closed';

export interface WsGameSourceOptions {
  url: string;
  initialReconnectDelayMs?: number;
  maxReconnectDelayMs?: number;
  onConnectionChange?: (state: ConnectionState) => void;
}

const KNOWN_EVENT_TYPES: ReadonlySet<GameEventType> = new Set<GameEventType>([
  'ball_position',
  'score_update',
  'ball_drained',
  'bumper_hit',
  'slingshot_hit',
  'game_over',
  'flipper_state',
  'boost_changed',
]);

function isGameEvent(data: unknown): data is GameEvent {
  if (typeof data !== 'object' || data === null) return false;
  const record = data as { type?: unknown; payload?: unknown };
  if (typeof record.type !== 'string') return false;
  if (typeof record.payload !== 'object' || record.payload === null) return false;
  return KNOWN_EVENT_TYPES.has(record.type as GameEventType);
}

export class WsGameSource implements GameSource {
  private readonly emitter = new GameEventEmitter();
  private client: WsClient | null = null;

  constructor(private readonly options: WsGameSourceOptions) {}

  start(): void {
    if (this.client !== null) return;
    this.options.onConnectionChange?.('connecting');
    this.client = createWsClient({
      url: this.options.url,
      initialReconnectDelayMs: this.options.initialReconnectDelayMs,
      maxReconnectDelayMs: this.options.maxReconnectDelayMs,
      onOpen: () => {
        this.options.onConnectionChange?.('open');
      },
      onClose: () => {
        this.options.onConnectionChange?.('closed');
      },
      onMessage: (data: unknown) => {
        if (isGameEvent(data)) {
          this.emitter.emit(data);
        }
      },
    });
  }

  stop(): void {
    this.client?.disconnect();
    this.client = null;
    this.emitter.clear();
  }

  on<T extends GameEventType>(
    type: T,
    handler: (event: Extract<GameEvent, { type: T }>) => void,
  ): Unsubscribe {
    return this.emitter.on(type, handler);
  }
}
