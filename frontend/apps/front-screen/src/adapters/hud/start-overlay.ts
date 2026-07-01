export interface StartOverlayHandle {
  show: () => void;
  hide: () => void;
  isVisible: () => boolean;
  setEnabled: (enabled: boolean, reason?: string) => void;
  mount: () => HTMLElement;
  dispose: () => void;
}

export function createStartOverlay(onStart: () => void): StartOverlayHandle {
  const root = document.createElement('div');
  root.className = 'overlay-root';

  // Bulles décoratives animées en fond
  const bubbles = document.createElement('div');
  bubbles.className = 'overlay-bubbles';
  for (let i = 0; i < 18; i++) {
    const b = document.createElement('div');
    const size  = 8 + Math.random() * 30;
    const left  = Math.random() * 100;
    const delay = Math.random() * 6;
    const dur   = 4 + Math.random() * 5;
    b.className = 'overlay-bubble';
    b.style.cssText = [
      `bottom:-${size}px;left:${left}%;`,
      `width:${size}px;height:${size}px;`,
      `--dur:${dur}s;--delay:${delay}s;`,
    ].join('');
    bubbles.appendChild(b);
  }

  const logo = document.createElement('div');
  logo.className = 'overlay-logo';
  logo.textContent = '🧽';

  const title = document.createElement('h1');
  title.className = 'overlay-title';
  title.textContent = 'BIKINI BOTTOM';

  const subtitle = document.createElement('h2');
  subtitle.className = 'overlay-subtitle';
  subtitle.textContent = 'P  I  N  B  A  L  L';

  const button = document.createElement('button');
  button.className = 'overlay-button';
  button.textContent = '▶  PRESS START';
  button.addEventListener('click', () => {
    if (!button.disabled) onStart();
  });

  const hint = document.createElement('p');
  hint.className = 'overlay-hint';
  hint.textContent = 'ou appuie sur ESPACE';

  const reasonEl = document.createElement('p');
  reasonEl.className = 'overlay-reason';

  root.appendChild(bubbles);
  root.append(logo, title, subtitle, button, hint, reasonEl);

  const handler = (e: KeyboardEvent): void => {
    if (e.code === 'Space' && !button.disabled && root.style.display !== 'none') {
      e.preventDefault();
      onStart();
    }
  };
  document.addEventListener('keydown', handler);

  return {
    show(): void  { root.style.display = 'flex'; },
    hide(): void  { root.style.display = 'none'; },
    isVisible(): boolean { return root.style.display !== 'none'; },
    setEnabled(enabled: boolean, reason?: string): void {
      button.disabled = !enabled;
      if (enabled) {
        reasonEl.style.display = 'none';
        reasonEl.textContent   = '';
      } else if (reason) {
        reasonEl.textContent   = reason;
        reasonEl.style.display = 'block';
      }
    },
    mount(): HTMLElement {
      document.body.appendChild(root);
      return root;
    },
    dispose(): void {
      document.removeEventListener('keydown', handler);
      root.remove();
    },
  };
}
