import type { GameEvent, GameEventType, Unsubscribe } from '@flipper/contracts';

type AnyHandler = (event: GameEvent) => void;

export class GameEventEmitter {
  private readonly handlers = new Map<GameEventType, Set<AnyHandler>>();

  on<T extends GameEventType>(
    type: T,
    handler: (event: Extract<GameEvent, { type: T }>) => void,
  ): Unsubscribe {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    const wrapped = handler as unknown as AnyHandler;
    set.add(wrapped);
    return () => {
      set.delete(wrapped);
    };
  }

  emit(event: GameEvent): void {
    const set = this.handlers.get(event.type);
    if (!set) return;
    for (const handler of set) {
      handler(event);
    }
  }

  clear(): void {
    this.handlers.clear();
  }
}
