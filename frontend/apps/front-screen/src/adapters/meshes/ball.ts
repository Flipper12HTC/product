import * as THREE from 'three';
import { TABLE } from '@flipper/contracts';
import type { BallPosition } from '../../domain/game-state';

export interface Ball {
  mesh: THREE.Mesh;
  setPosition: (position: BallPosition) => void;
  setVisible: (visible: boolean) => void;
}

export function createBall(scene: THREE.Scene): Ball {
  const geo = new THREE.SphereGeometry(TABLE.ball.radius * 1.0, 32, 32);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffd700,        // jaune doré SpongeBob
    roughness: 0.05,
    metalness: 0.92,
    emissive: new THREE.Color(0xff9900),
    emissiveIntensity: 0.18,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(TABLE.ball.spawn.x, TABLE.ball.spawn.y, TABLE.ball.spawn.z);
  mesh.castShadow = true;
  mesh.visible = false;

  // Lueur chaude autour de la bille
  const light = new THREE.PointLight(0xffcc33, 2.8, 5.5);
  mesh.add(light);
  scene.add(mesh);

  return {
    mesh,
    setPosition(position: BallPosition): void {
      mesh.position.set(position.x, position.y, position.z);
    },
    setVisible(visible: boolean): void {
      mesh.visible = visible;
    },
  };
}
