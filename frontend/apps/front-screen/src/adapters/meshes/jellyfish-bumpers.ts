import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/Addons.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { TABLE } from '@flipper/contracts';
import { createElectricity, type SparkEffect } from '../effects/electricity';

interface BumperInstance {
  id: string;
  root: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  idleAction: THREE.AnimationAction | null;
  hitAction: THREE.AnimationAction | null;
  basePosY: number;
  baseScale: number;
  hitFallback: number;
  light: THREE.PointLight;
  hitFlash: number; // remaining flash time (seconds)
}

export interface JellyfishBumpers {
  hit: (id: string) => void;
  tick: (dt: number) => void;
}

// Visual tuning — jellyfish stand a bit taller than the squat bumper they replace.
const SCALE_MULT = 1.25;
const Y_OFFSET = 0.4;
const HIT_FALLBACK_DURATION = 0.35;

function pickClip(
  clips: THREE.AnimationClip[],
  patterns: RegExp[],
  fallbackIndex: number,
): THREE.AnimationClip | null {
  for (const pat of patterns) {
    const found = clips.find((c) => pat.test(c.name));
    if (found) return found;
  }
  return clips[fallbackIndex] ?? null;
}

export function createJellyfishBumpers(
  scene: THREE.Scene,
  ids?: string[],
  getFloorY?: (x: number, z: number) => number,
): JellyfishBumpers {
  const instances: BumperInstance[] = [];
  const sparks: SparkEffect[] = [];

  const loader = new GLTFLoader();
  loader.load(
    '/models/JellyFish.glb',
    (gltf) => {
      const template = gltf.scene;
      const clips = gltf.animations;

      const idleClip = pickClip(clips, [/idle/i, /float/i, /loop/i], 0);
      const hitClip = pickClip(clips, [/hit/i, /impact/i, /touch/i, /punch/i], 1);

      const tplBox = new THREE.Box3().setFromObject(template);
      const tplSize = tplBox.getSize(new THREE.Vector3());
      const tplRadius = Math.max(tplSize.x, tplSize.z) / 2 || 1;

      const bumpers = ids ? TABLE.bumpers.filter(b => ids.includes(b.id)) : TABLE.bumpers;
      for (const b of bumpers) {
        // SkeletonUtils.clone keeps skinned meshes hooked to a fresh skeleton
        // — required so each instance can run its own AnimationMixer.
        const root = cloneSkeleton(template);
        const normalize = b.radius / tplRadius;
        const finalScale = normalize * b.scale * SCALE_MULT;
        root.scale.set(finalScale, finalScale * 0.45, finalScale);
        const posY = getFloorY ? getFloorY(b.x, b.z) : Y_OFFSET;
        root.position.set(b.x, posY, b.z);

        // Give every jellyfish mesh a faint pink glow.
        root.traverse((obj) => {
          if (obj instanceof THREE.Mesh && obj.material instanceof THREE.MeshStandardMaterial) {
            const mat = obj.material.clone();
            mat.emissive = new THREE.Color(0xff66cc);
            mat.emissiveIntensity = 0.18;
            obj.material = mat;
          }
        });

        // Soft light that pulses under the jellyfish.
        const light = new THREE.PointLight(0xff88dd, 0.6, 2.5);
        light.position.set(b.x, posY + 0.3, b.z);
        scene.add(light);

        scene.add(root);

        const mixer = new THREE.AnimationMixer(root);
        let idleAction: THREE.AnimationAction | null = null;
        let hitAction: THREE.AnimationAction | null = null;

        if (idleClip) {
          idleAction = mixer.clipAction(idleClip);
          idleAction.loop = THREE.LoopRepeat;
          idleAction.timeScale = 1;
          // Offset start time so the three jellyfish don't tick in unison
          idleAction.time = Math.random() * idleClip.duration;
          idleAction.play();
        }
        if (hitClip && hitClip !== idleClip) {
          hitAction = mixer.clipAction(hitClip);
          hitAction.loop = THREE.LoopOnce;
          hitAction.clampWhenFinished = true;
        }

        instances.push({
          id: b.id,
          root,
          mixer,
          idleAction,
          hitAction,
          basePosY: root.position.y,
          baseScale: finalScale,
          hitFallback: 0,
          light,
          hitFlash: 0,
        });
      }
    },
    undefined,
    (err) => {
      // eslint-disable-next-line no-console
      console.error('[jellyfish-bumpers] failed to load JellyFish.glb', err);
    },
  );

  const FLASH_DURATION = 0.25;

  function triggerHit(inst: BumperInstance): void {
    inst.hitFlash = FLASH_DURATION;
    // Always fire the procedural punch. The skeletal Jellyfish_Hit clip plays on the same
    // bones as the always-on Jellyfish_Idle loop, so at equal weight they blend and the hit
    // barely reads. The scale punch is an unmistakable pop that composes on top, so every
    // bumper visibly reacts on every hit — not just whichever one gets struck most.
    inst.hitFallback = HIT_FALLBACK_DURATION;
    if (inst.hitAction) {
      inst.hitAction.stop();
      inst.hitAction.reset();
      inst.hitAction.play();
    }
  }

  return {
    hit(id: string): void {
      const inst = instances.find((i) => i.id === id);
      if (!inst) return;
      triggerHit(inst);
      sparks.push(createElectricity(scene, inst.root.position));
    },
    tick(dt: number): void {
      const t = performance.now() * 0.001;
      for (const inst of instances) {
        inst.mixer.update(dt);

        // Let the skeletal hit clip dominate the looping idle during the flash window,
        // otherwise the two full-weight clips average out and the hit is invisible.
        if (inst.hitAction && inst.idleAction) {
          inst.idleAction.setEffectiveWeight(inst.hitFlash > 0 ? 0.15 : 1);
        }

        // Slow, soft idle light pulse.
        const idlePulse = 0.5 + Math.sin(t * 1.4 + inst.basePosY) * 0.2;

        // Bright flash on hit.
        if (inst.hitFlash > 0) {
          inst.hitFlash = Math.max(0, inst.hitFlash - dt);
          const k = inst.hitFlash / FLASH_DURATION;
          // Peak boosted to make up for the spark's removed PointLight (which used to
          // add the bright spill but caused a shader-recompile stall on every hit).
          inst.light.intensity = 0.6 + Math.sin(k * Math.PI) * 3.4;
        } else {
          inst.light.intensity = idlePulse;
        }

        // Procedural idle bob
        if (!inst.idleAction) {
          inst.root.position.y = inst.basePosY + Math.sin(t * 2 + inst.basePosY) * 0.06;
        }

        // Procedural hit punch — always applied, composes over any skeletal hit clip.
        if (inst.hitFallback > 0) {
          inst.hitFallback = Math.max(0, inst.hitFallback - dt);
          const k = inst.hitFallback / HIT_FALLBACK_DURATION;
          const punch = Math.sin(k * Math.PI);
          const s = inst.baseScale * (1 + punch * 0.35);
          inst.root.scale.set(s, s * 0.45, s);
        } else {
          inst.root.scale.set(inst.baseScale, inst.baseScale * 0.45, inst.baseScale);
        }
      }

      for (let i = sparks.length - 1; i >= 0; i--) {
        const spark = sparks[i];
        if (!spark) continue;
        if (!spark.tick(dt)) {
          spark.dispose();
          sparks.splice(i, 1);
        }
      }
    },
  };
}
