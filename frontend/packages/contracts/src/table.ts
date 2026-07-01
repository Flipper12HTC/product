export const TABLE = {
  width: 9,
  depth: 16,
  floorThickness: 0.3,

  wall: {
    height: 5.3,
    thickness: 0.17,
  },

  drain: {
    gap: 2.5,
    yThreshold: -1,
  },

  cornerRadius: 1.5,

  launchLane: {
    separatorX: 3.5,
    zMin: -8,
    zMax: 8,
  },

  // Pivot positions synced with backend PLAYFIELD (FlipperBase.glb).
  flippers: {
    left: { x: -1.7, y: 0.5, z: 6.48 },
    right: { x: 1.5, y: 0.5, z: 6.48 },
    length: 1.144,
    restAngle: 0.048,
    activeAngle: -0.5,
  },

  // Synced with backend RapierPhysicsWorld inline spawn (right plunger lane).
  ball: {
    radius: 0.2,
    spawn: { x: 4.0, y: 0.6, z: 6.0 },
  },

  // Synced with backend PLAYFIELD.bumpers (positions extracted from pinball_map_v4.glb).
  bumpers: [
    { id: 'b1', x: -0.02, z: -2.98, radius: 0.4, scale: 1 },
    { id: 'b2', x: -0.84, z: -3.94, radius: 0.4, scale: 1 },
    { id: 'b3', x: 0.83, z: -4.18, radius: 0.4, scale: 1 },
    { id: 'b4', x: -3.18, z: -6.35, radius: 0.4, scale: 1 },
    { id: 'bm1', x: -0.12, z: 3.72, radius: 0.3, scale: 1 },
    { id: 'bm2', x: -1.87, z: 0.03, radius: 0.3, scale: 1 },
  ],
} as const;
