import { NodeIO } from '@gltf-transform/core';

export interface MeshGeometry {
  vertices: Float32Array;
  indices: Uint32Array;
}

export interface FlipperPivot {
  x: number;
  y: number;
  z: number;
  length: number;
}

export interface BumperPosition {
  id: string;       // derived from the mesh name suffix
  x: number;        // physics X
  z: number;        // physics Z
  radius: number;   // cylinder radius in physics units
}

export interface DerivedPositions {
  flipperLeft: FlipperPivot;
  flipperRight: FlipperPivot;
  laneSeparatorX: number;       // inner edge of plunger lane wall (separator between lane & field)
  laneSpawnX: number;           // centre X of the plunger lane
  bumpers: BumperPosition[];    // procedural bumpers — auto-collected from col_bumper_marker_* meshes
}

export interface PlayfieldGeometry {
  sol: MeshGeometry;       // col_floor_* only — used for addInclinedFloor slope
  refFloor: MeshGeometry | null; // col_ref_floor_* — separate trimesh for exact floor collision
  murs: MeshGeometry;
  aprons: MeshGeometry | null;
  rampe: MeshGeometry | null;
  frameWalls: MeshGeometry | null; // col_wall_frame_* — extracted without the inLane filter
  derived: DerivedPositions;
}

export interface LoadOptions {
  targetWidth: number;
  targetDepth: number;
}

/**
 * Load playfield meshes from pinball_map_FINAL.glb.
 *
 * Coordinate remapping (GLB uses Z-up, Blender XY plane = table surface):
 *   GLB X → physics X  (table width, left-right)
 *   GLB Z → physics Y  (elevation / height, Z-up in GLB → Y-up in Rapier)
 *   GLB Y → physics Z  (table depth, negated so drain = +Z)
 *
 * Scale / centering applied:
 *   1. Compute bbox from physics-relevant meshes only.
 *   2. scaleX = targetWidth  / glbXRange
 *      scaleZ = targetDepth  / glbYRange  (GLB Y = depth)
 *      scaleY = avg(scaleX, scaleZ)        (height preserves aspect ratio)
 *   3. Center on physics X and Z.
 *   4. Align floor (glbZ min) to physics Y = 0.
 */
/**
 * Concatenate two trimeshes into one, with the second mesh's vertex indices
 * shifted by the first mesh's vertex count. Returns null if both inputs are null.
 */
function mergeTrimeshes(a: MeshGeometry | null, b: MeshGeometry | null): MeshGeometry | null {
  if (!a) return b;
  if (!b) return a;
  const verts = new Float32Array(a.vertices.length + b.vertices.length);
  verts.set(a.vertices, 0);
  verts.set(b.vertices, a.vertices.length);
  const offset = a.vertices.length / 3;
  const idx = new Uint32Array(a.indices.length + b.indices.length);
  idx.set(a.indices, 0);
  for (let i = 0; i < b.indices.length; i++) {
    idx[a.indices.length + i] = (b.indices[i] as number) + offset;
  }
  return { vertices: verts, indices: idx };
}

export async function loadPlayfieldGeometry(
  path: string,
  opts: LoadOptions,
): Promise<PlayfieldGeometry> {
  const io = new NodeIO();
  const doc = await io.read(path);
  const root = doc.getRoot();

  // Only these meshes drive the scene bounding box used for scaling.
  // col_floor_playfield_blue spans the full table (X:0→28.58, Y:-0.92→50.62, depth=51.53)
  // matching the frontend scene bbox — keeps physics/visual coords aligned.
  const BBOX_MESHES = ['col_floor_playfield_blue', 'flipper_left', 'flipper_right'];

  let sceneMinX = Infinity,
    sceneMinY = Infinity,
    sceneMinZ = Infinity;
  let sceneMaxX = -Infinity,
    sceneMaxY = -Infinity,
    sceneMaxZ = -Infinity;

  const meshNodes = root.listNodes().filter((n) => n.getMesh() !== null);
  for (const node of meshNodes) {
    const name = node.getName() ?? '';
    if (!BBOX_MESHES.some((m) => name.includes(m))) continue;
    const mesh = node.getMesh();
    if (!mesh) continue;
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      if (!pos) continue;
      const arr = pos.getArray();
      if (!arr) continue;
      const count = pos.getCount();
      for (let i = 0; i < count; i++) {
        const x = arr[i * 3] as number;
        const y = arr[i * 3 + 1] as number;
        const z = arr[i * 3 + 2] as number;
        if (x < sceneMinX) sceneMinX = x;
        if (y < sceneMinY) sceneMinY = y;
        if (z < sceneMinZ) sceneMinZ = z;
        if (x > sceneMaxX) sceneMaxX = x;
        if (y > sceneMaxY) sceneMaxY = y;
        if (z > sceneMaxZ) sceneMaxZ = z;
      }
    }
  }

  // GLB is Y-up (standard glTF, "+Y Up" on export): GLB X = width, GLB Y = elevation,
  // GLB Z = depth. The frontend (Three.js, Y-up) renders this natively; the physics
  // space is Y-up too (width=X, height=Y, depth=Z) so the remap is now near-identity.
  const glbW = sceneMaxX - sceneMinX; // table width in GLB units (X)
  const glbD = sceneMaxZ - sceneMinZ; // table depth in GLB units (Z axis)
  const scaleX = opts.targetWidth / glbW;
  const scaleZ = opts.targetDepth / glbD; // used for GLB Z → physics Z
  const scaleY = (scaleX + scaleZ) / 2; // used for GLB Y → physics Y (height)

  const centerX = (sceneMinX + sceneMaxX) * 0.5 * scaleX;
  const centerZ = (sceneMinZ + sceneMaxZ) * 0.5 * scaleZ; // depth center from GLB Z range
  const baseOffsetY = -sceneMinY * scaleY; // align floor elevation (GLB Y) to physics Y = 0

  // Transform one GLB vertex to physics space.
  const toPhysics = (
    gx: number,
    gy: number,
    gz: number,
  ): [number, number, number] => [
    gx * scaleX - centerX,
    gy * scaleY + baseOffsetY, // GLB Y → physics Y (elevation)
    gz * scaleZ - centerZ, // GLB Z → physics Z (depth). No mirror: keeps triangle
    // winding (floor normals stay +Y) and puts the drain end at +Z.
  ];

  const extractMesh = (
    matchNames: string | readonly string[],
    triangleFilter?: (
      a: [number, number, number],
      b: [number, number, number],
      c: [number, number, number],
    ) => boolean,
    vertexTransform?: (v: [number, number, number]) => [number, number, number],
  ): MeshGeometry => {
    const patterns = Array.isArray(matchNames) ? matchNames : [matchNames];
    const verts: number[] = [];
    const idx: number[] = [];
    let vertOffset = 0;
    for (const mesh of root.listMeshes()) {
      const name = mesh.getName() ?? '';
      if (!patterns.some((p) => name.includes(p))) continue;
      for (const prim of mesh.listPrimitives()) {
        const pos = prim.getAttribute('POSITION');
        if (!pos) continue;
        const arr = pos.getArray();
        if (!arr) continue;
        const count = pos.getCount();

        const tVerts: [number, number, number][] = [];
        for (let i = 0; i < count; i++) {
          const p = toPhysics(
            arr[i * 3] as number,
            arr[i * 3 + 1] as number,
            arr[i * 3 + 2] as number,
          );
          tVerts.push(vertexTransform ? vertexTransform(p) : p);
        }

        const indices = prim.getIndices();
        const ia = indices?.getArray();
        const triCount = ia ? ia.length / 3 : count / 3;
        const kept = new Set<number>();
        const keepTri: number[] = [];
        for (let t = 0; t < triCount; t++) {
          const i0 = ia ? (ia[t * 3] as number) : t * 3;
          const i1 = ia ? (ia[t * 3 + 1] as number) : t * 3 + 1;
          const i2 = ia ? (ia[t * 3 + 2] as number) : t * 3 + 2;
          const a = tVerts[i0]!;
          const b = tVerts[i1]!;
          const c = tVerts[i2]!;
          if (triangleFilter && !triangleFilter(a, b, c)) continue;
          keepTri.push(i0, i1, i2);
          kept.add(i0);
          kept.add(i1);
          kept.add(i2);
        }
        const remap = new Map<number, number>();
        for (const oldIdx of kept) {
          const newIdx = vertOffset + remap.size;
          remap.set(oldIdx, newIdx);
          const v = tVerts[oldIdx]!;
          verts.push(v[0], v[1], v[2]);
        }
        for (const oldIdx of keepTri) idx.push(remap.get(oldIdx)!);
        vertOffset += remap.size;
      }
    }
    if (verts.length === 0) {
      throw new Error(`Mesh '${patterns.join(', ')}' not found in GLB`);
    }
    return {
      vertices: new Float32Array(verts),
      indices: new Uint32Array(idx),
    };
  };

  function normal(
    a: [number, number, number],
    b: [number, number, number],
    c: [number, number, number],
  ): [number, number, number] | null {
    const e1x = b[0] - a[0],
      e1y = b[1] - a[1],
      e1z = b[2] - a[2];
    const e2x = c[0] - a[0],
      e2y = c[1] - a[1],
      e2z = c[2] - a[2];
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;
    const nl = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (nl === 0) return null;
    return [nx / nl, ny / nl, nz / nl];
  }

  // Sol: keep any face that points "mostly up" (physics Y-up normal > 0.3).
  // 0.3 ≈ slopes up to ~73° from horizontal — covers tilted playfield ramps and
  // soft transitions that 0.7 dropped, which left holes the ball fell through.
  const keepSolTri = (
    a: [number, number, number],
    b: [number, number, number],
    c: [number, number, number],
  ): boolean => {
    const n = normal(a, b, c);
    if (!n) return false;
    return n[1] > 0.3;
  };

  // Plunger lane exclusion zone — a triangle is dropped only when its CENTROID lies
  // inside the X band AND all three vertices are strictly inside it. This keeps walls
  // whose footprint just barely crosses the separator line (col_wall_main_outer's
  // bottom edge, col_wall_apron's curve, etc.) instead of stripping them entirely.
  // The vertex-based "ANY vertex inside" check was poking holes through every wall
  // that touched the corridor boundary.
  const LANE_X_MIN = 3.3;
  const LANE_X_MAX = 4.55;
  const inLane = (
    a: [number, number, number],
    b: [number, number, number],
    c: [number, number, number],
  ): boolean => {
    const cx = (a[0] + b[0] + c[0]) / 3;
    if (cx <= LANE_X_MIN || cx >= LANE_X_MAX) return false;
    return (
      a[0] > LANE_X_MIN && a[0] < LANE_X_MAX &&
      b[0] > LANE_X_MIN && b[0] < LANE_X_MAX &&
      c[0] > LANE_X_MIN && c[0] < LANE_X_MAX
    );
  };

  // Murs: keep any face that's not strictly horizontal (|physics Y normal| < 0.85).
  // 0.85 keeps everything except quasi-flat floor/ceiling tops, including curved wall
  // sections, slingshot ramps, and dome edges. Anything stricter (e.g. 0.5 / 0.7) was
  // poking gaps in slanted wall sections that the ball squeezed through.
  const keepMursTri = (
    a: [number, number, number],
    b: [number, number, number],
    c: [number, number, number],
  ): boolean => {
    if (inLane(a, b, c)) return false;
    const n = normal(a, b, c);
    if (!n) return false;
    return Math.abs(n[1]) <= 0.85;
  };

  // Wall meshes — vertical faces become physical collision surfaces (filtered by keepMursTri).
  // Patterns are matched as substrings against mesh names in the GLB.
  // Adding a `col_wall_*` or `col_ref_*` family in Blender is enough — register here once
  // so the loader auto-collects every mesh whose name contains the substring.
  // Conservative wall list: only meshes we KNOW form clean vertical walls outside the lane zone.
  // col_ref_flipper / col_ref_plunger / col_wall_frame are extracted separately via frameWalls
  // (no inLane filter) because their geometry sits inside the lane zone (X≈3–4.5).
  const WALL_MESHES = [
    // col_wall_frame_* extracted separately (frameWalls below) without the inLane filter —
    // col_wall_frame_black sits inside the lane zone (X≈3–4.5) so every triangle would be
    // stripped by the inLane check here.
    // col_wall_main_outer moved to CLIPPED_MESHES — its right side (X=[3.3,4.16]) is inside
    // the inLane zone, so the vertex-based check would strip the entire right wall portion.
    // The X-clip extraction below preserves it clipped to X=3.3 instead.
    // col_wall_shooter omitted — it blocks the central passage the ball must travel through.
    'col_wall_panel',
    'col_wall_left_fill',
    'col_wall_slingshots',
    'col_wall_flipper',       // col_wall_flipper_* — wall pieces around the flippers
    // col_wall_plunger_lane intentionally omitted — addLaneSeparator() builds a clean box wall.
    // col_wall_apron is in ALL_FACE_MESHES (its slanted faces would otherwise create
    // sharp launchpads under keepMursTri that catapult the ball into the ceiling).
    'col_bumper_mini',
    'col_bumper_targets',     // col_bumper_targets + col_bumper_targets_tiny + col_bumper_targets_group
    'col_ref_deco',           // col_ref_deco_*
    'col_ref_wall',           // col_ref_wall_*
    // col_wall_apron extracted separately (APRON_MESHES) — its bottom edge floats above
    // the floor (apron_2 sits at Y=0.31), letting the ball roll UNDER it. The dedicated
    // extraction drops the bottom band to the floor so the wall actually blocks the ball.
  ] as const;

  // col_wall_main_outer + col_wall_apron extraction handled below as raw trimeshes
  // (no clipping, no filter) — the corridor stays passable thanks to the lane
  // separator box wall and the outer boundary box wall.

  // Meshes extracted with ALL triangles (no normal filter) — ramps whose sloped
  // surfaces need to be walked through.
  // Apron meshes are intentionally NOT loaded — their tops support the ball and
  // trap it above the floor. The boundary box walls already close the drain area.
  const ALL_FACE_MESHES = [
    'col_ramp_main',
  ] as const;

  // Extract all-face meshes (ramps + slanted apron walls) — full geometry, no filter.
  let rampe: MeshGeometry | null = null;
  try {
    rampe = extractMesh(ALL_FACE_MESHES);
  } catch {
    // None of the all-face meshes present in this GLB — not an error.
  }

  // Frame / plunger / flipper ref meshes — extracted WITHOUT the inLane filter because
  // these meshes sit inside the lane zone (X≈3–4.5) and every triangle would otherwise
  // be stripped by the inLane check in keepMursTri.
  // keepMursTri_noLane still removes near-horizontal faces (tops/bottoms) so they don't
  // act as launch ramps or trap the ball against the ceiling.
  const keepMursTri_noLane = (
    a: [number, number, number],
    b: [number, number, number],
    c: [number, number, number],
  ): boolean => {
    const n = normal(a, b, c);
    if (!n) return false;
    return Math.abs(n[1]) <= 0.85;
  };
  const FRAME_WALL_MESHES = [
    'col_wall_frame',    // col_wall_frame_black + col_wall_frame_003..009
    'col_ref_plunger',   // col_ref_plunger_003/006/007/008/009 — plunger lane guide rails
    'col_ref_flipper',   // col_ref_flipper_007/030 + others — walls around the flipper area
  ] as const;
  let frameWalls: MeshGeometry | null = null;
  try {
    frameWalls = extractMesh(FRAME_WALL_MESHES, keepMursTri_noLane);
  } catch {
    // None of the frame/ref meshes present in this GLB — not an error.
  }

  // Base floor meshes (col_floor_*) — used for both the floor trimesh AND the
  // addInclinedFloor slope calculation. Keeping these separate from col_ref_floor_*
  // prevents reference meshes from skewing the slope (which caused the ball to spawn
  // inside the inclined box when the ref mesh increased max-Y).
  const floorMeshNames = root
    .listMeshes()
    .map((m) => m.getName() ?? '')
    .filter((n) => n.startsWith('col_floor_') && !n.includes('base'));
  if (floorMeshNames.length === 0) {
    throw new Error('No col_floor_* meshes found in GLB');
  }

  // Reference floor meshes (col_ref_floor_*) — extracted separately and added as a
  // standalone trimesh collider so the exact visual floor surface has physics.
  // These are intentionally excluded from the slope computation above.
  const refFloorMeshNames = root
    .listMeshes()
    .map((m) => m.getName() ?? '')
    .filter((n) => n.startsWith('col_ref_floor_') && !n.includes('base'));

  // --- Derive positions from named GLB nodes ---
  function nodeBbox(
    nodeName: string,
  ): { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number } | null {
    const node = root.listNodes().find((n) => n.getName() === nodeName);
    const mesh = node?.getMesh();
    if (!mesh) return null;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      if (!pos) continue;
      const arr = pos.getArray();
      if (!arr) continue;
      for (let i = 0; i < pos.getCount(); i++) {
        const [px, py, pz] = toPhysics(arr[i * 3] as number, arr[i * 3 + 1] as number, arr[i * 3 + 2] as number);
        if (px < minX) minX = px; if (px > maxX) maxX = px;
        if (py < minY) minY = py; if (py > maxY) maxY = py;
        if (pz < minZ) minZ = pz; if (pz > maxZ) maxZ = pz;
      }
    }
    if (!isFinite(minX)) return null;
    return { minX, maxX, minY, maxY, minZ, maxZ };
  }

  const bbFL = nodeBbox('flipper_left');
  const bbFR = nodeBbox('flipper_right');
  const bbLane = nodeBbox('col_wall_plunger_lane');

  if (!bbFL || !bbFR) throw new Error('flipper_left / flipper_right nodes missing from GLB');

  // Left flipper: pivot at min X (wall-attachment edge), right flipper at max X.
  const flipperLeft: FlipperPivot = {
    x: bbFL.minX,
    y: bbFL.minY,
    z: (bbFL.minZ + bbFL.maxZ) / 2,
    length: bbFL.maxX - bbFL.minX,
  };
  const flipperRight: FlipperPivot = {
    x: bbFR.maxX,
    y: bbFR.minY,
    z: (bbFR.minZ + bbFR.maxZ) / 2,
    length: bbFR.maxX - bbFR.minX,
  };

  // Lane separator: inner edge of the plunger lane wall (edge closest to main field).
  const halfW = opts.targetWidth / 2;
  const laneSeparatorX = bbLane
    ? Math.abs(bbLane.maxX) < Math.abs(bbLane.minX)
      ? bbLane.maxX   // lane on left → inner edge is positive (toward centre)
      : bbLane.minX   // lane on right → inner edge is negative (toward centre)
    : halfW - 1;      // fallback: 1 unit from right wall
  const laneSpawnX = bbLane ? (bbLane.minX + bbLane.maxX) / 2 : halfW - 0.5;

  // Bumpers — auto-collected from every mesh whose name starts with `col_bumper_marker_`.
  // Each marker is a small mesh in Blender whose bounding box encodes:
  //   - centre (X, Z) in physics units → bumper position
  //   - half-width on X/Z axes        → bumper cylinder radius
  // To add/move a bumper, edit the marker mesh in Blender — no code change needed.
  const bumpers: BumperPosition[] = [];
  for (const mesh of root.listMeshes()) {
    const name = mesh.getName() ?? '';
    if (!name.startsWith('col_bumper_marker_')) continue;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      if (!pos) continue;
      const arr = pos.getArray();
      if (!arr) continue;
      for (let i = 0; i < pos.getCount(); i++) {
        const [px, , pz] = toPhysics(
          arr[i * 3] as number,
          arr[i * 3 + 1] as number,
          arr[i * 3 + 2] as number,
        );
        if (px < minX) minX = px; if (px > maxX) maxX = px;
        if (pz < minZ) minZ = pz; if (pz > maxZ) maxZ = pz;
      }
    }
    if (!isFinite(minX)) continue;
    bumpers.push({
      id: name.replace('col_bumper_marker_', ''),
      x: (minX + maxX) / 2,
      z: (minZ + maxZ) / 2,
      radius: Math.max((maxX - minX) / 2, (maxZ - minZ) / 2),
    });
  }

  // col_wall_main_outer + col_wall_apron_* extracted as raw trimeshes with NO filter
  // and no transform. The previous clipping + filtering was leaving gaps that let
  // the ball squeeze through; keeping the full mesh closes them.
  // The corridor itself is still kept clear by the lane separator box wall + the
  // outer boundary box wall, so duplicating mesh geometry there is harmless.
  let mainOuterRaw: MeshGeometry | null = null;
  try {
    mainOuterRaw = extractMesh(['col_wall_main_outer']);
  } catch {
    // Not present — fine.
  }

  let apronRaw: MeshGeometry | null = null;
  try {
    apronRaw = extractMesh(['col_wall_apron']);
  } catch {
    // Not present — fine.
  }

  // Merge both into a single trimesh so the existing PlayfieldGeometry shape stays valid.
  const aprons: MeshGeometry | null = mergeTrimeshes(mainOuterRaw, apronRaw);

  // col_ref_floor_* extracted with NO normal filter — using the full mesh as a trimesh
  // collider. keepSolTri was rejecting slanted floor sections whose normals were too
  // shallow (e.g. cones, curved transitions in col_ref_floor_main), creating holes the
  // ball fell through. Trimesh collision in Rapier already handles back-face rejection,
  // so keeping every triangle is safe and closes the floor surface.
  let refFloor: MeshGeometry | null = null;
  if (refFloorMeshNames.length > 0) {
    try {
      refFloor = extractMesh(refFloorMeshNames);
    } catch {
      // No ref-floor meshes present — not an error.
    }
  }

  return {
    sol: extractMesh(floorMeshNames, keepSolTri),
    refFloor,
    murs: extractMesh(WALL_MESHES, keepMursTri),
    aprons,
    rampe,
    frameWalls,
    derived: { flipperLeft, flipperRight, laneSeparatorX, laneSpawnX, bumpers },
  };
}
