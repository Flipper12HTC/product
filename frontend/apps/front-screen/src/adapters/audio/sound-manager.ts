import type { GameSource } from '../../application/ports/game-source';

export interface SoundManager {
  attach(source: GameSource): () => void;
  setMuted(muted: boolean): void;
}

export function createSoundManager(): SoundManager {
  let ctx: AudioContext | null = null;
  let muted = false;
  let bgMusic: HTMLAudioElement | null = null;
  let bumperBuffer: AudioBuffer | null = null;

  async function loadBumperSound(): Promise<void> {
    try {
      const ac = getCtx();
      const response = await fetch('/audio/bumper.mp3');
      const arrayBuffer = await response.arrayBuffer();
      bumperBuffer = await ac.decodeAudioData(arrayBuffer);
    } catch {
      // fichier absent — le son synthétisé prend le relais
    }
  }

  function getCtx(): AudioContext {
    if (!ctx) {
      ctx = new AudioContext();
    } else if (ctx.state === 'suspended') {
      void ctx.resume();
    }
    return ctx;
  }

  function tone(
    freq: number,
    duration: number,
    type: OscillatorType = 'sine',
    gainValue = 0.3,
    startDelay = 0,
  ): void {
    if (muted) return;
    const ac = getCtx();
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.connect(g);
    g.connect(ac.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ac.currentTime + startDelay);
    g.gain.setValueAtTime(gainValue, ac.currentTime + startDelay);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + startDelay + duration);
    osc.start(ac.currentTime + startDelay);
    osc.stop(ac.currentTime + startDelay + duration);
  }

  function sweep(
    freqFrom: number,
    freqTo: number,
    duration: number,
    type: OscillatorType = 'sine',
    gainValue = 0.3,
    startDelay = 0,
  ): void {
    if (muted) return;
    const ac = getCtx();
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.connect(g);
    g.connect(ac.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freqFrom, ac.currentTime + startDelay);
    osc.frequency.linearRampToValueAtTime(freqTo, ac.currentTime + startDelay + duration);
    g.gain.setValueAtTime(gainValue, ac.currentTime + startDelay);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + startDelay + duration);
    osc.start(ac.currentTime + startDelay);
    osc.stop(ac.currentTime + startDelay + duration);
  }

  function noise(duration: number, gainValue = 0.1): void {
    if (muted) return;
    const ac = getCtx();
    const bufferSize = Math.ceil(ac.sampleRate * duration);
    const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const src = ac.createBufferSource();
    src.buffer = buffer;
    const g = ac.createGain();
    g.gain.setValueAtTime(gainValue, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);
    src.connect(g);
    g.connect(ac.destination);
    src.start();
  }

  // --- sound effects ---

  function playFlipper(active: boolean): void {
    if (active) {
      noise(0.05, 0.12);
      tone(200, 0.07, 'square', 0.18);
    } else {
      noise(0.03, 0.07);
    }
  }

  function playBumper(): void {
    if (muted) return;
    if (bumperBuffer) {
      const ac = getCtx();
      const src = ac.createBufferSource();
      src.buffer = bumperBuffer;
      src.connect(ac.destination);
      src.start();
      return;
    }
    tone(900, 0.06, 'sine', 0.35);
    tone(600, 0.12, 'sine', 0.2);
  }

  function playSlingshot(): void {
    tone(550, 0.1, 'triangle', 0.3);
    tone(400, 0.08, 'sine', 0.15);
  }

  function playBallLaunched(): void {
    sweep(180, 650, 0.35, 'sine', 0.3);
  }

  function playBallDrained(): void {
    sweep(380, 90, 0.7, 'sine', 0.28);
    noise(0.3, 0.06);
  }

  function playScore(): void {
    tone(1050, 0.08, 'sine', 0.12);
  }

  function playBoost(active: boolean): void {
    if (active) {
      sweep(300, 800, 0.4, 'sawtooth', 0.18);
    } else {
      sweep(500, 200, 0.25, 'sine', 0.12);
    }
  }

  function playGameOver(): void {
    const notes = [380, 330, 280, 190];
    notes.forEach((freq, i) => {
      sweep(freq + 40, freq, 0.28, 'sine', 0.28, i * 0.22);
    });
  }

  // --- background music ---

  function startBgMusic(): void {
    bgMusic = new Audio('/audio/bg-music.mp3');
    bgMusic.loop = true;
    bgMusic.volume = 0.35;
    bgMusic.play().catch(() => {
      // Autoplay blocked until first user gesture — will be retried on interaction
    });
  }

  function resumeBgMusicOnGesture(): void {
    const resume = (): void => {
      if (bgMusic && bgMusic.paused) void bgMusic.play().catch(() => {});
      if (ctx?.state === 'suspended') void ctx.resume();
      window.removeEventListener('keydown', resume);
      window.removeEventListener('click', resume);
    };
    window.addEventListener('keydown', resume);
    window.addEventListener('click', resume);
  }

  return {
    attach(source: GameSource): () => void {
      startBgMusic();
      resumeBgMusicOnGesture();
      void loadBumperSound();

      const unsubs = [
        source.on('flipper_state', (e) => playFlipper(e.payload.active)),
        source.on('bumper_hit', () => playBumper()),
        source.on('slingshot_hit', () => playSlingshot()),
        source.on('ball_launched', () => playBallLaunched()),
        source.on('ball_drained', () => playBallDrained()),
        source.on('score_update', () => playScore()),
        source.on('boost_changed', (e) => playBoost(e.payload.active)),
        source.on('game_over', () => playGameOver()),
      ];

      return () => {
        for (const u of unsubs) u();
        bgMusic?.pause();
        bgMusic = null;
      };
    },

    setMuted(m: boolean): void {
      muted = m;
      if (bgMusic) bgMusic.muted = m;
    },
  };
}
