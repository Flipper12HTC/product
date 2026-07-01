import * as THREE from 'three';

export interface SparkEffect {
  tick: (dt: number) => boolean;
  dispose: () => void;
}

const BOLT_COUNT = 7;
const SEGMENTS = 5;
const DURATION = 0.45;

/**
 * Spawns a short cyan/yellow electric burst at `origin`.
 * - Several zig-zag bolts radiate outward
 * - A bright core glow pulses then fades
 * The effect lives in the scene until `tick` returns `false`.
 */
export function createElectricity(scene: THREE.Scene, origin: THREE.Vector3): SparkEffect {
  const group = new THREE.Group();
  group.position.copy(origin);
  group.position.y += 0.7;

  // ---- Bolts (Line segments)
  const bolts: { line: THREE.Line; mat: THREE.LineBasicMaterial; geo: THREE.BufferGeometry }[] = [];
  for (let i = 0; i < BOLT_COUNT; i++) {
    const angle = (i / BOLT_COUNT) * Math.PI * 2 + Math.random() * 0.3;
    const radius = 0.8 + Math.random() * 0.4;
    const points: number[] = [];
    for (let s = 0; s <= SEGMENTS; s++) {
      const t = s / SEGMENTS;
      const r = t * radius;
      const jitter = (Math.random() - 0.5) * 0.35 * (1 - Math.abs(0.5 - t) * 1.4);
      const wobble = angle + jitter;
      points.push(Math.cos(wobble) * r, (Math.random() - 0.5) * 0.18, Math.sin(wobble) * r);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    const mat = new THREE.LineBasicMaterial({
      color: i % 2 === 0 ? 0x9be7ff : 0xfff79b,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      linewidth: 2,
    });
    const line = new THREE.Line(geo, mat);
    group.add(line);
    bolts.push({ line, mat, geo });
  }

  // ---- Core flash (sprite-like sphere with additive material)
  const coreGeo = new THREE.SphereGeometry(0.28, 16, 16);
  const coreMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 1,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const core = new THREE.Mesh(coreGeo, coreMat);
  group.add(core);

  // ---- Point light for a brief glow
  const light = new THREE.PointLight(0xa3e9ff, 8, 4);
  group.add(light);

  scene.add(group);

  let elapsed = 0;

  return {
    tick(dt: number): boolean {
      elapsed += dt;
      const t = elapsed / DURATION;
      if (t >= 1) return false;

      const fade = 1 - t;
      // bolts: flicker by re-randomising opacity each frame for a stutter feel
      for (const b of bolts) {
        b.mat.opacity = fade * (0.6 + Math.random() * 0.4);
      }

      // core: punch in fast, fade out
      const punch = t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85;
      coreMat.opacity = punch;
      core.scale.setScalar(0.6 + t * 1.4);

      // bolts grow outward slightly
      group.scale.setScalar(1 + t * 0.4);

      // light fades
      light.intensity = 8 * fade;

      return true;
    },
    dispose(): void {
      scene.remove(group);
      coreGeo.dispose();
      coreMat.dispose();
      for (const b of bolts) {
        b.geo.dispose();
        b.mat.dispose();
      }
    },
  };
}
