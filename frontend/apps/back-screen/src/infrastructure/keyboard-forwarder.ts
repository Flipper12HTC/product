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

  // TEMP test mode: R = hard restart even mid-running
  function postRestart(): void {
    void fetch(`${backendUrl}/game/restart`, { method: 'POST' }).catch(() => undefined);
  }

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
    const side = matchSide(e.code);
    if (side === null) return;
    if (down[side]) return;
    down[side] = true;
    postFlipper(side, 'press');
  };

  const onKeyUp = (e: KeyboardEvent): void => {
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
