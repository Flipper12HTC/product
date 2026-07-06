import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// A small 3D SpongeBob tucked into a corner of the scoreboard. He just strikes
// random poses — no game interaction — so he reads as decoration, not a focal point.
// Fully fault-tolerant: any WebGL/model failure removes the canvas and the rest of
// the back-screen carries on untouched.

const POSE_MATCH = /idle|victory|throw|jump|dance|wave/i;
const POSE_HOLD_MIN = 2500;
const POSE_HOLD_MAX = 5500;
// Keep him small within the frame so poses that raise arms / jump / throw don't get
// clipped by the canvas edges.
const TARGET_HEIGHT = 4.2;

export function mountSpongebobCorner(): void {
  const canvas = document.createElement('canvas');
  canvas.className = 'sb-corner-3d';
  document.body.appendChild(canvas);

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch (err) {
    console.warn('[back-screen] SpongeBob corner unavailable (no WebGL):', err);
    canvas.remove();
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, 0.3, 14);
  camera.lookAt(0, 0, 0);

  scene.add(new THREE.AmbientLight(0xffffff, 1.2));
  const key = new THREE.DirectionalLight(0xfff4d4, 1.7);
  key.position.set(4, 8, 6);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x6ed8ff, 0.6);
  rim.position.set(-6, 2, -4);
  scene.add(rim);

  const root = new THREE.Group();
  scene.add(root);

  function sizeToCanvas(): void {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  sizeToCanvas();
  window.addEventListener('resize', sizeToCanvas);

  // ---- random pose rotation ----
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
    if (currentAction && currentAction !== next) currentAction.crossFadeTo(next, 0.4, false);
    currentAction = next;
    currentClip = clip;
    scheduleNextPose();
  }

  new GLTFLoader().load(
    '/models/Spongebob.glb',
    (gltf) => {
      const model = gltf.scene;
      const height = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()).y || 1;
      model.scale.setScalar(TARGET_HEIGHT / height);
      model.updateWorldMatrix(false, true);
      const centre = new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3());
      model.position.sub(centre);
      root.add(model);

      const anims = gltf.animations ?? [];
      if (anims.length > 0) {
        mixer = new THREE.AnimationMixer(model);
        poseClips = anims.filter((c) => POSE_MATCH.test(c.name));
        if (poseClips.length === 0) poseClips = anims;
        playRandomPose();
      }
    },
    undefined,
    (err) => {
      console.warn('[back-screen] SpongeBob model failed to load:', err);
      canvas.remove();
    },
  );

  let sway = Math.random() * Math.PI * 2;
  let last = performance.now();
  function loop(now: number): void {
    const dt = Math.min(now - last, 64) / 1000;
    last = now;
    if (mixer) mixer.update(dt);
    // gentle idle bob + sway so he feels alive
    sway += dt * 1.3;
    root.position.y = Math.sin(sway) * 0.15;
    root.rotation.y = Math.sin(sway * 0.5) * 0.14;
    try {
      renderer.render(scene, camera);
    } catch {
      /* keep the loop alive on a transient GL error */
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}
