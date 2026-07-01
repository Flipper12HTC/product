import * as THREE from 'three';
import { GLTFLoader, RoomEnvironment } from 'three/examples/jsm/Addons.js';
import { TABLE } from '@flipper/contracts';
import { createPhysicsDebug } from './physics-debug';
import { createJellyfishBumpers, type JellyfishBumpers } from '../meshes/jellyfish-bumpers';
import { createBubbleLayer } from '../effects/bubbles';
import { createOceanSky } from '../effects/ocean-sky';
import { createBallTrail } from '../effects/ball-trail';
import {
  createCausticOverlay,
  createCausticLights,
  createInsertLights,
  createWaterPuddles,
  createSandRipples,
  createSandDetail,
  type FloorSampler,
} from '../effects/floor-effects';
import { createSpongeMaterial } from '../materials/sponge-material';

export interface PinballMeshes {
  flipperLeft: THREE.Object3D;
  flipperRight: THREE.Object3D;
}

export interface SceneContext {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  render: () => void;
  resize: () => void;
  onMeshesReady: (cb: (meshes: PinballMeshes) => void) => void;
  toggleDebug: () => void;
  updateDebugBall: (pos: { x: number; y: number; z: number }) => void;
  addBallTrail: (pos: { x: number; y: number; z: number }) => void;
  triggerShake: () => void;
  jellyfishBumpers: JellyfishBumpers;
}

const RENDER_WIDTH = 1080;
const RENDER_HEIGHT = 1920;

// ── Singleshots corail lumineux ──
function createCoralSingleshots(root: THREE.Object3D): (t: number) => void {
  const KEYWORDS      = ['singleshot', 'sling', 'guide', 'inlane', 'outlane', 'kicker'];
  const CORAL_NAMES   = new Set([
    'col_ref_plunger_003', 'col_ref_plunger_004', 'col_ref_plunger_006', 'col_ref_plunger_007', 'col_ref_plunger_009',
    'col_ref_flipper_014', 'col_ref_flipper_030',
  ]);
  const SPONGE_NAMES  = new Set<string>();

  const coralMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0xff5522),
    roughness: 0.18,
    metalness: 0.30,
    emissive: new THREE.Color(0xff2200),
    emissiveIntensity: 0.5,
    envMapIntensity: 1.6,
  });

  const spongeMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0xffe135),
    roughness: 0.20,
    metalness: 0.25,
    emissive: new THREE.Color(0xffaa00),
    emissiveIntensity: 0.45,
    envMapIntensity: 1.6,
  });

  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const n = obj.name.toLowerCase();
    if (SPONGE_NAMES.has(obj.name)) {
      obj.material = spongeMat;
    } else if (CORAL_NAMES.has(obj.name) || KEYWORDS.some((k) => n.includes(k))) {
      obj.material = coralMat;
    }
  });

  return (t: number) => {
    const pulse = 0.28 + Math.sin(t * 1.6) * 0.22 + Math.sin(t * 2.9 + 1.2) * 0.08;
    coralMat.emissiveIntensity = pulse;
    spongeMat.emissiveIntensity = 0.30 + Math.sin(t * 1.4 + 0.8) * 0.20 + Math.sin(t * 2.5) * 0.07;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// createScene
// ─────────────────────────────────────────────────────────────────────────────
export function createScene(canvas: HTMLCanvasElement): SceneContext {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a7ab8);
  scene.fog = new THREE.FogExp2(0x1a6a9a, 0.005);

  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 1000);
  // Top-down view: look straight down, with world -Z (the far end of the table)
  // pointing to the top of the screen.
  camera.up.set(0, 0, -1);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.45;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment()).texture;
  scene.environmentIntensity = 0.55;
  pmrem.dispose();

  // Fixed, locked top-down camera centred on the playfield — no OrbitControls,
  // the cabinet view must not move. fitCamera() picks the height so the whole
  // table fills the current viewport; it runs on init and on every resize.
  const VIEW_CENTER = new THREE.Vector3(0, 0, -0.5);
  const TABLE_HALF_X = 5.2; // playfield width/2 + margin
  const TABLE_HALF_Z = 8.6; // playfield depth/2 + margin

  function fitCamera(): void {
    const aspect = window.innerWidth / window.innerHeight;
    camera.aspect = aspect;
    const vHalf = (camera.fov * Math.PI) / 360; // half vertical FOV (rad)
    const distForDepth = TABLE_HALF_Z / Math.tan(vHalf);
    const hHalf = Math.atan(Math.tan(vHalf) * aspect);
    const distForWidth = TABLE_HALF_X / Math.tan(hHalf);
    camera.position.set(VIEW_CENTER.x, Math.max(distForDepth, distForWidth), VIEW_CENTER.z);
    camera.lookAt(VIEW_CENTER);
    camera.updateProjectionMatrix();
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, true);
  fitCamera();

  // ── Éclairage Bikini Bottom ──
  scene.add(new THREE.HemisphereLight(0x00ccff, 0xffdd66, 2.8));
  scene.add(new THREE.AmbientLight(0xffee22, 2.0));

  const keyLight = new THREE.DirectionalLight(0xffdd00, 13.0);
  keyLight.position.set(6, 28, -8);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.width  = 2048;
  keyLight.shadow.mapSize.height = 2048;
  keyLight.shadow.camera.near   = 1;
  keyLight.shadow.camera.far    = 90;
  keyLight.shadow.camera.left   = -13;
  keyLight.shadow.camera.right  =  13;
  keyLight.shadow.camera.top    =  20;
  keyLight.shadow.camera.bottom = -20;
  keyLight.shadow.bias          = -0.0003;
  keyLight.shadow.normalBias    =  0.02;
  keyLight.shadow.radius        =  4;
  scene.add(keyLight);

  // NB: Object3D.position is a read-only property in three r150+ — assigning it
  // (e.g. via Object.assign(light, { position })) throws "Cannot assign to read
  // only property 'position'". Set it through the Vector3 instead.
  const addDirLight = (color: number, intensity: number, x: number, y: number, z: number): void => {
    const light = new THREE.DirectionalLight(color, intensity);
    light.position.set(x, y, z);
    scene.add(light);
  };
  addDirLight(0xff8833, 5.5, -8, 18, 6);
  addDirLight(0x0099ff, 4.0, -10, 8, 16);
  addDirLight(0x00ffee, 3.2, -2, 14, -20);
  addDirLight(0xffcc00, 4.5, 18, 0.5, 3);
  addDirLight(0xff4488, 2.5, 0, 2, 20);

  // ── Textures sable ──
  const sandTexLoader = new THREE.TextureLoader();
  const g054base = '/Ground054_2K-JPG/Ground054_2K-JPG_';

  const sandDiff = sandTexLoader.load(`${g054base}Color.jpg`);
  sandDiff.wrapS = sandDiff.wrapT = THREE.RepeatWrapping;
  sandDiff.repeat.set(5, 9);
  sandDiff.colorSpace = THREE.SRGBColorSpace;

  const sandRough = sandTexLoader.load(`${g054base}Roughness.jpg`);
  sandRough.wrapS = sandRough.wrapT = THREE.RepeatWrapping;
  sandRough.repeat.set(5, 9);

  const sandAO = sandTexLoader.load(`${g054base}AmbientOcclusion.jpg`);
  sandAO.wrapS = sandAO.wrapT = THREE.RepeatWrapping;
  sandAO.repeat.set(5, 9);

  const sandBump = sandTexLoader.load(`${g054base}Displacement.jpg`);
  sandBump.wrapS = sandBump.wrapT = THREE.RepeatWrapping;
  sandBump.repeat.set(5, 9);

  const sandNorm = sandTexLoader.load(`${g054base}NormalGL.jpg`);
  sandNorm.wrapS = sandNorm.wrapT = THREE.RepeatWrapping;
  sandNorm.repeat.set(5, 9);

  const sandMat = new THREE.MeshStandardMaterial({
    map:           sandDiff,
    normalMap:     sandNorm,
    normalScale:   new THREE.Vector2(12.0, 12.0),
    roughnessMap:  sandRough,
    aoMap:         sandAO,
    aoMapIntensity: 1.8,
    bumpMap:       sandBump,
    bumpScale:     10.0,
    roughness:     0.94,
    metalness:     0.0,
    side:          THREE.DoubleSide,
  });

  // ── Textures mur ──
  const wallTexLoader = new THREE.TextureLoader();
  const wallDiff = wallTexLoader.load('/rough_block_wall_2k/textures/rough_block_wall_diff_2k.jpg');
  wallDiff.wrapS = wallDiff.wrapT = THREE.RepeatWrapping;
  wallDiff.repeat.set(4, 2);
  wallDiff.colorSpace = THREE.SRGBColorSpace;

  const wallArm = wallTexLoader.load('/rough_block_wall_2k/textures/rough_block_wall_arm_2k.jpg');
  wallArm.wrapS = wallArm.wrapT = THREE.RepeatWrapping;
  wallArm.repeat.set(4, 2);

  const wallNorm = wallTexLoader.load('/rough_block_wall_2k/textures/rough_block_wall_nor_gl_2k.jpg');
  wallNorm.wrapS = wallNorm.wrapT = THREE.RepeatWrapping;
  wallNorm.repeat.set(4, 2);

  const wallMat = new THREE.MeshStandardMaterial({
    map: wallDiff,
    roughnessMap: wallArm,
    aoMap: wallArm,
    normalMap: wallNorm,
    aoMapIntensity: 1.5,
    roughness: 0.85,
    metalness: 0.02,
    color: new THREE.Color(0x1a4d7a),
  });

  // ── Textures herbe sous-marine ──
  const grassTexLoader = new THREE.TextureLoader();
  const grassBase = '/Grass002_2K-JPG/Grass002_2K-JPG_';

  const grassDiff = grassTexLoader.load(`${grassBase}Color.jpg`);
  grassDiff.wrapS = grassDiff.wrapT = THREE.RepeatWrapping;
  grassDiff.colorSpace = THREE.SRGBColorSpace;

  const grassRough = grassTexLoader.load(`${grassBase}Roughness.jpg`);
  grassRough.wrapS = grassRough.wrapT = THREE.RepeatWrapping;

  const grassNorm = grassTexLoader.load(`${grassBase}NormalGL.jpg`);
  grassNorm.wrapS = grassNorm.wrapT = THREE.RepeatWrapping;

  const grassAO = grassTexLoader.load(`${grassBase}AmbientOcclusion.jpg`);
  grassAO.wrapS = grassAO.wrapT = THREE.RepeatWrapping;

  const grassBump = grassTexLoader.load(`${grassBase}Displacement.jpg`);
  grassBump.wrapS = grassBump.wrapT = THREE.RepeatWrapping;

  const grassMat = new THREE.MeshStandardMaterial({
    map: grassDiff,
    color: new THREE.Color(0x2d5a1e),
    roughnessMap: grassRough,
    normalMap: grassNorm,
    normalScale: new THREE.Vector2(6.0, 6.0),
    aoMap: grassAO,
    aoMapIntensity: 1.6,
    bumpMap: grassBump,
    bumpScale: 5.5,
    roughness: 0.88,
    metalness: 0.0,
  });

  const GRASS_NAMES  = new Set(['col_wall_center']);
  const CLOUDS_NAMES = new Set(['col_ref_floor_main', 'col_wall_left_fill', 'col_wall_main_outer']);

  const cloudsTex = new THREE.TextureLoader().load('/Floral Background _Aquarium _ Terrarium Background.jpg');
  cloudsTex.wrapS = cloudsTex.wrapT = THREE.RepeatWrapping;
  cloudsTex.colorSpace = THREE.SRGBColorSpace;

  const cloudsMat = new THREE.MeshStandardMaterial({
    map: cloudsTex,
    color: new THREE.Color(0x555555),
    roughness: 0.75,
    metalness: 0.0,
  });

  const logoTex = new THREE.TextureLoader().load('/bobfunny.png');
  logoTex.colorSpace = THREE.SRGBColorSpace;
  const logoMat = new THREE.MeshStandardMaterial({
    map:              logoTex,
    color:            new THREE.Color(0x666666),
    transparent:      true,
    alphaTest:        0.05,
    roughness:        0.60,
    metalness:        0.10,
    emissiveIntensity: 0.0,
    depthWrite:       false,
    side:             THREE.DoubleSide,
  });

  const spongeMat    = createSpongeMaterial();
  const SPONGE_MESH_NAMES = new Set(['col_ramp_main']);
  const CONCRETE_MESH_NAMES = new Set(['col_wall_frame_black', 'col_wall_panel', 'col_wall_shooter']);

  const concreteTex = new THREE.TextureLoader().load('/photo-concrete-texture-pattern.jpg');
  concreteTex.wrapS = concreteTex.wrapT = THREE.RepeatWrapping;
  concreteTex.colorSpace = THREE.SRGBColorSpace;

  const concreteMat = new THREE.MeshStandardMaterial({
    map: concreteTex,
    color: new THREE.Color(0x777777),
    roughness: 0.85,
    metalness: 0.0,
  });

  const concreteFrameMat = new THREE.MeshStandardMaterial({
    map: concreteTex,
    color: new THREE.Color(0x777777),
    roughness: 0.85,
    metalness: 0.0,
  });

  let meshReadyCb:  ((meshes: PinballMeshes) => void) | null = null;
  let debugBallCb:  ((pos: { x: number; y: number; z: number }) => void) | null = null;
  let debugGroupRef: { visible: boolean } | null = null;
  let debugEnabled  = false;

  const gltfLoader = new GLTFLoader();
  gltfLoader.load('/models/FlipperBase.glb', (gltf) => {
    const root = gltf.scene;

    const PHYSICS_REF_NAMES = ['col_floor_playfield_blue', 'flipper_left', 'flipper_right'];
    const preScaleRef = new THREE.Box3();
    for (const n of PHYSICS_REF_NAMES) {
      const obj = root.getObjectByName(n);
      if (obj) preScaleRef.expandByObject(obj);
    }
    if (preScaleRef.isEmpty()) preScaleRef.setFromObject(root);

    const rawSize = preScaleRef.getSize(new THREE.Vector3());
    const sx = TABLE.width  / rawSize.x;
    const sz = TABLE.depth  / rawSize.z;
    const sy = (sx + sz) / 2;
    root.scale.set(sx, sy, sz);
    root.updateWorldMatrix(false, true);

    const postScaleRef = new THREE.Box3();
    for (const n of PHYSICS_REF_NAMES) {
      const obj = root.getObjectByName(n);
      if (obj) postScaleRef.expandByObject(obj);
    }
    if (postScaleRef.isEmpty()) postScaleRef.setFromObject(root);
    const physicsCenter = postScaleRef.getCenter(new THREE.Vector3());

    root.position.set(-physicsCenter.x, -postScaleRef.min.y, -physicsCenter.z);

    const base = root.getObjectByName('col_floor_base');
    if (base) base.visible = false;

    scene.add(root);
    root.updateWorldMatrix(true, true);

    // Sol sablé — projection planaire en coordonnées monde pour des UVs cohérentes
    const playfield = root.getObjectByName('col_floor_playfield_blue');
    if (playfield instanceof THREE.Mesh) {
      const posAttr = playfield.geometry.attributes['position'] as THREE.BufferAttribute;
      const count   = posAttr.count;
      const uvArr   = new Float32Array(count * 2);
      const wm      = playfield.matrixWorld;
      const v       = new THREE.Vector3();
      for (let i = 0; i < count; i++) {
        v.set(posAttr.getX(i) ?? 0, posAttr.getY(i) ?? 0, posAttr.getZ(i) ?? 0);
        v.applyMatrix4(wm);
        uvArr[i * 2]     = (v.x / TABLE.width  + 0.5) * 3;
        uvArr[i * 2 + 1] = (v.z / TABLE.depth  + 0.5) * 5;
      }
      const newUV = new THREE.BufferAttribute(uvArr, 2);
      playfield.geometry.setAttribute('uv',  newUV);
      playfield.geometry.setAttribute('uv2', newUV.clone());
      playfield.material = sandMat;
    }

    const pearlMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x66ddff),
      roughness: 0.08,
      metalness: 0.55,
      emissive: new THREE.Color(0x0055cc),
      emissiveIntensity: 0.35,
      envMapIntensity: 1.8,
    });

    const flipperMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x0f0a01),
      roughness: 0.55,
      metalness: 0.10,
    });

    root.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      if (obj.name === 'col_floor_playfield_blue') return;

      if (SPONGE_MESH_NAMES.has(obj.name)) { obj.material = spongeMat; return; }
      if (obj.name === 'col_wall_frame_black') { obj.material = concreteFrameMat; return; }
      if (obj.name === 'col_ref_plunger_star') {
        obj.material = new THREE.MeshStandardMaterial({
          color: new THREE.Color(0xff66cc),
          emissive: new THREE.Color(0xff44bb),
          emissiveIntensity: 0.35,
          roughness: 0.3,
          metalness: 0.4,
        });
        return;
      }
      if (obj.name === 'col_floor_detail') {
        obj.material = new THREE.MeshStandardMaterial({
          color: new THREE.Color(0xcc4499),
          emissive: new THREE.Color(0x992277),
          emissiveIntensity: 0.25,
          roughness: 0.3,
          metalness: 0.4,
        });
        return;
      }
      if (CONCRETE_MESH_NAMES.has(obj.name)) { obj.material = concreteMat; return; }
      if (GRASS_NAMES.has(obj.name)) { obj.material = grassMat; return; }
      if (CLOUDS_NAMES.has(obj.name)) { obj.material = cloudsMat; return; }
      if (obj.name.toLowerCase().includes('wall') || obj.name.toLowerCase().includes('frame')) {
        obj.material = wallMat;
        return;
      }
      if (obj.name === 'flipper_left' || obj.name === 'flipper_right') {
        obj.material = flipperMat;
        return;
      }
      obj.material = pearlMat;
    });

    for (const name of ['flipper_left', 'flipper_right']) {
      const fObj = root.getObjectByName(name);
      if (fObj) fObj.traverse((child) => {
        if (child instanceof THREE.Mesh) child.material = flipperMat;
      });
    }

    // ── Reprojection UV planaire pour grass + sponge ──
    root.updateWorldMatrix(true, true);
    const GRASS_FREQ = 0.55;
    for (const meshName of [...GRASS_NAMES, ...SPONGE_MESH_NAMES]) {
      const gobj = root.getObjectByName(meshName);
      if (!(gobj instanceof THREE.Mesh)) continue;
      const posAttr = gobj.geometry.attributes['position'] as THREE.BufferAttribute;
      const cnt  = posAttr.count;
      const uvA  = new Float32Array(cnt * 2);
      const wm   = gobj.matrixWorld;
      const vv   = new THREE.Vector3();
      const bb   = new THREE.Box3().setFromObject(gobj);
      const sz   = bb.getSize(new THREE.Vector3());
      const isFloor = sz.y < sz.x * 0.4 && sz.y < sz.z * 0.4;
      for (let i = 0; i < cnt; i++) {
        vv.set(posAttr.getX(i) ?? 0, posAttr.getY(i) ?? 0, posAttr.getZ(i) ?? 0);
        vv.applyMatrix4(wm);
        if (isFloor) {
          uvA[i * 2]     = vv.x * GRASS_FREQ;
          uvA[i * 2 + 1] = vv.z * GRASS_FREQ;
        } else {
          const u = sz.x >= sz.z ? vv.x : vv.z;
          uvA[i * 2]     = u    * GRASS_FREQ;
          uvA[i * 2 + 1] = vv.y * GRASS_FREQ;
        }
      }
      const newUV = new THREE.BufferAttribute(uvA, 2);
      gobj.geometry.setAttribute('uv',  newUV);
      gobj.geometry.setAttribute('uv2', newUV.clone());
    }

    // ── Reprojection UV cloudssponge ──
    for (const meshName of [...CLOUDS_NAMES]) {
      const gobj = root.getObjectByName(meshName);
      if (!(gobj instanceof THREE.Mesh)) continue;
      const posAttr = gobj.geometry.attributes['position'] as THREE.BufferAttribute;
      const cnt = posAttr.count;
      const uvA = new Float32Array(cnt * 2);
      const wm  = gobj.matrixWorld;
      const vv  = new THREE.Vector3();
      const bb  = new THREE.Box3().setFromObject(gobj);
      const sz  = bb.getSize(new THREE.Vector3());
      const isFloor = sz.y < sz.x * 0.4 && sz.y < sz.z * 0.4;
      for (let i = 0; i < cnt; i++) {
        vv.set(posAttr.getX(i) ?? 0, posAttr.getY(i) ?? 0, posAttr.getZ(i) ?? 0);
        vv.applyMatrix4(wm);
        const CLOUDS_SCALE = 3.0;
        if (isFloor) {
          uvA[i * 2]     = ((vv.x - bb.min.x) / sz.x) * CLOUDS_SCALE;
          uvA[i * 2 + 1] = ((vv.z - bb.min.z) / sz.z) * CLOUDS_SCALE;
        } else {
          const u = sz.x >= sz.z ? vv.x : vv.z;
          const uMin = sz.x >= sz.z ? bb.min.x : bb.min.z;
          const uSz  = sz.x >= sz.z ? sz.x : sz.z;
          uvA[i * 2]     = ((u    - uMin)    / uSz) * CLOUDS_SCALE;
          uvA[i * 2 + 1] = ((vv.y - bb.min.y) / sz.y) * CLOUDS_SCALE;
        }
      }
      const newUV = new THREE.BufferAttribute(uvA, 2);
      gobj.geometry.setAttribute('uv',  newUV);
      gobj.geometry.setAttribute('uv2', newUV.clone());
    }

    // ── Reprojection UV béton (col_wall_panel, col_wall_shooter) ──
    const CONCRETE_FREQ = 0.14;
    for (const meshName of ['col_wall_panel', 'col_wall_shooter']) {
      const gobj = root.getObjectByName(meshName);
      if (!(gobj instanceof THREE.Mesh)) continue;
      const posAttr = gobj.geometry.attributes['position'] as THREE.BufferAttribute;
      const cnt = posAttr.count;
      const uvA = new Float32Array(cnt * 2);
      const wm  = gobj.matrixWorld;
      const vv  = new THREE.Vector3();
      const bb  = new THREE.Box3().setFromObject(gobj);
      const sz  = bb.getSize(new THREE.Vector3());
      const isFloor = sz.y < sz.x * 0.4 && sz.y < sz.z * 0.4;
      for (let i = 0; i < cnt; i++) {
        vv.set(posAttr.getX(i) ?? 0, posAttr.getY(i) ?? 0, posAttr.getZ(i) ?? 0);
        vv.applyMatrix4(wm);
        if (isFloor) {
          uvA[i * 2]     = vv.x * CONCRETE_FREQ;
          uvA[i * 2 + 1] = vv.z * CONCRETE_FREQ;
        } else {
          const u = sz.x >= sz.z ? vv.x : vv.z;
          uvA[i * 2]     = u    * CONCRETE_FREQ;
          uvA[i * 2 + 1] = vv.y * CONCRETE_FREQ;
        }
      }
      const newUV = new THREE.BufferAttribute(uvA, 2);
      gobj.geometry.setAttribute('uv',  newUV);
      gobj.geometry.setAttribute('uv2', newUV.clone());
    }

    // ── Reprojection UV béton (col_wall_frame_black) ──
    {
      const FRAME_FREQ = 0.28;
      const gobj = root.getObjectByName('col_wall_frame_black');
      if (gobj instanceof THREE.Mesh) {
        const posAttr = gobj.geometry.attributes['position'] as THREE.BufferAttribute;
        const cnt = posAttr.count;
        const uvA = new Float32Array(cnt * 2);
        const wm  = gobj.matrixWorld;
        const vv  = new THREE.Vector3();
        for (let i = 0; i < cnt; i++) {
          vv.set(posAttr.getX(i) ?? 0, posAttr.getY(i) ?? 0, posAttr.getZ(i) ?? 0);
          vv.applyMatrix4(wm);
          uvA[i * 2]     = vv.x * FRAME_FREQ;
          uvA[i * 2 + 1] = vv.z * FRAME_FREQ;
        }
        const newUV = new THREE.BufferAttribute(uvA, 2);
        gobj.geometry.setAttribute('uv',  newUV);
        gobj.geometry.setAttribute('uv2', newUV.clone());
      }
    }

    const meshNames: string[] = [];
    root.traverse((o) => { if (o instanceof THREE.Mesh) meshNames.push(o.name); });
    console.log('[GLB meshes]', meshNames);

    tickSingleshots = createCoralSingleshots(root);

    root.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.castShadow    = true;
        obj.receiveShadow = true;
      }
    });

    const debug = createPhysicsDebug(root);
    scene.add(debug.group);
    debugBallCb   = debug.updateBall;
    debugGroupRef = debug.group;

    const flipperLeft  = root.getObjectByName('flipper_left');
    const flipperRight = root.getObjectByName('flipper_right');
    if (flipperLeft && flipperRight && meshReadyCb) {
      meshReadyCb({ flipperLeft, flipperRight });
    }

    // ── Décorations calées sur la surface inclinée du playfield ──
    {
      const ray  = new THREE.Raycaster();
      const down = new THREE.Vector3(0, -1, 0);

      function rawHit(x: number, z: number): number | null {
        ray.set(new THREE.Vector3(x, 20, z), down);
        const hits = ray.intersectObject(root, true);
        const hit = hits.find(h => (h.face?.normal.y ?? 0) > 0.3) ?? hits[0];
        return hit ? hit.point.y + 0.015 : null;
      }

      const yNear = rawHit(0,  6) ?? 0.40;
      const yFar  = rawHit(0, -6) ?? 1.70;
      const slope = (yFar - yNear) / (-12);

      function sampleFloorY(x: number, z: number): number {
        return rawHit(x, z) ?? (yNear + slope * (z - 6));
      }

      const floor: FloorSampler = {
        getY: sampleFloorY,
        rotX: -Math.PI / 2 + Math.atan(Math.abs(slope)),
      };

      jellyfishBumpers = createJellyfishBumpers(scene, ['b2', 'b3'], floor.getY);
      tickInserts      = createInsertLights(scene, floor);
      tickCaustics     = createCausticOverlay(scene, floor);
      tickCausticLights = createCausticLights(scene);
      tickPuddles      = createWaterPuddles(scene, floor);
      tickSand         = createSandRipples(scene, floor, sandNorm);
      createSandDetail(scene, floor, sandDiff);

      // ── Maison Squidward ──
      {
        const SQ_X = 3.5, SQ_Z = -6.0;
        const sqLoader = new GLTFLoader();
        sqLoader.load('/models/sponge_bob_hero_pants_squidwards_house.glb', (gltf) => {
          const model = gltf.scene;
          const box = new THREE.Box3().setFromObject(model);
          const size = box.getSize(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z);
          const scale = 1.6 / maxDim;
          model.scale.setScalar(scale);
          model.position.set(SQ_X, floor.getY(SQ_X, SQ_Z) - box.min.y * scale, SQ_Z);
          model.traverse((obj) => {
            if (obj instanceof THREE.Mesh && obj.material instanceof THREE.MeshStandardMaterial) {
              obj.material = obj.material.clone();
              obj.material.color.multiplyScalar(0.55);
            }
          });
          scene.add(model);
        }, undefined, (err) => {
          console.error('[squidward-house] failed to load', err);
        });
      }

      // ── Maison SpongeBob ──
      {
        const SB_X = -3.18, SB_Z = -6.35;
        const sbLoader = new GLTFLoader();
        sbLoader.load('/models/sponge_bob_hero_pants_sponge_bobs_house.glb', (gltf) => {
          const model = gltf.scene;
          const box = new THREE.Box3().setFromObject(model);
          const size = box.getSize(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z);
          const scale = 1.2 / maxDim;
          model.scale.setScalar(scale);
          model.position.set(SB_X, floor.getY(SB_X, SB_Z) - box.min.y * scale, SB_Z);
          model.traverse((obj) => {
            if (obj instanceof THREE.Mesh && obj.material instanceof THREE.MeshStandardMaterial) {
              obj.material = obj.material.clone();
              obj.material.color.multiplyScalar(0.25);
            }
          });
          scene.add(model);
        }, undefined, (err) => {
          console.error('[spongebob-house] failed to load', err);
        });
      }

      // ── Logo Flipper12 peint sur le sol ──
      {
        const wallCenter = root.getObjectByName('col_wall_center');
        if (wallCenter instanceof THREE.Mesh) {
          const bb  = new THREE.Box3().setFromObject(wallCenter);
          const ctr = bb.getCenter(new THREE.Vector3());
          const sz  = bb.getSize(new THREE.Vector3());
          const w   = Math.max(sz.x, sz.z) * 0.45;
          const h   = Math.min(sz.x, sz.z) * 0.45;

          const logoPlane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), logoMat);
          logoPlane.rotation.x = floor.rotX;
          logoPlane.position.set(ctr.x, floor.getY(ctr.x, ctr.z) + 0.03, ctr.z);
          logoPlane.renderOrder = 1;
          scene.add(logoPlane);
        }
      }
    }
  });

  // ── Effets de fond (indépendants du sol) ──
  const tickBubblesLarge    = createBubbleLayer(scene, 30,  0.30, 0.45);
  const tickBubblesSmall    = createBubbleLayer(scene, 70, 0.15, 0.30);
  let tickInserts:      (t: number) => void = () => {};
  let tickCaustics:     (t: number) => void = () => {};
  let tickCausticLights:(t: number) => void = () => {};
  let tickPuddles:      (t: number) => void = () => {};
  let tickSingleshots:  (t: number) => void = () => {};
  let tickSand:         (t: number) => void = () => {};
  const tickSky = createOceanSky(scene);
  const trail   = createBallTrail(scene);
  let jellyfishBumpers: JellyfishBumpers = { hit: () => {}, tick: () => {} };

  // ── Camera shake ──
  let shakeElapsed = 0;
  const shakeOffset = new THREE.Vector3();

  function applyShake(dt: number): void {
    if (shakeElapsed > 0) {
      shakeElapsed = Math.max(0, shakeElapsed - dt);
      const factor = (shakeElapsed / 0.28) * 0.6;
      shakeOffset.set(
        (Math.random() - 0.5) * factor,
        0,
        (Math.random() - 0.5) * factor,
      );
    } else if (shakeOffset.lengthSq() > 0) {
      shakeOffset.set(0, 0, 0);
    }
    // Locked camera: jitter only the look-at target, never the position.
    camera.lookAt(VIEW_CENTER.x + shakeOffset.x, VIEW_CENTER.y, VIEW_CENTER.z + shakeOffset.z);
  }

  const startTime = performance.now();
  let lastRenderMs = performance.now();

  function render(): void {
    const now = performance.now();
    const dt  = Math.min(0.05, (now - lastRenderMs) / 1000);
    lastRenderMs = now;
    const t = (now - startTime) * 0.001;

    tickBubblesLarge(t);
    tickBubblesSmall(t);
    tickInserts(t);
    tickCaustics(t);
    tickCausticLights(t);
    tickPuddles(t);
    tickSingleshots(t);
    tickSand(t);
    tickSky(t);
    trail.tick(dt);
    applyShake(dt);
    renderer.render(scene, camera);
  }

  // ── Clic pour identifier les meshes en debug ──
  const pickRaycaster = new THREE.Raycaster();
  canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = RENDER_WIDTH  / rect.width;
    const scaleY = RENDER_HEIGHT / rect.height;
    const ndcX =  ((e.clientX - rect.left) * scaleX / RENDER_WIDTH)  * 2 - 1;
    const ndcY = -((e.clientY - rect.top)  * scaleY / RENDER_HEIGHT) * 2 + 1;
    pickRaycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
    const hits = pickRaycaster.intersectObjects(scene.children, true);
    const hit = hits.find((h) => h.object instanceof THREE.Mesh && h.object.name !== '');
    if (hit) {
      console.log(`[CLICK] mesh: "${hit.object.name}"`, hit.object);
    }
  });

  function resize(): void {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight, true);
    fitCamera();
  }

  return {
    scene,
    camera,
    renderer,
    render,
    resize,
    onMeshesReady(cb) { meshReadyCb = cb; },
    toggleDebug() {
      debugEnabled = !debugEnabled;
      if (debugGroupRef) debugGroupRef.visible = debugEnabled;
    },
    updateDebugBall(pos) { debugBallCb?.(pos); },
    addBallTrail(pos) { trail.add(pos); },
    triggerShake() { shakeElapsed = 0.28; },
    get jellyfishBumpers() { return jellyfishBumpers; },
  };
}
