import { NodeIO } from '@gltf-transform/core';

const path = process.argv[2];
const io = new NodeIO();
const doc = await io.read(path);
const root = doc.getRoot();

const TABLE_W = 9;
const TABLE_D = 16;

// scene scale (same as front)
let sceneMin = { x: Infinity, y: Infinity, z: Infinity };
let sceneMax = { x: -Infinity, y: -Infinity, z: -Infinity };
const meshNodes = root.listNodes().filter((n) => n.getMesh());
for (const node of meshNodes) {
  const mesh = node.getMesh();
  for (const prim of mesh.listPrimitives()) {
    const pos = prim.getAttribute('POSITION');
    const arr = pos.getArray();
    const count = pos.getCount();
    for (let i = 0; i < count; i++) {
      const x = arr[i * 3], y = arr[i * 3 + 1], z = arr[i * 3 + 2];
      if (x < sceneMin.x) sceneMin.x = x;
      if (y < sceneMin.y) sceneMin.y = y;
      if (z < sceneMin.z) sceneMin.z = z;
      if (x > sceneMax.x) sceneMax.x = x;
      if (y > sceneMax.y) sceneMax.y = y;
      if (z > sceneMax.z) sceneMax.z = z;
    }
  }
}
const sceneW = sceneMax.x - sceneMin.x;
const sceneD = sceneMax.z - sceneMin.z;
const sx = TABLE_W / sceneW;
const sz = TABLE_D / sceneD;
const sy = (sx + sz) / 2;
const centerX = (sceneMin.x * sx + sceneMax.x * sx) / 2;
const centerZ = (sceneMin.z * sz + sceneMax.z * sz) / 2;
const baseOffsetY = -sceneMin.y * sy;

function tx(x) { return x * sx - centerX; }
function ty(y) { return y * sy + baseOffsetY; }
function tz(z) { return z * sz - centerZ; }

function findMesh(name) {
  for (const m of root.listMeshes()) if (m.getName() === name || (m.getName() || '').includes(name)) return m;
  return null;
}

// Triangle-based hole detection: rasterize Sol triangles in XZ at given Y(top of sol),
// then scan a horizontal slice at z=zSlice for empty x ranges.
function getTris(mesh) {
  const tris = [];
  for (const prim of mesh.listPrimitives()) {
    const pos = prim.getAttribute('POSITION').getArray();
    const idx = prim.getIndices();
    if (idx) {
      const ia = idx.getArray();
      for (let i = 0; i < ia.length; i += 3) {
        const a = ia[i], b = ia[i + 1], c = ia[i + 2];
        tris.push([
          [pos[a*3], pos[a*3+1], pos[a*3+2]],
          [pos[b*3], pos[b*3+1], pos[b*3+2]],
          [pos[c*3], pos[c*3+1], pos[c*3+2]],
        ]);
      }
    }
  }
  return tris;
}

// Check if 2D point (x,z) is inside triangle (xz only).
function pointInTri2D(px, pz, t) {
  const [a, b, c] = t;
  const ax = a[0], az = a[2], bx = b[0], bz = b[2], cx = c[0], cz = c[2];
  const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
  if (d === 0) return false;
  const u = ((bz - cz) * (px - cx) + (cx - bx) * (pz - cz)) / d;
  const v = ((cz - az) * (px - cx) + (ax - cx) * (pz - cz)) / d;
  const w = 1 - u - v;
  return u >= 0 && v >= 0 && w >= 0;
}

const sol = findMesh('Sol');
if (!sol) {
  console.error('Sol mesh not found');
  process.exit(1);
}

const tris = getTris(sol);
console.log(`Sol triangles: ${tris.length}`);

// Rasterize on XZ grid in TABLE coords (post-transform).
// Sample every 0.1 unit.
const xMin = -TABLE_W / 2, xMax = TABLE_W / 2;
const zMin = -TABLE_D / 2, zMax = TABLE_D / 2;
const stepX = 0.1, stepZ = 0.1;
const nx = Math.floor((xMax - xMin) / stepX);
const nz = Math.floor((zMax - zMin) / stepZ);

// For each cell center, check if any triangle (in scaled coords) contains it.
function scaledTri(t) {
  return [
    [tx(t[0][0]), ty(t[0][1]), tz(t[0][2])],
    [tx(t[1][0]), ty(t[1][1]), tz(t[1][2])],
    [tx(t[2][0]), ty(t[2][1]), tz(t[2][2])],
  ];
}
const sTris = tris.map(scaledTri);

// Build per-row coverage to find holes near bottom (max z).
console.log('\n--- Sol XZ coverage (Z rows from -8 to +8) ---');
console.log('row z range | coverage X intervals (covered=#, empty=.)');
const rowsToCheck = [-7.5, -5, -2, 0, 2, 5, 6, 6.5, 7, 7.2, 7.4, 7.6, 7.7, 7.8];
for (const zRow of rowsToCheck) {
  let line = '';
  let coveredCells = 0;
  for (let i = 0; i < nx; i++) {
    const xc = xMin + (i + 0.5) * stepX;
    let inside = false;
    for (const t of sTris) {
      if (pointInTri2D(xc, zRow, t)) { inside = true; break; }
    }
    line += inside ? '#' : '.';
    if (inside) coveredCells++;
  }
  console.log(`z=${zRow.toFixed(2).padStart(6)} cov=${coveredCells.toString().padStart(3)}/${nx} ${line}`);
}

// Detect bottom drain: scan z near zMax, find x range of uncovered cells.
console.log('\n--- Bottom edge scan (z=6.5 .. 8.0 step 0.1) ---');
for (let zr = 6.5; zr <= 8.0; zr += 0.1) {
  let firstEmpty = null, lastEmpty = null;
  for (let i = 0; i < nx; i++) {
    const xc = xMin + (i + 0.5) * stepX;
    let inside = false;
    for (const t of sTris) {
      if (pointInTri2D(xc, zr, t)) { inside = true; break; }
    }
    if (!inside) {
      if (firstEmpty === null) firstEmpty = xc;
      lastEmpty = xc;
    }
  }
  if (firstEmpty !== null) {
    console.log(`z=${zr.toFixed(2)}: empty x in [${firstEmpty.toFixed(2)}, ${lastEmpty.toFixed(2)}]`);
  } else {
    console.log(`z=${zr.toFixed(2)}: fully covered`);
  }
}
