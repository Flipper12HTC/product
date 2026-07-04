export interface ScoreEntry {
  rank: number;
  playerId: string;
  points: number;
  achievedAt: string;
}

export interface LeaderboardView {
  render: (entries: ScoreEntry[]) => void;
  mount: () => HTMLElement;
}

// Top 5 only — matches the Krusty Krab sign styling in style.css (.sb-lb-*),
// so the deco-screen board reads with the same font/look as the back-screen.
const MAX_ROWS = 5;

function formatPoints(n: number): string {
  return n.toLocaleString('en-US');
}

export function createLeaderboardView(): LeaderboardView {
  const root = document.createElement('section');
  root.className = 'sb-leaderboard';

  const title = document.createElement('h1');
  title.className = 'sb-lb-title';
  title.textContent = 'HIGH SCORES';
  root.appendChild(title);

  const panel = document.createElement('div');
  panel.className = 'sb-lb-panel';
  root.appendChild(panel);

  const list = document.createElement('ol');
  list.className = 'sb-lb-list';
  panel.appendChild(list);

  // Track the top score so a fresh #1 gets the celebratory pop highlight.
  let prevTopKey = '';

  return {
    render(entries: ScoreEntry[]): void {
      const top = entries.slice(0, MAX_ROWS);
      const nextTopKey = top[0] ? `${top[0].playerId}:${top[0].points}` : '';
      const topChanged = nextTopKey !== '' && nextTopKey !== prevTopKey;
      prevTopKey = nextTopKey;

      list.innerHTML = '';

      if (top.length === 0) {
        const empty = document.createElement('li');
        empty.className = 'sb-lb-empty';
        empty.textContent = 'no scores yet — grab a Krabby Patty and play!';
        list.appendChild(empty);
        return;
      }

      top.forEach((e, i) => {
        const li = document.createElement('li');
        li.className = 'sb-lb-row';
        if (i < 3) li.classList.add(`sb-lb-row--${i + 1}`);
        if (topChanged && i === 0) li.classList.add('is-new');

        const rank = document.createElement('span');
        rank.className = 'sb-lb-rank';
        rank.textContent = String(e.rank);

        const player = document.createElement('span');
        player.className = 'sb-lb-player';
        player.textContent = e.playerId;

        const points = document.createElement('span');
        points.className = 'sb-lb-points';
        points.textContent = formatPoints(e.points);

        li.append(rank, player, points);
        list.appendChild(li);
      });
    },
    mount(): HTMLElement {
      document.body.appendChild(root);
      return root;
    },
  };
}
