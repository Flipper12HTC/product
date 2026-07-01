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

export function createLeaderboardView(): LeaderboardView {
  const root = document.createElement('section');
  root.className =
    'fixed inset-0 z-10 flex flex-col items-center justify-center gap-6 ' +
    'px-[5vw] py-[4vh] text-score-primary font-hud pointer-events-none';

  const title = document.createElement('h1');
  title.className =
    'text-[clamp(2rem,5vw,5rem)] font-display tracking-[0.3em] text-neon-pink uppercase';
  title.textContent = '★ HIGH SCORES ★';
  root.appendChild(title);

  const list = document.createElement('ol');
  list.className =
    'flex flex-col w-full max-w-[80vw] gap-2 ' +
    'text-[clamp(1rem,2.2vw,2rem)]';
  root.appendChild(list);

  return {
    render(entries: ScoreEntry[]): void {
      list.innerHTML = '';
      if (entries.length === 0) {
        const empty = document.createElement('li');
        empty.className = 'text-center text-score-muted italic';
        empty.textContent = 'no scores yet — play to claim the throne';
        list.appendChild(empty);
        return;
      }
      for (const e of entries) {
        const li = document.createElement('li');
        li.className =
          'grid grid-cols-[3rem_1fr_auto] items-baseline gap-[2vw] ' +
          'border-b border-white/10 py-[0.4vh]';

        const rank = document.createElement('span');
        rank.className = 'text-neon-cyan font-display';
        rank.textContent = String(e.rank).padStart(2, '0');

        const player = document.createElement('span');
        player.className = 'text-score-muted truncate';
        player.textContent = e.playerId;

        const points = document.createElement('span');
        points.className = 'text-score-primary font-display text-right';
        points.textContent = e.points.toLocaleString();

        li.append(rank, player, points);
        list.appendChild(li);
      }
    },
    mount(): HTMLElement {
      document.body.appendChild(root);
      return root;
    },
  };
}
