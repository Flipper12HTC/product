import { NodeIO } from '@gltf-transform/core';

const path = process.argv[2];
if (!path) {
  console.error('usage: node inspect-glb.mjs <file.glb>');
  process.exit(1);
}

const io = new NodeIO();
const doc = await io.read(path);
const root = doc.getRoot();

function bboxOfMesh(mesh) {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const prim of mesh.listPrimitives()) {
    const pos = prim.getAttribute('POSITION');
    if (!pos) continue;
    const arr = pos.getArray();
    const count = pos.getCount();
    for (let i = 0; i < count; i++) {
      const x = arr[i * 3];
      const y = arr[i * 3 + 1];
      const z = arr[i * 3 + 2];
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (z < minZ) minZ = z;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      if (z > maxZ) maxZ = z;
    }
  }
  return { min: { x: minX, y: minY, z: minZ }, max: { x: maxX, y: maxY, z: maxZ } };
}

function bboxOfMeshWorld(node, mesh) {
  const t = node.getWorldTranslation();
  const s = node.getWorldScale();
  const local = bboxOfMesh(mesh);
  return {
    min: { x: local.min.x * s[0] + t[0], y: local.min.y * s[1] + t[1], z: local.min.z * s[2] + t[2] },
    max: { x: local.max.x * s[0] + t[0], y: local.max.y * s[1] + t[1], z: local.max.z * s[2] + t[2] },
  };
}

const TABLE_W = 9;
const TABLE_D = 16;

const allNodes = root.listNodes();
const meshNodes = allNodes.filter((n) => n.getMesh());

console.log('--- Meshes (local glb coords) ---');
let sceneMin = { x: Infinity, y: Infinity, z: Infinity };
let sceneMax = { x: -Infinity, y: -Infinity, z: -Infinity };
const perMesh = [];

for (const node of meshNodes) {
  const mesh = node.getMesh();
  const bb = bboxOfMeshWorld(node, mesh);
  perMesh.push({ name: mesh.getName() || node.getName(), bb });
  sceneMin = {
    x: Math.min(sceneMin.x, bb.min.x),
    y: Math.min(sceneMin.y, bb.min.y),
    z: Math.min(sceneMin.z, bb.min.z),
  };
  sceneMax = {
    x: Math.max(sceneMax.x, bb.max.x),
    y: Math.max(sceneMax.y, bb.max.y),
    z: Math.max(sceneMax.z, bb.max.z),
  };
}

for (const m of perMesh) {
  console.log(
    `${m.name}: min(${m.bb.min.x.toFixed(3)}, ${m.bb.min.y.toFixed(3)}, ${m.bb.min.z.toFixed(3)}) max(${m.bb.max.x.toFixed(3)}, ${m.bb.max.y.toFixed(3)}, ${m.bb.max.z.toFixed(3)})`,
  );
}

console.log('\n--- Scene bbox ---');
console.log(`min(${sceneMin.x.toFixed(3)}, ${sceneMin.y.toFixed(3)}, ${sceneMin.z.toFixed(3)})`);
console.log(`max(${sceneMax.x.toFixed(3)}, ${sceneMax.y.toFixed(3)}, ${sceneMax.z.toFixed(3)})`);

const sceneW = sceneMax.x - sceneMin.x;
const sceneH = sceneMax.y - sceneMin.y;
const sceneD = sceneMax.z - sceneMin.z;
console.log(`size: w=${sceneW.toFixed(3)} h=${sceneH.toFixed(3)} d=${sceneD.toFixed(3)}`);

// Replicate front scale logic: sx=TABLE_W/sceneW, sz=TABLE_D/sceneD, sy=(sx+sz)/2
const sx = TABLE_W / sceneW;
const sz = TABLE_D / sceneD;
const sy = (sx + sz) / 2;
console.log(`\n--- Applied front scale ---`);
console.log(`sx=${sx.toFixed(4)} sy=${sy.toFixed(4)} sz=${sz.toFixed(4)}`);

// After scale, scene-centered then bottom-aligned
const scaledMin = { x: sceneMin.x * sx, y: sceneMin.y * sy, z: sceneMin.z * sz };
const scaledMax = { x: sceneMax.x * sx, y: sceneMax.y * sy, z: sceneMax.z * sz };
const centerX = (scaledMin.x + scaledMax.x) / 2;
const centerZ = (scaledMin.z + scaledMax.z) / 2;
const baseOffsetY = -scaledMin.y;

function applyFront(bb) {
  return {
    min: {
      x: bb.min.x * sx - centerX,
      y: bb.min.y * sy + baseOffsetY,
      z: bb.min.z * sz - centerZ,
    },
    max: {
      x: bb.max.x * sx - centerX,
      y: bb.max.y * sy + baseOffsetY,
      z: bb.max.z * sz - centerZ,
    },
  };
}

console.log('\n--- Meshes after front transform (world units, TABLE coords) ---');
for (const m of perMesh) {
  const w = applyFront(m.bb);
  const sizeX = w.max.x - w.min.x;
  const sizeY = w.max.y - w.min.y;
  const sizeZ = w.max.z - w.min.z;
  console.log(
    `${m.name}:\n  min(${w.min.x.toFixed(3)}, ${w.min.y.toFixed(3)}, ${w.min.z.toFixed(3)})\n  max(${w.max.x.toFixed(3)}, ${w.max.y.toFixed(3)}, ${w.max.z.toFixed(3)})\n  size(${sizeX.toFixed(3)}, ${sizeY.toFixed(3)}, ${sizeZ.toFixed(3)})`,
  );
}
