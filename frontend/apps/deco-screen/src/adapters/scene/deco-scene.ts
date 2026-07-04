import * as THREE from 'three';
import type { DecoTrigger } from '../../domain/deco-event';
import { createParticleSystem } from '../effects/particles';
import { createCharacter } from './character';
import type { DecoStage } from '../../application/renderer-orchestrator';

/**
 * Owns the single WebGL context for the deco-screen and composes the reactive
 * SpongeBob character with confetti particle bursts. Implements {@link DecoStage}
 * so the orchestrator can drive it from game events.
 *
 * Construction is defensive: if WebGL or the model is unavailable, callers
 * should catch and fall back to the leaderboard-only screen.
 */
export function createDecoScene(canvas: HTMLCanvasElement): DecoStage {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    55,
    window.innerWidth / window.innerHeight,
    0.1,
    100,
  );
  camera.position.set(0, 0.5, 15);
  camera.lookAt(0, -1.5, 0);

  // Warm, sunlit-underwater lighting so SpongeBob reads as bright yellow.
  scene.add(new THREE.AmbientLight(0xffffff, 1.1));
  const key = new THREE.DirectionalLight(0xfff4d4, 1.6);
  key.position.set(4, 8, 6);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x6ed8ff, 0.7);
  rim.position.set(-6, 2, -4);
  scene.add(rim);

  const particles = createParticleSystem(scene);
  const character = createCharacter(scene);

  function onResize(): void {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener('resize', onResize);

  return {
    trigger(event: DecoTrigger): void {
      particles.spawn(event);
      if (event.kind === 'bumper' || event.kind === 'slingshot') character.bounce();
    },
    reactScore(): void {
      character.cheer();
    },
    reactBoost(active: boolean): void {
      character.setBoost(active);
    },
    reactDrain(): void {
      character.flinch();
    },
    reactGameOver(): void {
      character.despair();
    },
    reactReset(): void {
      character.reset();
    },
    tick(deltaMs: number): void {
      particles.tick(deltaMs);
      character.tick(deltaMs);
      renderer.render(scene, camera);
    },
    dispose(): void {
      window.removeEventListener('resize', onResize);
      particles.dispose();
      character.dispose();
      renderer.dispose();
    },
  };
}
