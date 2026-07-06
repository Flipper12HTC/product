// A dot-matrix display (DMD) — the deco-screen dressed up as a classic pinball score
// display. Text is drawn with a 5x7 pixel font, one lit dot per pixel, so it reads crisp
// like a real DMD. Bikini Bottom theme: cyan/yellow dots on very dark blue.

export interface DmdScore {
  rank: number;
  playerId: string;
  points: number;
}

export interface DmdDisplay {
  setScores: (scores: DmdScore[]) => void;
  flash: (text: string, ms?: number) => void;
  start: () => void;
  stop: () => void;
}

const THEME = {
  bg: '#02121f',
  dim: 'rgba(40, 110, 140, 0.20)',
  cyan: '#7fe9ff',
  yellow: '#ffe23a',
};

const ROWS = 60; // vertical dot count; columns follow the screen width
const GLYPH_W = 5;
const GLYPH_H = 7;
const CHAR_STEP = GLYPH_W + 1; // one blank column between characters

// 5x7 pixel font (7 rows of 5 chars). Only the glyphs we need.
const FONT: Record<string, string[]> = {
  ' ': ['     ', '     ', '     ', '     ', '     ', '     ', '     '],
  '!': ['  #  ', '  #  ', '  #  ', '  #  ', '  #  ', '     ', '  #  '],
  '-': ['     ', '     ', '     ', ' ### ', '     ', '     ', '     '],
  '.': ['     ', '     ', '     ', '     ', '     ', ' ##  ', ' ##  '],
  ',': ['     ', '     ', '     ', '     ', '  ## ', '  #  ', ' #   '],
  '0': [' ### ', '#   #', '#  ##', '# # #', '##  #', '#   #', ' ### '],
  '1': ['  #  ', ' ##  ', '  #  ', '  #  ', '  #  ', '  #  ', ' ### '],
  '2': [' ### ', '#   #', '    #', '   # ', '  #  ', ' #   ', '#####'],
  '3': ['#####', '   # ', '  #  ', '   # ', '    #', '#   #', ' ### '],
  '4': ['   # ', '  ## ', ' # # ', '#  # ', '#####', '   # ', '   # '],
  '5': ['#####', '#    ', '#### ', '    #', '    #', '#   #', ' ### '],
  '6': [' ### ', '#   #', '#    ', '#### ', '#   #', '#   #', ' ### '],
  '7': ['#####', '    #', '   # ', '  #  ', ' #   ', ' #   ', ' #   '],
  '8': [' ### ', '#   #', '#   #', ' ### ', '#   #', '#   #', ' ### '],
  '9': [' ### ', '#   #', '#   #', ' ####', '    #', '#   #', ' ### '],
  A: [' ### ', '#   #', '#   #', '#####', '#   #', '#   #', '#   #'],
  B: ['#### ', '#   #', '#   #', '#### ', '#   #', '#   #', '#### '],
  C: [' ### ', '#   #', '#    ', '#    ', '#    ', '#   #', ' ### '],
  D: ['#### ', '#   #', '#   #', '#   #', '#   #', '#   #', '#### '],
  E: ['#####', '#    ', '#    ', '#### ', '#    ', '#    ', '#####'],
  F: ['#####', '#    ', '#    ', '#### ', '#    ', '#    ', '#    '],
  G: [' ### ', '#   #', '#    ', '# ###', '#   #', '#   #', ' ### '],
  H: ['#   #', '#   #', '#   #', '#####', '#   #', '#   #', '#   #'],
  I: [' ### ', '  #  ', '  #  ', '  #  ', '  #  ', '  #  ', ' ### '],
  J: ['  ###', '   # ', '   # ', '   # ', '#  # ', '#  # ', ' ##  '],
  K: ['#   #', '#  # ', '# #  ', '##   ', '# #  ', '#  # ', '#   #'],
  L: ['#    ', '#    ', '#    ', '#    ', '#    ', '#    ', '#####'],
  M: ['#   #', '## ##', '# # #', '#   #', '#   #', '#   #', '#   #'],
  N: ['#   #', '##  #', '# # #', '#  ##', '#   #', '#   #', '#   #'],
  O: [' ### ', '#   #', '#   #', '#   #', '#   #', '#   #', ' ### '],
  P: ['#### ', '#   #', '#   #', '#### ', '#    ', '#    ', '#    '],
  Q: [' ### ', '#   #', '#   #', '#   #', '# # #', '#  # ', ' ## #'],
  R: ['#### ', '#   #', '#   #', '#### ', '# #  ', '#  # ', '#   #'],
  S: [' ####', '#    ', '#    ', ' ### ', '    #', '    #', '#### '],
  T: ['#####', '  #  ', '  #  ', '  #  ', '  #  ', '  #  ', '  #  '],
  U: ['#   #', '#   #', '#   #', '#   #', '#   #', '#   #', ' ### '],
  V: ['#   #', '#   #', '#   #', '#   #', '#   #', ' # # ', '  #  '],
  W: ['#   #', '#   #', '#   #', '# # #', '# # #', '## ##', '#   #'],
  X: ['#   #', '#   #', ' # # ', '  #  ', ' # # ', '#   #', '#   #'],
  Y: ['#   #', '#   #', ' # # ', '  #  ', '  #  ', '  #  ', '  #  '],
  Z: ['#####', '    #', '   # ', '  #  ', ' #   ', '#    ', '#####'],
};

// Little easter-egg face that winks now and then — a wink at the player.
const FACE_OPEN = [
  ' ######## ',
  '#        #',
  '# ##  ## #',
  '# ##  ## #',
  '#        #',
  '#  ####  #',
  ' ######## ',
];
const FACE_WINK = [
  ' ######## ',
  '#        #',
  '# ##     #',
  '# ##  ## #',
  '#        #',
  '#  ####  #',
  ' ######## ',
];

function textWidth(text: string, scale: number): number {
  return text.length * CHAR_STEP * scale - scale;
}

export function createDmdDisplay(canvas: HTMLCanvasElement): DmdDisplay {
  const ctx = canvas.getContext('2d')!;
  const grid = document.createElement('canvas'); // static dim-dot backdrop

  let cols = 0;
  let pitch = 0;
  let scores: DmdScore[] = [];
  let flashText = '';
  let flashUntil = 0;
  let raf: number | null = null;

  function resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    pitch = canvas.height / ROWS;
    cols = Math.max(1, Math.floor(canvas.width / pitch));
    buildGrid();
  }

  function buildGrid(): void {
    grid.width = canvas.width;
    grid.height = canvas.height;
    const g = grid.getContext('2d')!;
    g.fillStyle = THEME.bg;
    g.fillRect(0, 0, grid.width, grid.height);
    g.fillStyle = THEME.dim;
    const r = pitch * 0.32;
    for (let ry = 0; ry < ROWS; ry++) {
      for (let cx = 0; cx < cols; cx++) {
        g.beginPath();
        g.arc((cx + 0.5) * pitch, (ry + 0.5) * pitch, r, 0, Math.PI * 2);
        g.fill();
      }
    }
  }

  function dot(cx: number, ry: number, color: string): void {
    if (cx < 0 || cx >= cols || ry < 0 || ry >= ROWS) return;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc((cx + 0.5) * pitch, (ry + 0.5) * pitch, pitch * 0.42, 0, Math.PI * 2);
    ctx.fill();
  }

  // Draw a string in lit dots. `col`/`row` are the top-left cell; scale enlarges each pixel.
  function putText(text: string, col: number, row: number, color: string, scale = 1): void {
    ctx.shadowColor = color;
    ctx.shadowBlur = pitch * 0.5;
    let x = col;
    for (const ch of text.toUpperCase()) {
      const glyph = FONT[ch] ?? FONT[' ']!;
      for (let gy = 0; gy < GLYPH_H; gy++) {
        for (let gx = 0; gx < GLYPH_W; gx++) {
          if (glyph[gy]![gx] !== '#') continue;
          for (let sy = 0; sy < scale; sy++) {
            for (let sx = 0; sx < scale; sx++) {
              dot(x + gx * scale + sx, row + gy * scale + sy, color);
            }
          }
        }
      }
      x += CHAR_STEP * scale;
    }
    ctx.shadowBlur = 0;
  }

  function putCentered(text: string, row: number, color: string, scale = 1): void {
    putText(text, Math.round((cols - textWidth(text, scale)) / 2), row, color, scale);
  }

  function putRight(text: string, rightCol: number, row: number, color: string): void {
    putText(text, rightCol - textWidth(text, 1), row, color, 1);
  }

  // The winking face, tucked at the bottom-centre.
  function drawWinkFace(now: number): void {
    const sprite = now % 3500 < 260 ? FACE_WINK : FACE_OPEN;
    const col = Math.round((cols - sprite[0]!.length) / 2);
    const row = ROWS - sprite.length - 1;
    ctx.shadowColor = THEME.yellow;
    ctx.shadowBlur = pitch * 0.5;
    for (let y = 0; y < sprite.length; y++) {
      for (let x = 0; x < sprite[y]!.length; x++) {
        if (sprite[y]![x] === '#') dot(col + x, row + y, THEME.yellow);
      }
    }
    ctx.shadowBlur = 0;
  }

  function frame(): void {
    const now = performance.now();
    ctx.drawImage(grid, 0, 0);

    if (flashText && now < flashUntil) {
      if (Math.floor(now / 220) % 2 === 0) {
        const scale = Math.max(1, Math.floor((cols * 0.9) / (flashText.length * CHAR_STEP)));
        putCentered(flashText, Math.round((ROWS - GLYPH_H * scale) / 2), THEME.yellow, scale);
      }
      raf = requestAnimationFrame(frame);
      return;
    }

    // Title + the winking clin d'œil
    putCentered('HIGH SCORES', 3, THEME.yellow, 1);
    drawWinkFace(now);

    if (scores.length === 0) {
      putCentered('NO SCORES YET', Math.round(ROWS / 2) - 3, THEME.cyan, 1);
      raf = requestAnimationFrame(frame);
      return;
    }

    // Up to 5 leaderboard rows
    const rowStep = 9;
    const top = 15;
    const nameCol = 12;
    const rightCol = cols - 5;
    for (let i = 0; i < Math.min(5, scores.length); i++) {
      const y = top + i * rowStep;
      const s = scores[i]!;
      putText(String(s.rank), 5, y, THEME.yellow);
      putText(s.playerId.slice(0, 9), nameCol, y, THEME.cyan);
      putRight(s.points.toLocaleString('en-US'), rightCol, y, THEME.cyan);
    }

    raf = requestAnimationFrame(frame);
  }

  const onResize = (): void => resize();

  return {
    setScores(next: DmdScore[]): void {
      scores = next;
    },
    flash(text: string, ms = 2200): void {
      flashText = text;
      flashUntil = performance.now() + ms;
    },
    start(): void {
      resize();
      window.addEventListener('resize', onResize);
      if (raf === null) raf = requestAnimationFrame(frame);
    },
    stop(): void {
      window.removeEventListener('resize', onResize);
      if (raf !== null) cancelAnimationFrame(raf);
      raf = null;
    },
  };
}
