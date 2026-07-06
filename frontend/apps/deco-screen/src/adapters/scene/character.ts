import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

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

// Which embedded clips take part in the random "pose" rotation. We pick lively,
// mostly-stationary animations and skip locomotion (run/walk), landings, hits and
// deaths so he keeps striking poses in place instead of drifting or looking broken.
const POSE_MATCH = /idle|victory|throw|jump|dance|wave/i;

// How long to hold each pose before switching (ms).
const POSE_HOLD_MIN = 2500;
const POSE_HOLD_MAX = 5500;

/**
 * Loads the SpongeBob GLB and cycles through its animation clips at random, so he
 * keeps changing pose on the deco-screen. Game interaction is intentionally left out
 * for now — the reaction methods are kept as no-ops so callers still compile.
 *
 * Loading is fault-tolerant: if the model fails to load, the returned API is a
 * harmless no-op and the rest of the deco-screen keeps running.
 */
export function createCharacter(scene: THREE.Scene): Character {
  const root = new THREE.Group();
  root.position.set(REST_X, REST_Y, 0);
  scene.add(root);

  let swayPhase = Math.random() * Math.PI * 2;

  // ---- random skeletal-pose rotation ------------------------------------
  let mixer: THREE.AnimationMixer | null = null;
  let poseClips: THREE.AnimationClip[] = [];
  let currentClip: THREE.AnimationClip | null = null;
  let currentAction: THREE.AnimationAction | null = null;
  let switchTimer: number | null = null;

  function scheduleNextPose(): void {
    const delay = POSE_HOLD_MIN + Math.random() * (POSE_HOLD_MAX - POSE_HOLD_MIN);
    switchTimer = window.setTimeout(playRandomPose, delay);
  }

  function playRandomPose(): void {
    if (!mixer || poseClips.length === 0) return;

    // Pick a random clip, avoiding an immediate repeat of the current one.
    let clip = poseClips[Math.floor(Math.random() * poseClips.length)]!;
    if (poseClips.length > 1) {
      let guard = 0;
      while (clip === currentClip && guard++ < 8) {
        clip = poseClips[Math.floor(Math.random() * poseClips.length)]!;
      }
    }

    const next = mixer.clipAction(clip);
    next.reset();
    next.enabled = true;
    next.setEffectiveWeight(1);
    next.setLoop(THREE.LoopRepeat, Infinity);
    next.play();

    if (currentAction && currentAction !== next) {
      currentAction.crossFadeTo(next, 0.4, false);
    }
    currentAction = next;
    currentClip = clip;

    scheduleNextPose();
  }

  const loader = new GLTFLoader();
  loader.load(
    '/models/Spongebob.glb',
    (gltf) => {
      const model = gltf.scene;

      // Normalise: scale to a fixed height, then re-centre on the model's middle.
      const box = new THREE.Box3().setFromObject(model);
      const height = box.getSize(new THREE.Vector3()).y || 1;
      model.scale.setScalar(TARGET_HEIGHT / height);

      model.updateWorldMatrix(false, true);
      const centre = new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3());
      model.position.sub(centre);

      model.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.castShadow = false;
          obj.receiveShadow = false;
        }
      });

      root.add(model);

      const anims = gltf.animations ?? [];
      if (anims.length > 0) {
        mixer = new THREE.AnimationMixer(model);
        // Prefer the curated "pose" clips; fall back to all clips if none match.
        poseClips = anims.filter((c) => POSE_MATCH.test(c.name));
        if (poseClips.length === 0) poseClips = anims;
        console.info(
          '[deco-screen] SpongeBob poses:',
          poseClips.map((c) => c.name).join(', '),
        );
        playRandomPose();
      }
    },
    undefined,
    (err) => {
      console.warn('[deco-screen] SpongeBob model failed to load:', err);
    },
  );

  // ---- game reactions: disabled for now (kept as no-ops) -----------------
  const noop = (): void => {};
  const bounce = noop;
  const cheer = noop;
  const setBoost = (_active: boolean): void => {};
  const flinch = noop;
  const despair = noop;
  const reset = noop;

  // ---- per-frame update --------------------------------------------------
  function tick(deltaMs: number): void {
    const dt = Math.min(deltaMs, 64) / 1000;
    if (dt <= 0) return;

    if (mixer) mixer.update(dt);

    // Gentle "alive" float + sway on top of whatever pose is playing.
    swayPhase += dt * 1.4;
    root.position.y = REST_Y + Math.sin(swayPhase) * 0.18;
    root.rotation.y = Math.sin(swayPhase * 0.5) * 0.12;
  }

  function dispose(): void {
    if (switchTimer !== null) window.clearTimeout(switchTimer);
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
