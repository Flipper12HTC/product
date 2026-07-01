import { NodeIO } from '@gltf-transform/core';

const path = process.argv[2];
const io = new NodeIO();
const doc = await io.read(path);
const root = doc.getRoot();

const TABLE_W = 9, TABLE_D = 16;
let sMin = { x: Infinity, y: Infinity, z: Infinity };
let sMax = { x: -Infinity, y: -Infinity, z: -Infinity };
for (const node of root.listNodes().filter((n) => n.getMesh())) {
  for (const prim of node.getMesh().listPrimitives()) {
    const pos = prim.getAttribute('POSITION');
    const arr = pos.getArray();
    const count = pos.getCount();
    for (let i = 0; i < count; i++) {
      const x = arr[i * 3], y = arr[i * 3 + 1], z = arr[i * 3 + 2];
      if (x < sMin.x) sMin.x = x; if (y < sMin.y) sMin.y = y; if (z < sMin.z) sMin.z = z;
      if (x > sMax.x) sMax.x = x; if (y > sMax.y) sMax.y = y; if (z > sMax.z) sMax.z = z;
    }
  }
}
const sW = sMax.x - sMin.x, sD = sMax.z - sMin.z;
const sx = TABLE_W / sW, sz = TABLE_D / sD, sy = (sx + sz) / 2;
const cx = (sMin.x + sMax.x) * 0.5 * sx;
const cz = (sMin.z + sMax.z) * 0.5 * sz;
const yOff = -sMin.y * sy;
const tx = (x) => x * sx - cx, ty = (y) => y * sy + yOff, tz = (z) => z * sz - cz;

function findMesh(name) {
  for (const m of root.listMeshes()) if ((m.getName() || '').includes(name)) return m;
  return null;
}

function getTris(mesh) {
  const tris = [];
  for (const prim of mesh.listPrimitives()) {
    const pos = prim.getAttribute('POSITION').getArray();
    const idx = prim.getIndices().getArray();
    for (let i = 0; i < idx.length; i += 3) {
      const a = idx[i], b = idx[i + 1], c = idx[i + 2];
      tris.push([
        [tx(pos[a*3]), ty(pos[a*3+1]), tz(pos[a*3+2])],
        [tx(pos[b*3]), ty(pos[b*3+1]), tz(pos[b*3+2])],
        [tx(pos[c*3]), ty(pos[c*3+1]), tz(pos[c*3+2])],
      ]);
    }
  }
  return tris;
}

const murs = getTris(findMesh('Murs'));
console.log(`Murs tris: ${murs.length}`);

// Look at murs triangles where any vertex is in launch lane area (x > 3.5).
const laneTris = murs.filter((t) => t.some(([x]) => x > 3.5));
console.log(`Lane tris: ${laneTris.length}`);

// Get z range and y range of those tris
let yMin = Infinity, yMax = -Infinity, zMin = Infinity, zMax = -Infinity, xMin=Infinity, xMax=-Infinity;
for (const t of laneTris) for (const [x, y, z] of t) {
  if (y < yMin) yMin = y; if (y > yMax) yMax = y;
  if (z < zMin) zMin = z; if (z > zMax) zMax = z;
  if (x < xMin) xMin = x; if (x > xMax) xMax = x;
}
console.log(`Lane bbox: x[${xMin.toFixed(2)}, ${xMax.toFixed(2)}] y[${yMin.toFixed(2)}, ${yMax.toFixed(2)}] z[${zMin.toFixed(2)}, ${zMax.toFixed(2)}]`);

// Slice through y=0.3 (ball center height) at x=4.1, sweep z, check if a triangle intersects.
function rayHits(px, py, pz, dx, dy, dz, tris, maxDist) {
  let hit = null;
  for (const t of tris) {
    const [a, b, c] = t;
    const e1 = [b[0]-a[0], b[1]-a[1], b[2]-a[2]];
    const e2 = [c[0]-a[0], c[1]-a[1], c[2]-a[2]];
    const h = [dy*e2[2]-dz*e2[1], dz*e2[0]-dx*e2[2], dx*e2[1]-dy*e2[0]];
    const aDotH = e1[0]*h[0]+e1[1]*h[1]+e1[2]*h[2];
    if (Math.abs(aDotH) < 1e-8) continue;
    const f = 1 / aDotH;
    const s = [px-a[0], py-a[1], pz-a[2]];
    const u = f * (s[0]*h[0]+s[1]*h[1]+s[2]*h[2]);
    if (u < 0 || u > 1) continue;
    const q = [s[1]*e1[2]-s[2]*e1[1], s[2]*e1[0]-s[0]*e1[2], s[0]*e1[1]-s[1]*e1[0]];
    const v = f * (dx*q[0]+dy*q[1]+dz*q[2]);
    if (v < 0 || u + v > 1) continue;
    const tHit = f * (e2[0]*q[0]+e2[1]*q[1]+e2[2]*q[2]);
    if (tHit > 0.001 && tHit < maxDist && (!hit || tHit < hit)) hit = tHit;
  }
  return hit;
}

console.log('\nRay from ball spawn (4.1, 0.3, 7.65) toward -z, walls hit at:');
for (const xRay of [3.6, 3.8, 4.0, 4.1, 4.2, 4.3, 4.4]) {
  const hit = rayHits(xRay, 0.3, 7.65, 0, 0, -1, murs, 20);
  console.log(`x=${xRay}: hit at distance ${hit === null ? 'none' : hit.toFixed(3)} (wall z=${hit === null ? 'n/a' : (7.65 - hit).toFixed(3)})`);
}

console.log('\nRay from (x, 0.5, 7.65) toward -z, higher y:');
for (const xRay of [3.8, 4.0, 4.1, 4.2, 4.3]) {
  const hit = rayHits(xRay, 0.5, 7.65, 0, 0, -1, murs, 20);
  console.log(`x=${xRay}: hit at z=${hit === null ? 'none' : (7.65 - hit).toFixed(3)}`);
}

console.log('\nRay from (x, 1.0, 7.65) toward -z, very high:');
for (const xRay of [3.8, 4.0, 4.1, 4.2, 4.3]) {
  const hit = rayHits(xRay, 1.0, 7.65, 0, 0, -1, murs, 20);
  console.log(`x=${xRay}: hit at z=${hit === null ? 'none' : (7.65 - hit).toFixed(3)}`);
}

console.log('\n--- Plunger pocket analysis ---');
console.log('Ray from settled ball pos (4.0, 0.67, 7.77) in -z direction (hits = wall blocking launch):');
for (const yLev of [0.5, 0.6, 0.7, 0.8, 1.0]) {
  const hit = rayHits(4.0, yLev, 7.77, 0, 0, -1, murs, 20);
  console.log(`y=${yLev}: -z wall at z=${hit === null ? 'none' : (7.77 - hit).toFixed(3)}`);
}
console.log('\nRay from settled toward +z (hits = back of pocket):');
for (const yLev of [0.5, 0.6, 0.7, 0.8, 1.0]) {
  const hit = rayHits(4.0, yLev, 7.77, 0, 0, 1, murs, 20);
  console.log(`y=${yLev}: +z wall at z=${hit === null ? 'none' : (7.77 + hit).toFixed(3)}`);
}
console.log('\nRay from settled toward -x (hits = lane/main separator):');
for (const yLev of [0.5, 0.6, 0.7, 0.8, 1.0]) {
  const hit = rayHits(4.0, yLev, 7.77, -1, 0, 0, murs, 20);
  console.log(`y=${yLev}: -x wall at x=${hit === null ? 'none' : (4.0 - hit).toFixed(3)}`);
}

// Now check Sol elevation along the lane (vertical down ray to find Sol top y)
const sol = getTris(findMesh('Sol'));
console.log('\nSol elevation along launch lane (x=4.1, varying z) — top y per z:');
for (let z = 7.9; z >= -7.5; z -= 0.25) {
  // Cast ray down from y=3 to find Sol top.
  let topY = null;
  for (const t of sol) {
    // Find triangle's bbox contains x=4.1, z
    const xs = [t[0][0], t[1][0], t[2][0]];
    const zs = [t[0][2], t[1][2], t[2][2]];
    if (4.1 < Math.min(...xs) || 4.1 > Math.max(...xs)) continue;
    if (z < Math.min(...zs) || z > Math.max(...zs)) continue;
    // Interpolate y at (4.1, z) via barycentric
    const [a, b, c] = t;
    const d = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
    if (d === 0) continue;
    const u = ((b[2] - c[2]) * (4.1 - c[0]) + (c[0] - b[0]) * (z - c[2])) / d;
    const v = ((c[2] - a[2]) * (4.1 - c[0]) + (a[0] - c[0]) * (z - c[2])) / d;
    const w = 1 - u - v;
    if (u < 0 || v < 0 || w < 0) continue;
    const y = u * a[1] + v * b[1] + w * c[1];
    if (topY === null || y > topY) topY = y;
  }
  if (topY !== null) console.log(`z=${z.toFixed(2)}: Sol y=${topY.toFixed(3)}`);
  else console.log(`z=${z.toFixed(2)}: no Sol coverage`);
}
