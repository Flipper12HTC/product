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
  id: string; // derived from the mesh name suffix
  x: number; // physics X
  z: number; // physics Z
  radius: number; // cylinder radius in physics units
}

export interface DerivedPositions {
  flipperLeft: FlipperPivot;
  flipperRight: FlipperPivot;
  laneSeparatorX: number; // inner edge of plunger lane wall (separator between lane & field)
  laneSpawnX: number; // centre X of the plunger lane
  bumpers: BumperPosition[]; // procedural bumpers — auto-collected from col_bumper_marker_* meshes
}

export interface PlayfieldGeometry {
  floor: MeshGeometry; // col_floor_* only — used for addInclinedFloor slope
  refFloor: MeshGeometry | null; // col_ref_floor_* — separate trimesh for exact floor collision
  walls: MeshGeometry;
  aprons: MeshGeometry | null;
  ramp: MeshGeometry | null;
  frameWalls: MeshGeometry | null; // col_wall_frame_* — extracted without the inLane filter
  panel: MeshGeometry | null; // col_wall_panel — circular loop, low restitution so ball follows the curve
  guides: Float32Array[]; // solid convex hulls (point clouds) for the thin guide/slingshot meshes
  derived: DerivedPositions;
}

export interface LoadOptions {
  targetWidth: number;
  targetDepth: number;
}

/**
 * Load playfield meshes from FlipperBase.glb.
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
  const toPhysics = (gx: number, gy: number, gz: number): [number, number, number] => [
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
    excludeNames?: readonly string[],
  ): MeshGeometry => {
    const patterns = Array.isArray(matchNames) ? matchNames : [matchNames];
    const verts: number[] = [];
    const idx: number[] = [];
    let vertOffset = 0;
    for (const mesh of root.listMeshes()) {
      const name = mesh.getName() ?? '';
      if (!patterns.some((p) => name.includes(p))) continue;
      if (excludeNames?.some((e) => name.includes(e))) continue;
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
          tVerts.push(p);
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
      a[0] > LANE_X_MIN &&
      a[0] < LANE_X_MAX &&
      b[0] > LANE_X_MIN &&
      b[0] < LANE_X_MAX &&
      c[0] > LANE_X_MIN &&
      c[0] < LANE_X_MAX
    );
  };

  // Walls: keep any face that's not strictly horizontal (|physics Y normal| < 0.85).
  // 0.85 keeps everything except quasi-flat floor/ceiling tops, including curved wall
  // sections, slingshot ramps, and dome edges. Anything stricter (e.g. 0.5 / 0.7) was
  // poking gaps in slanted wall sections that the ball squeezed through.
  const keepWallTri = (
    a: [number, number, number],
    b: [number, number, number],
    c: [number, number, number],
  ): boolean => {
    if (inLane(a, b, c)) return false;
    const n = normal(a, b, c);
    if (!n) return false;
    return Math.abs(n[1]) <= 0.85;
  };

  // Wall meshes — vertical faces become physical collision surfaces (filtered by keepWallTri).
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
    // col_wall_panel extracted separately (panel below) — low restitution so ball follows the curve.
    'col_wall_left_fill',
    'col_wall_slingshots',
    'col_wall_flipper', // col_wall_flipper_* — wall pieces around the flippers
    'col_wall_center', // col_wall_center_mesh — central wall between the flippers (physX≈[-1.6,1.6])
    'col_wall_dome', // col_wall_dome_left/right — merged panel+shooter dome walls
    // col_wall_plunger_lane intentionally omitted — addLaneSeparator() builds a clean box wall.
    // col_wall_apron is in ALL_FACE_MESHES (its slanted faces would otherwise create
    // sharp launchpads under keepWallTri that catapult the ball into the ceiling).
    'col_bumper_mini',
    'col_bumper_targets', // col_bumper_targets + col_bumper_targets_tiny + col_bumper_targets_group
    'col_ref_deco', // col_ref_deco_*
    'col_ref_wall', // col_ref_wall_*
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
  const ALL_FACE_MESHES = ['col_ramp_main'] as const;

  // col_ramp_main end-cap filter: remove strongly Z-facing faces (|nZ| ≥ 0.80).
  // The ramp is a hollow tube; its drain-side entry has faces with nZ≈+0.96 (drain-facing)
  // that block the ball from entering the ramp channel in one-sided Rapier trimesh mode.
  // Removing end caps (|nZ| ≥ 0.80) keeps the floor (nY≈0.97, |nZ|=0.26) and side walls
  // (nX≈±1.0) intact while opening both ends of the tube so the ball can enter and exit.
  const keepRampTri = (
    a: [number, number, number],
    b: [number, number, number],
    c: [number, number, number],
  ): boolean => {
    const n = normal(a, b, c);
    if (!n) return false;
    return Math.abs(n[2]) < 0.8;
  };

  let ramp: MeshGeometry | null = null;
  try {
    ramp = extractMesh(ALL_FACE_MESHES, keepRampTri);
  } catch {
    // None of the all-face meshes present in this GLB — not an error.
  }

  // Frame / plunger / flipper ref meshes — extracted WITHOUT the inLane filter because
  // these meshes sit inside the lane zone (X≈3–4.5) and every triangle would otherwise
  // be stripped by the inLane check in keepWallTri.
  // keepWallTriNoLane still removes near-horizontal faces (tops/bottoms) so they don't
  // act as launch ramps or trap the ball against the ceiling.
  const keepWallTriNoLane = (
    a: [number, number, number],
    b: [number, number, number],
    c: [number, number, number],
  ): boolean => {
    const n = normal(a, b, c);
    if (!n) return false;
    return Math.abs(n[1]) <= 0.85;
  };
  const FRAME_WALL_MESHES = [
    'col_wall_frame', // col_wall_frame_* — any remaining frame walls
    'col_wall_black.001',
    'col_wall_black.002',
    'col_wall_black.004',
    'col_wall_black.005',
    'col_wall_black.006',
    'col_ref_plunger', // col_ref_plunger_003/006/007/008/009 — plunger lane guide rails
    'col_ref_flipper', // col_ref_flipper_007/030 + others — walls around the flipper area
  ] as const;
  // Meshes excluded from the main FRAME_WALL_MESHES batch and handled individually below.
  // Right-side guide rail meshes — excluded from the trimesh batch, rebuilt as solid
  // convex hulls below; as one-sided quads they formed pockets and wedged the ball.
  //   _037: X[1.41,2.76] Z[5.19,6.19] nZ=-0.76 — field-facing plane of the inner guide
  //   _029: X[1.51,3.01] Z[5.46,6.32] nZ=+0.85 — drain-facing plane of the same guide
  //   _031: X[1.41,1.51] Z[6.10,6.32]          — connector at the flipper-side tip
  //   _027: X[1.93,2.94] Z[5.93,6.99] nZ=-0.76 — OUTER guide beside the right flipper,
  //         extruded quad hull (the right inlane channel runs between _027 and _029/_037)
  // Left guide walls (_003/_005/_007/_032/_035) and slingshot faces (_014, plunger
  // _003/_004/_006/_007/_009) are excluded here and rebuilt as SOLID convex hulls below —
  // as thin trimesh quads they wedged the ball in acute corners against the floor.
  const SPECIAL_MESHES = [
    'col_wall_black.003',
    'col_ref_flipper_003',
    'col_ref_flipper_005',
    'col_ref_flipper_007',
    'col_ref_flipper_014',
    'col_ref_flipper_027',
    'col_ref_flipper_029',
    'col_ref_flipper_031',
    'col_ref_flipper_032',
    'col_ref_flipper_035',
    'col_ref_flipper_037',
    // _001 is the ramp entry lip (X[-3.58,-2.82] Z[4.25,5.11], overhanging face
    // n(0,-0.26,0.97)) — balls slammed into it instead of entering the ramp mouth.
    // Replaced by the programmatic entry wedge in rapier-world (addRampEntryWedge).
    'col_ref_plunger_001',
    'col_ref_plunger_003',
    'col_ref_plunger_004',
    'col_ref_plunger_006',
    'col_ref_plunger_007',
    'col_ref_plunger_009',
  ] as const;

  let frameWalls: MeshGeometry | null = null;
  try {
    frameWalls = extractMesh(FRAME_WALL_MESHES, keepWallTriNoLane, SPECIAL_MESHES);
  } catch {
    // None of the frame/ref meshes present in this GLB — not an error.
  }

  // col_wall_black.003 — strip drain-facing pocket faces (nZ≈0.94) with |nZ|<0.6 filter.
  const keepNoZPocket = (
    a: [number, number, number],
    b: [number, number, number],
    c: [number, number, number],
  ): boolean => {
    const n = normal(a, b, c);
    if (!n) return false;
    return Math.abs(n[1]) <= 0.85 && Math.abs(n[2]) < 0.6;
  };
  try {
    frameWalls = mergeTrimeshes(frameWalls, extractMesh(['col_wall_black.003'], keepNoZPocket));
  } catch {
    /* not present */
  }

  // --- Solid convex guide hulls ---
  // The thin guide/slingshot quads kept trapping the ball no matter how they were loaded:
  // one-sided planes with opposing normals form pockets, and double-sided zero-thickness
  // quads wedge the ball in acute corners against the floor (repro: ball at rest on the
  // right slingshot bottom corner (1.40, 0.93, 5.31)). Each group is replaced by ONE solid
  // convex hull built from the raw GLB vertices — a convex volume has no thin face to
  // wedge against and CCD handles it robustly.
  const gatherVerts = (
    patterns: readonly string[],
    filter?: (v: [number, number, number]) => boolean,
  ): [number, number, number][] => {
    const out: [number, number, number][] = [];
    for (const mesh of root.listMeshes()) {
      const name = mesh.getName() ?? '';
      if (!patterns.some((p) => name.includes(p))) continue;
      for (const prim of mesh.listPrimitives()) {
        const pos = prim.getAttribute('POSITION');
        const arr = pos?.getArray();
        if (!pos || !arr) continue;
        for (let i = 0; i < pos.getCount(); i++) {
          const v = toPhysics(
            arr[i * 3] as number,
            arr[i * 3 + 1] as number,
            arr[i * 3 + 2] as number,
          );
          if (!filter || filter(v)) out.push(v);
        }
      }
    }
    return out;
  };
  const flatten = (pts: [number, number, number][]): Float32Array => {
    const f = new Float32Array(pts.length * 3);
    pts.forEach((p, i) => f.set(p, i * 3));
    return f;
  };
  // The GLB guide rails stand only ~0.15–0.27 above the local floor — barely a ball
  // radius, so fast balls hopped straight over them. Real tables run a wire guide on
  // top; raiseTop emulates it by duplicating every vertex 0.3 higher before hulling.
  const raiseTop = (pts: [number, number, number][]): [number, number, number][] => [
    ...pts,
    ...pts.map((v): [number, number, number] => [v[0], v[1] + 0.3, v[2]]),
  ];
  const guides: Float32Array[] = [];
  // Left inlane guide wall: _003 (outlane-facing plane) + _007 (field-facing plane) are the
  // two faces of the same wall, 0.26 apart — with the end strips _005/_035 the hull is a
  // naturally solid slab, no extrusion needed.
  const wallA = gatherVerts([
    'col_ref_flipper_003',
    'col_ref_flipper_005',
    'col_ref_flipper_007',
    'col_ref_flipper_035',
  ]);
  if (wallA.length >= 4) guides.push(flatten(raiseTop(wallA)));
  // Right inlane guide wall (mirror of wall A): _029 (drain-facing plane) + _037
  // (field-facing plane) overlap in Z with opposite normals — two faces of the same
  // wall — and _031 is the small connector at the flipper-side tip. As one-sided
  // trimeshes they had no reliable physics (and doubleSided sealed a trap), so they
  // were excluded entirely; the solid hull restores collision on both sides.
  const wallR = gatherVerts(['col_ref_flipper_029', 'col_ref_flipper_031', 'col_ref_flipper_037']);
  if (wallR.length >= 4) guides.push(flatten(raiseTop(wallR)));
  // Single coplanar quads — extrude ±0.06 along the face normal so the hull has volume.
  //   _032: left outlane outer guide.
  //   _027: right inlane outer guide, the wall directly beside the right flipper
  //         (X[1.93,2.94] Z[5.93,6.99]) — without physics the ball cut straight
  //         through it and drained behind the flipper.
  for (const quad of ['col_ref_flipper_032', 'col_ref_flipper_027'] as const) {
    const pts = gatherVerts([quad]);
    if (pts.length < 3) continue;
    const n = normal(pts[0]!, pts[1]!, pts[2]!) ?? [1, 0, 0];
    const ext: [number, number, number][] = [];
    for (const v of pts) {
      ext.push([v[0] + n[0] * 0.06, v[1] + n[1] * 0.06, v[2] + n[2] * 0.06]);
      ext.push([v[0] - n[0] * 0.06, v[1] - n[1] * 0.06, v[2] - n[2] * 0.06]);
    }
    guides.push(flatten(raiseTop(ext)));
  }
  // Slingshots: plunger _003 (inner), _004 (top), _006 (top edge), _007 (outer), _009
  // (bottom) + flipper _014 (tip caps) hold faces of BOTH slingshot bodies (mirrored
  // halves live in the same meshes). Split at X=0 → one solid hull per side.
  const SLINGSHOT_MESHES = [
    'col_ref_plunger_003',
    'col_ref_plunger_004',
    'col_ref_plunger_006',
    'col_ref_plunger_007',
    'col_ref_plunger_009',
    'col_ref_flipper_014',
  ] as const;
  // raiseTop here too: with the GLB height (~0.3–0.55 above the floor) a 16 m/s ball
  // climbed onto the slingshot body and dropped over the inlane rail behind it. Real
  // slingshots are solid up to the plastics above.
  const slingR = gatherVerts(SLINGSHOT_MESHES, (v) => v[0] > 0);
  const slingL = gatherVerts(SLINGSHOT_MESHES, (v) => v[0] < 0);
  if (slingR.length >= 4) guides.push(flatten(raiseTop(slingR)));
  if (slingL.length >= 4) guides.push(flatten(raiseTop(slingL)));
  // col_wall_frame_black covers too many heterogeneous Blender objects to filter cleanly
  // without per-mesh renaming. The vertical faces are already included via FRAME_WALL_MESHES
  // (keepWallTriNoLane). A separate extraction with a looser Y filter caused pockets that
  // trapped the ball. Removed until meshes are renamed in Blender for finer control.

  // Base floor meshes (col_floor_*) — used for both the floor trimesh AND the
  // addInclinedFloor slope calculation. Keeping these separate from col_ref_floor_*
  // prevents reference meshes from skewing the slope (which caused the ball to spawn
  // inside the inclined box when the ref mesh increased max-Y).
  const floorMeshNames = root
    .listMeshes()
    .map((m) => m.getName() ?? '')
    .filter((n) => n.startsWith('col_floor_') && !n.includes('base') && !n.includes('detail'));
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
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity,
      minZ = Infinity,
      maxZ = -Infinity;
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      if (!pos) continue;
      const arr = pos.getArray();
      if (!arr) continue;
      for (let i = 0; i < pos.getCount(); i++) {
        const [px, py, pz] = toPhysics(
          arr[i * 3] as number,
          arr[i * 3 + 1] as number,
          arr[i * 3 + 2] as number,
        );
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;
        if (pz < minZ) minZ = pz;
        if (pz > maxZ) maxZ = pz;
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
      ? bbLane.maxX // lane on left → inner edge is positive (toward centre)
      : bbLane.minX // lane on right → inner edge is negative (toward centre)
    : halfW - 1; // fallback: 1 unit from right wall
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
    let minX = Infinity,
      maxX = -Infinity,
      minZ = Infinity,
      maxZ = -Infinity;
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
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (pz < minZ) minZ = pz;
        if (pz > maxZ) maxZ = pz;
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

  // col_wall_panel — the circular loop on the right side.
  // Extracted separately with keepWallTri so only vertical faces get collision,
  // then loaded with very low restitution in rapier-world so the ball follows the
  // curve instead of bouncing back into the lane on hard shots.
  let panel: MeshGeometry | null = null;
  try {
    panel = extractMesh(['col_wall_panel'], keepWallTri);
  } catch {
    // Not present — fine.
  }

  return {
    floor: extractMesh(floorMeshNames, keepSolTri),
    refFloor,
    walls: extractMesh(WALL_MESHES, keepWallTri),
    aprons,
    ramp,
    frameWalls,
    panel,
    guides,
    derived: { flipperLeft, flipperRight, laneSeparatorX, laneSpawnX, bumpers },
  };
}
