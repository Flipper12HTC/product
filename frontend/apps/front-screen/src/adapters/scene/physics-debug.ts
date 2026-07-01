import * as THREE from 'three';
import { TABLE } from '@flipper/contracts';

// Colors per collider type
const C_WALL    = 0x00ff00; // green   — GLB trimesh walls
const C_RAMP    = 0x00ffaa; // teal    — GLB ramp (all-face collider)
const C_BOX     = 0xff00ff; // magenta — procedural box walls + GLB floor meshes
const C_BUMPER  = 0xffff00; // yellow  — bumper cylinders
const C_FLIPPER = 0xff6600; // orange  — flippers
const C_BALL    = 0x00ffff; // cyan    — ball sphere

// Mirrors WALL_MESHES patterns from backend glb-loader.ts (substring match).
const WALL_PATTERNS = [
  'col_wall_frame',
  'col_wall_main_outer',
  'col_wall_shooter',
  'col_wall_panel',
  'col_wall_left_fill',
  'col_wall_apron',
  'col_bumper_mini',
  'col_wall_plunger_lane',
  'col_bumper_targets',
  'col_ref_',
];
function isWallMesh(name: string): boolean {
  return WALL_PATTERNS.some((p) => name.includes(p));
}

// Ramp meshes (all-face colliders — ball travels through the channel)
const RAMP_PATTERNS = ['col_ramp_main'];
function isRampMesh(name: string): boolean {
  return RAMP_PATTERNS.some((p) => name.includes(p));
}

// Floor meshes — mirrors FLOOR_MESHES in glb-loader.ts (exact node names, case-sensitive)
function isSolMesh(name: string): boolean {
  return (name.startsWith('col_floor_') || name.startsWith('col_ref_floor_')) && name !== 'col_floor_base';
}

function wire(geo: THREE.BufferGeometry, color: number): THREE.LineSegments {
  return new THREE.LineSegments(
    new THREE.EdgesGeometry(geo),
    new THREE.LineBasicMaterial({ color }),
  );
}

function boxWire(hx: number, hy: number, hz: number, color: number): THREE.LineSegments {
  return wire(new THREE.BoxGeometry(hx * 2, hy * 2, hz * 2), color);
}

function glbWire(obj: THREE.Mesh, color: number): THREE.LineSegments {
  obj.updateWorldMatrix(true, false);
  const geo = (obj.geometry as THREE.BufferGeometry).clone();
  geo.applyMatrix4(obj.matrixWorld);
  return wire(geo, color);
}

export interface PhysicsDebugOverlay {
  group: THREE.Group;
  updateBall: (pos: { x: number; y: number; z: number }) => void;
}

/**
 * Build a Three.js group containing wireframes for every physics collider:
 *   - GLB trimesh walls (same mesh names as backend glb-loader WALL_MESHES)
 *   - GLB floor (floor_merged)
 *   - Procedural box boundary walls  (mirrors buildBoundaryWalls in rapier-world.ts)
 *   - Procedural lane separator       (mirrors addLaneSeparator)
 *   - Procedural launch lane floor    (mirrors addLaunchLaneFloor)
 *   - Bumper cylinders                (mirrors buildBumper for each PLAYFIELD.bumpers)
 *   - Flipper approximate boxes
 *   - Ball sphere (position updated via updateBall())
 *
 * The returned group starts hidden. Toggle group.visible to show/hide.
 * Call updateBall() on every ball_position event.
 */
export function createPhysicsDebug(glbRoot: THREE.Object3D): PhysicsDebugOverlay {
  const group = new THREE.Group();
  group.visible = false;

  // --- All GLB collision meshes → wireframes in world space ---
  glbRoot.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;

    if (isWallMesh(obj.name))                              group.add(glbWire(obj, C_WALL));
    else if (isRampMesh(obj.name))                         group.add(glbWire(obj, C_RAMP));
    else if (isSolMesh(obj.name))                          group.add(glbWire(obj, C_BOX));
    else if (obj.name.includes('col_bumper_group'))        group.add(glbWire(obj, C_BUMPER));
    else if (obj.name === 'flipper_left' || obj.name === 'flipper_right') group.add(glbWire(obj, C_FLIPPER));
  });

  // --- Procedural box walls (same params as rapier-world.ts buildBoundaryWalls) ---
  const halfW = TABLE.width / 2;   // 4.5
  const halfD = TABLE.depth / 2;   // 8.0
  const halfH = TABLE.wall.height / 2;
  const t = 0.15;

  // Physics floor is flat at Y=0 (tilt is simulated via gravity, not geometry).
  const procGroup = new THREE.Group();

  const farWall = boxWire(halfW + t, halfH, t, C_BOX);
  farWall.position.set(0, halfH, -halfD);
  procGroup.add(farWall);

  const leftWall = boxWire(t, halfH, halfD + t, C_BOX);
  leftWall.position.set(-halfW, halfH, 0);
  procGroup.add(leftWall);

  const rightWall = boxWire(t, halfH, halfD + t, C_BOX);
  rightWall.position.set(halfW, halfH, 0);
  procGroup.add(rightWall);

  // --- Lane separator (same params as rapier-world.ts addLaneSeparator) ---
  const sep = TABLE.launchLane.separatorX;
  const openingZ = -6.5;
  const wallCenterZ = (openingZ + halfD) / 2;
  const wallHalfD = halfD - wallCenterZ;
  const sepWall = boxWire(0.05, halfH, wallHalfD, C_BOX);
  sepWall.position.set(sep, halfH, wallCenterZ);
  procGroup.add(sepWall);

  group.add(procGroup);

  // --- Ball sphere (hidden until first physics update) ---
  const ballSphere = wire(new THREE.SphereGeometry(TABLE.ball.radius, 8, 8), C_BALL);
  ballSphere.visible = false;
  group.add(ballSphere);

  // --- Ball trail (last 60 positions as a line) ---
  const MAX_TRAIL = 60;
  const trailHistory: THREE.Vector3[] = [];
  const trailGeo = new THREE.BufferGeometry();
  // Pre-allocate MAX_TRAIL slots once so the GPU buffer never needs to grow.
  const trailPositions = new Float32Array(MAX_TRAIL * 3);
  const trailAttr = new THREE.BufferAttribute(trailPositions, 3);
  trailAttr.setUsage(THREE.DynamicDrawUsage);
  trailGeo.setAttribute('position', trailAttr);
  trailGeo.setDrawRange(0, 0);
  const trailMat = new THREE.LineBasicMaterial({ color: C_BALL, opacity: 0.6, transparent: true });
  const trailLine = new THREE.Line(trailGeo, trailMat);
  trailLine.frustumCulled = false;
  group.add(trailLine);

  return {
    group,
    updateBall: (pos) => {
      ballSphere.visible = true;
      ballSphere.position.set(pos.x, pos.y, pos.z);

      trailHistory.unshift(new THREE.Vector3(pos.x, pos.y, pos.z));
      if (trailHistory.length > MAX_TRAIL) trailHistory.pop();

      const count = trailHistory.length;
      for (let i = 0; i < count; i++) {
        const p = trailHistory[i]!;
        trailAttr.setXYZ(i, p.x, p.y, p.z);
      }
      trailAttr.needsUpdate = true;
      trailGeo.setDrawRange(0, count);
    },
  };
}
