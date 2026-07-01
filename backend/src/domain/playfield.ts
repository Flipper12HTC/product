export const PLAYFIELD = {
  width: 9,
  depth: 16,
  floorThickness: 0.3,

  // Inner playable area — measured from pinball_map_FINAL.glb after scaling.
  interior: {
    halfWidth: 4.3,
    halfDepth: 7.8,
  },

  wall: {
    height: 7.0,
    thickness: 0.17,
  },

  cornerRadius: 1.5,

  // Right-side launch lane (plunger). Ball enters main field from top-right.
  // Lane is between separatorX and right wall (X=+4.5).
  launchLane: {
    separatorX: 3.5,
    zMin: -8,
    zMax: 8,
  },

  // Flipper pivots (physics space). Mirror in frontend TABLE.flippers.
  flippers: {
    left: { x: -1.7, y: 0.5, z: 6.48 },
    right: { x: 1.5, y: 0.5, z: 6.48 },
    length: 1.144,
    restAngle: 0.048,
    activeAngle: -0.5,
  },

  ball: {
    radius: 0.2,
    // X is auto-overridden from the col_wall_plunger_lane centre at runtime.
    // Y=1.0: floor top at Z=6 is Y≈0.635; ball radius=0.2 → resting center ≈ Y=0.835; 1.0 gives clearance.
    spawn: { x: 4.0, y: 1.0, z: 6.0 },
  },

  // Positions extracted from bumper_group_mesh (4 large) + bumper_mini_mesh (2 small).
  // Physics space: drain = +Z, far end = -Z, left = -X, right = +X.
  bumpers: [
    // bumper_group — 4 cylindrical bumpers near upper half of table
    { id: 'b1', x: -0.02, z: -2.98, radius: 0.4, scale: 1 },
    { id: 'b2', x: -0.84, z: -3.94, radius: 0.4, scale: 1 },
    { id: 'b3', x: 0.83, z: -4.18, radius: 0.4, scale: 1 },
    { id: 'b4', x: -3.18, z: -6.35, radius: 0.4, scale: 1 },
    // bumper_mini — 2 smaller obstacles in the lower-middle section
    { id: 'bm1', x: -0.12, z: 3.72, radius: 0.3, scale: 1 },
    { id: 'bm2', x: -1.87, z: 0.03, radius: 0.3, scale: 1 },
  ],

  drain: {
    gap: 2.5,
    yThreshold: -1,
    // Ball is considered drained when Z exceeds this threshold in the main field.
    // Set well past the flipper pivot (Z≈6.635) so the ball must reach the back wall
    // before drain triggers — avoids resetting while the ball is still near the flippers.
    zThreshold: 7.5,
  },

  // Impulse applied when the ball is put into play (game start + respawn after drain).
  // Sends the ball straight up the lane; the nudge at z≈-7.5 redirects it into the main field.
  serve: {
    impulse: { x: 0, y: 0, z: -10 },
  },
} as const;
