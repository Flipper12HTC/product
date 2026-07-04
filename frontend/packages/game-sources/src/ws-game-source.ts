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

// Keyed by every GameEventType so tsc errors here whenever contracts adds an
// event type that this map does not know about.
const KNOWN_EVENT_TYPES_RECORD: Record<GameEventType, true> = {
  ball_position: true,
  score_update: true,
  ball_drained: true,
  bumper_hit: true,
  slingshot_hit: true,
  game_over: true,
  flipper_state: true,
  ball_launched: true,
  boost_changed: true,
};

const KNOWN_EVENT_TYPES: ReadonlySet<string> = new Set(Object.keys(KNOWN_EVENT_TYPES_RECORD));

function isGameEvent(data: unknown): data is GameEvent {
  if (typeof data !== 'object' || data === null) return false;
  const record = data as { type?: unknown; payload?: unknown };
  if (typeof record.type !== 'string') return false;
  if (typeof record.payload !== 'object' || record.payload === null) return false;
  return KNOWN_EVENT_TYPES.has(record.type);
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
