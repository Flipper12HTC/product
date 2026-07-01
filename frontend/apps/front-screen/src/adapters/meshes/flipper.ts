import * as THREE from 'three';
import { TABLE } from '@flipper/contracts';
import type { FlipperState } from '../../domain/game-state';

export interface Flipper {
  object: THREE.Object3D;
  setState: (state: FlipperState) => void;
}

export interface FlipperOptions {
  side: 'left' | 'right';
}

const ROTATION_SPEED = 18;

// Playfield incline (rad). The flipper hinges about the playfield normal, not world-Y.
const PLAYFIELD_TILT = 0.266;

export function createFlipper(
  scene: THREE.Scene,
  mesh: THREE.Object3D,
  options: FlipperOptions,
): Flipper {
  const { side } = options;
  const sign = side === 'left' ? -1 : 1;
  const restAngle = sign * TABLE.flippers.restAngle;
  const activeAngle = sign * TABLE.flippers.activeAngle;
  const cfg = side === 'left' ? TABLE.flippers.left : TABLE.flippers.right;

  const box = new THREE.Box3().setFromObject(mesh);
  const center = box.getCenter(new THREE.Vector3());
  const glbPivotX = side === 'left' ? box.min.x : box.max.x;
  const glbPivotY = box.min.y;
  const glbPivotZ = center.z;

  // Tilt frame: hinge rotates in-plane with the inclined table.
  const tiltGroup = new THREE.Group();
  tiltGroup.position.set(glbPivotX, glbPivotY, glbPivotZ);
  tiltGroup.rotation.x = PLAYFIELD_TILT;
  scene.add(tiltGroup);

  const hingeGroup = new THREE.Group();
  tiltGroup.add(hingeGroup);
  hingeGroup.attach(mesh); // keep mesh world transform
  hingeGroup.rotation.y = restAngle;

  // Position the pivot at the config point (TABLE.flippers; mirror backend PLAYFIELD.flippers).
  tiltGroup.position.set(cfg.x, cfg.y, cfg.z);

  let targetAngle = restAngle;
  let currentAngle = restAngle;
  let lastTime = performance.now();

  function tick(): void {
    const now = performance.now();
    const dt = (now - lastTime) / 1000;
    lastTime = now;
    const delta = targetAngle - currentAngle;
    const step = Math.sign(delta) * Math.min(Math.abs(delta), ROTATION_SPEED * dt);
    currentAngle += step;
    hingeGroup.rotation.y = currentAngle;
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  return {
    object: tiltGroup,
    setState(state: FlipperState): void {
      if (state.side !== side) return;
      targetAngle = state.active ? activeAngle : restAngle;
    },
  };
}
