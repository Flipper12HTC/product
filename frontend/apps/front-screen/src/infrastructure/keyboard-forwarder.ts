type Side = 'left' | 'right';

const LEFT_KEYS: ReadonlySet<string> = new Set(['KeyA', 'ArrowLeft']);
const RIGHT_KEYS: ReadonlySet<string> = new Set(['KeyD', 'ArrowRight']);
const START_DEBOUNCE_MS = 500;

function matchSide(code: string): Side | null {
  if (LEFT_KEYS.has(code)) return 'left';
  if (RIGHT_KEYS.has(code)) return 'right';
  return null;
}

export interface KeyboardForwarderOptions {
  backendUrl: string;
  isStartAllowed?: () => boolean;
}

export function attachKeyboardForwarder(options: KeyboardForwarderOptions): () => void {
  const { backendUrl, isStartAllowed } = options;
  const down = { left: false, right: false };
  let lastStartAt = 0;

  function postFlipper(side: Side, action: 'press' | 'release'): void {
    void fetch(`${backendUrl}/game/flipper/${side}/${action}`, { method: 'POST' }).catch(
      () => undefined,
    );
  }

  function postStart(): void {
    if (isStartAllowed && !isStartAllowed()) return;
    const now = Date.now();
    if (now - lastStartAt < START_DEBOUNCE_MS) return;
    lastStartAt = now;
    void fetch(`${backendUrl}/game/start`, { method: 'POST' }).catch(() => undefined);
  }

/** Force a full game restart regardless of current state. */
  function postRestart(): void {
    void fetch(`${backendUrl}/game/restart`, { method: 'POST' }).catch(() => undefined);
  }

  function postPlunger(action: 'press' | 'release'): void {
    void fetch(`${backendUrl}/game/plunger/${action}`, { method: 'POST' }).catch(() => undefined);
  }

  let plungerDown = false;

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.code === 'Space') {
      if (e.repeat) return;
      e.preventDefault();
      postStart();
      return;
    }
    if (e.code === 'KeyR') {
      if (e.repeat) return;
      e.preventDefault();
      postRestart();
      return;
    }
    if (e.code === 'ArrowDown') {
      e.preventDefault();
      if (e.repeat || plungerDown) return;
      plungerDown = true;
      postPlunger('press');
      return;
    }
    const side = matchSide(e.code);
    if (side === null) return;
    if (down[side]) return;
    down[side] = true;
    postFlipper(side, 'press');
  };

  const onKeyUp = (e: KeyboardEvent): void => {
    if (e.code === 'ArrowDown') {
      if (!plungerDown) return;
      plungerDown = false;
      postPlunger('release');
      return;
    }
    const side = matchSide(e.code);
    if (side === null) return;
    if (!down[side]) return;
    down[side] = false;
    postFlipper(side, 'release');
  };

  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);

  return () => {
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('keyup', onKeyUp);
  };
}
