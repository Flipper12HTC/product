import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export type CharacterMood = 'idle' | 'happy' | 'excited' | 'sad';

// Keyword sets used to map the GLB's embedded animation clips onto game moods.
// The exact clip names in Spongebob.glb are unknown, so we fuzzy-match on the
// clip name and fall back gracefully (first clip / no clip) when nothing fits.
const CLIP_KEYWORDS: Record<'idle' | 'cheer' | 'boost' | 'bounce' | 'sad', string[]> = {
  idle: ['idle', 'breath', 'stand', 'wait', 'loop', 'rest'],
  cheer: ['cheer', 'celebrat', 'happy', 'win', 'wave', 'dance', 'jump', 'excited'],
  boost: ['run', 'fast', 'spin', 'dance', 'excited', 'flip'],
  bounce: ['jump', 'hop', 'hit', 'bounce', 'react'],
  sad: ['sad', 'cry', 'die', 'lose', 'fail', 'defeat', 'faint'],
};

export interface Character {
  /** Quick squash-and-bounce — bumper / slingshot hit. */
  bounce: () => void;
  /** Big celebratory hop with a spin — score went up. */
  cheer: () => void;
  /** Continuous excited spin while a boost is active. */
  setBoost: (active: boolean) => void;
  /** Small flinch — a ball drained. */
  flinch: () => void;
  /** Sink and tumble sadly — game over. */
  despair: () => void;
  /** Return to the happy idle float — new game / reset. */
  reset: () => void;
  tick: (deltaMs: number) => void;
  dispose: () => void;
}

const REST_X = 9.3; // shift SpongeBob to the right so he clears the leaderboard
const REST_Y = -1.6; // vertical centre of the model in world space
const TARGET_HEIGHT = 7; // normalised model height in world units

/**
 * Loads the SpongeBob GLB and gives it springy, game-reactive motion. All
 * loading is fault-tolerant: if the model fails to load, the returned API is a
 * harmless no-op so the rest of the deco-screen keeps running.
 */
export function createCharacter(scene: THREE.Scene): Character {
  // `root` is what we animate (bounce/spin/scale). `pivot` re-centres the raw
  // GLB so rotations spin around the model's middle, not its origin.
  const root = new THREE.Group();
  root.position.set(REST_X, REST_Y, 0);
  scene.add(root);

  // ---- spring / impulse state -------------------------------------------
  let posY = 0; // offset above REST_Y
  let velY = 0;
  let scale = 1; // uniform squash/stretch spring
  let scaleVel = 0;
  let spin = 0; // current Y rotation
  let spinVel = 0; // angular velocity (rad/s)
  let tilt = 0; // Z lean for flinch/despair
  let tiltTarget = 0;
  let boost = false;
  let mood: CharacterMood = 'idle';
  let swayPhase = Math.random() * Math.PI * 2;

  // ---- skeletal animation (clips embedded in the GLB) --------------------
  let mixer: THREE.AnimationMixer | null = null;
  const clips = new Map<string, THREE.AnimationClip>(); // resolved by mood key
  let idleAction: THREE.AnimationAction | null = null;
  let currentAction: THREE.AnimationAction | null = null;
  let returnToIdleTimer: number | null = null;

  /** Pick the best-matching clip for a mood by fuzzy name, with fallbacks. */
  function resolveClip(
    all: THREE.AnimationClip[],
    keywords: string[],
  ): THREE.AnimationClip | null {
    for (const kw of keywords) {
      const hit = all.find((c) => c.name.toLowerCase().includes(kw));
      if (hit) return hit;
    }
    return null;
  }

  /** Crossfade to a clip. `loop` clips stay; one-shots return to idle after. */
  function playClip(key: string, loop: boolean): void {
    if (!mixer) return;
    const clip = clips.get(key);
    if (!clip) return;

    if (returnToIdleTimer !== null) {
      window.clearTimeout(returnToIdleTimer);
      returnToIdleTimer = null;
    }

    const next = mixer.clipAction(clip);
    next.reset();
    next.enabled = true;
    next.setEffectiveWeight(1);
    if (loop) {
      next.setLoop(THREE.LoopRepeat, Infinity);
    } else {
      next.setLoop(THREE.LoopOnce, 1);
      next.clampWhenFinished = true;
    }
    next.play();

    if (currentAction && currentAction !== next) {
      currentAction.crossFadeTo(next, 0.25, false);
    }
    currentAction = next;

    if (!loop) {
      // Return to idle a touch before the clip fully ends for a smooth blend.
      const ms = Math.max(200, clip.duration * 1000 - 200);
      returnToIdleTimer = window.setTimeout(() => {
        returnToIdleTimer = null;
        playIdle();
      }, ms);
    }
  }

  function playIdle(): void {
    if (idleAction && mixer) {
      idleAction.reset();
      idleAction.enabled = true;
      idleAction.setEffectiveWeight(1);
      idleAction.setLoop(THREE.LoopRepeat, Infinity);
      idleAction.play();
      if (currentAction && currentAction !== idleAction) {
        currentAction.crossFadeTo(idleAction, 0.35, false);
      }
      currentAction = idleAction;
    }
  }

  const loader = new GLTFLoader();
  loader.load(
    '/models/Spongebob.glb',
    (gltf) => {
      const model = gltf.scene;

      // Normalise: scale to a fixed height, then re-centre into a pivot group.
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const height = size.y || 1;
      const s = TARGET_HEIGHT / height;
      model.scale.setScalar(s);

      model.updateWorldMatrix(false, true);
      const scaledBox = new THREE.Box3().setFromObject(model);
      const centre = scaledBox.getCenter(new THREE.Vector3());
      model.position.sub(centre); // model centred on its own origin

      model.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.castShadow = false;
          obj.receiveShadow = false;
        }
      });

      root.add(model);

      // Wire up the embedded animation clips. The mixer targets the model so
      // its skeletal motion layers on top of the springy root transforms.
      const anims = gltf.animations ?? [];
      if (anims.length > 0) {
        console.info(
          '[deco-screen] SpongeBob clips:',
          anims.map((c) => c.name).join(', '),
        );
        mixer = new THREE.AnimationMixer(model);

        const idleClip = resolveClip(anims, CLIP_KEYWORDS.idle) ?? anims[0]!;
        const cheerClip = resolveClip(anims, CLIP_KEYWORDS.cheer) ?? idleClip;
        clips.set('idle', idleClip);
        clips.set('cheer', cheerClip);
        clips.set('boost', resolveClip(anims, CLIP_KEYWORDS.boost) ?? cheerClip);
        clips.set('bounce', resolveClip(anims, CLIP_KEYWORDS.bounce) ?? cheerClip);
        clips.set('sad', resolveClip(anims, CLIP_KEYWORDS.sad) ?? idleClip);

        idleAction = mixer.clipAction(idleClip);
        playIdle();
      }
    },
    undefined,
    (err) => {
      // Non-fatal: log and leave the no-op character in place.
      console.warn('[deco-screen] SpongeBob model failed to load:', err);
    },
  );

  // ---- reactions ---------------------------------------------------------
  function bounce(): void {
    velY += 5.5;
    scaleVel -= 4; // squash on impact, spring restores it
    spinVel += (Math.random() - 0.5) * 6;
    if (!boost) playClip('bounce', false);
  }

  function cheer(): void {
    mood = 'happy';
    velY += 9;
    scaleVel += 3;
    spinVel += Math.PI * 4; // a full-ish celebratory twirl
    if (!boost) playClip('cheer', false);
  }

  function setBoost(active: boolean): void {
    boost = active;
    mood = active ? 'excited' : 'idle';
    if (active) {
      velY += 6;
      scaleVel += 2;
      playClip('boost', true); // loops for the whole boost
    } else {
      playIdle();
    }
  }

  function flinch(): void {
    velY -= 3;
    scaleVel -= 2;
    tiltTarget = (Math.random() - 0.5) * 0.5;
    window.setTimeout(() => {
      tiltTarget = 0;
    }, 280);
  }

  function despair(): void {
    mood = 'sad';
    boost = false;
    velY += 2;
    spinVel += Math.PI * 3;
    tiltTarget = 0.4;
    playClip('sad', false);
  }

  function reset(): void {
    mood = 'idle';
    boost = false;
    tiltTarget = 0;
    velY += 3;
    scaleVel += 1.5;
    playIdle();
  }

  // ---- per-frame integration --------------------------------------------
  function tick(deltaMs: number): void {
    const dt = Math.min(deltaMs, 64) / 1000;
    if (dt <= 0) return;

    // Advance the embedded skeletal animation (walk/dance/etc.), if any.
    if (mixer) mixer.update(dt);

    swayPhase += dt * (boost ? 8 : 1.6);

    // Vertical spring back to the idle float (with a gentle sine bob layered on).
    const idleBob = Math.sin(swayPhase) * (boost ? 0.5 : 0.25);
    const targetY = mood === 'sad' ? -2.2 : idleBob;
    const ky = mood === 'sad' ? 6 : 60; // softer spring while sinking
    velY += (targetY - posY) * ky * dt;
    velY *= mood === 'sad' ? 0.9 : 0.86; // damping
    posY += velY * dt;

    // Scale spring back to 1 (squash & stretch).
    scaleVel += (1 - scale) * 90 * dt;
    scaleVel *= 0.82;
    scale += scaleVel * dt;
    scale = THREE.MathUtils.clamp(scale, 0.6, 1.5);

    // Spin: continuous while boosting, otherwise decaying impulses + slow idle sway.
    if (boost) spinVel += (10 - spinVel) * dt * 4;
    spin += spinVel * dt;
    spinVel *= 0.92;
    const idleSway = boost ? 0 : Math.sin(swayPhase * 0.5) * 0.18;

    // Tilt spring toward target lean.
    tilt += (tiltTarget - tilt) * Math.min(1, dt * 8);

    root.position.y = REST_Y + posY;
    root.rotation.set(0, spin + idleSway, tilt);
    // Squash is volume-preserving-ish: taller means thinner.
    root.scale.set(2 - scale, scale, 2 - scale);
  }

  function dispose(): void {
    if (returnToIdleTimer !== null) window.clearTimeout(returnToIdleTimer);
    if (mixer) mixer.stopAllAction();
    scene.remove(root);
    root.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        const mat = obj.material;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat.dispose();
      }
    });
  }

  return { bounce, cheer, setBoost, flinch, despair, reset, tick, dispose };
}
