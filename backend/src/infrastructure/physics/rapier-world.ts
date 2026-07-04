import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import type * as RapierLib from '@dimforge/rapier3d-compat';
import type { PhysicsWorld, BallConfig, BumperHit } from '../../application/ports/physics-world.js';
import type { Vec3 } from '../../domain/ball.js';
import type { FlipperSide } from '../../domain/flipper.js';
import { PLAYFIELD } from '../../domain/playfield.js';
import { loadPlayfieldGeometry, type BumperPosition } from './glb-loader.js';

type RapierModule = typeof RapierLib;

interface InitConfig extends Partial<BallConfig> {
  playfieldGlbPath?: string;
}

const DEFAULT_GLB_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../assets/models/FlipperBase.glb',
);

interface FlipperBody {
  body: RapierLib.RigidBody;
  colliderHandle: number;
  restAngle: number;
  activeAngle: number;
  current: number;
  target: number;
  // One scored hit per swing for the cradled-ball contact check (reset on activation).
  swingHitCounted: boolean;
}

const FLIPPER_HALF_HEIGHT = 0.28;
const FLIPPER_HALF_THICKNESS = 0.2;
const FLIPPER_BORDER_RADIUS = 0.06;
// 40 rad/s (was 70): at 70 the whole 0.548 rad swing completed in <4 substeps — the
// arm tip swept 0.167 units per substep (more than the ball RADIUS), so the returning
// arm rotated straight THROUGH a ball sitting under it and dropped it behind the
// flipper. At 40 the tip sweep is 0.095/substep (< radius, no angular tunneling) and
// the full swing still takes only ~14 ms — imperceptible to the player.
const FLIPPER_ROTATION_SPEED = 40;
// Passive contact restitution. A RESTING flipper is a dead surface the ball can land
// on and roll along — the launch energy comes exclusively from the active-swing boost
// in the collision handler (the old 1.3 super-elastic value fired the ball back even
// when the player wasn't touching the flipper).
const FLIPPER_RESTITUTION = 0.3;
const FLIPPER_FRICTION = 0.6;
const FLIPPER_MIN_LAUNCH_SPEED = 16.0; // m/s — guaranteed minimum after any contact

// col_ramp_main entry boost zone: the ramp floor sits at Y≈1.70 while the main playfield
// floor at Z≈4.3 is at Y≈1.07 — a ~0.63-unit step the ball can't climb at normal velocity.
// When the ball approaches the entry (X≈-3.1→-3.5, Z≈4.0→4.5) moving field-ward and
// below the ramp floor level, tickRampEntry() adds an upward velocity component AND
// guarantees a minimum entry speed so the climb can complete (see tickRampClimb).
// zMax 6.2 gives the X-steering (see tickRampEntry) ~0.2 s to centre the ball on the
// mouth line before it reaches the entry wedge — diagonal shots from the flippers
// arrive with |vx|≈|vz| and need the full window to align with the narrow mouth.
const RAMP_ENTRY_ZONE = { xMin: -4.0, xMax: -2.2, zMin: 3.8, zMax: 6.2, yMax: 2.0 } as const;

// col_ramp_main climb zone (the ramp channel above the main floor). The climb from
// Y≈1.7 (entry) to Y≈2.9 (exit at Z≈-0.6) costs ~6 m/s of speed — mid-speed shots
// stalled halfway and rolled back. tickRampClimb() enforces a minimum upfield speed
// while the ball is ON the ramp surface and still moving upfield.
// "On the ramp" = inside the channel bbox AND above the main floor line by >0.30
// (ramp floor sits 0.45–0.55 above the main floor along the whole climb).
const RAMP_CLIMB_ZONE = { xMin: -4.1, xMax: -0.25, zMin: -0.7, zMax: 3.95, yMax: 3.4 } as const;
// Also sets the exit speed at the top (Z≈-0.6): the ball leaves the ramp with
// enough momentum to continue into the upper half instead of stalling at mid-table.
const RAMP_MIN_CLIMB_SPEED = 6.5;
const RAMP_ENTRY_SPEED = 9.0;
// Main floor elevation approximation: Y ≈ 0 at the drain (Z=8), rises to Y≈5.31 at the
// far end (Z=-8) — slope 0.332 (from col_floor_playfield_blue).
const FLOOR_SLOPE = 0.332;
// Unit normal of the inclined table plane (used by the off-plane bounce cap in step()).
const PLANE_NY = Math.cos(Math.atan(FLOOR_SLOPE)); // ≈0.949
const PLANE_NZ = Math.sin(Math.atan(FLOOR_SLOPE)); // ≈0.315

// Pop-bumper kick. Relying on restitution alone gives a weak, inconsistent bounce:
// the multi-substep CCD contact absorbs most of the normal velocity, so the ball
// barely leaves. Instead, on contact we *set* the ball's horizontal velocity to point
// radially away from the bumper centre at a guaranteed pop speed — killing the inward
// component. Slow balls get a firm kick (MIN); fast balls keep their energy plus a
// little (incoming * GAIN). Vertical velocity is preserved so gravity still applies.
// 10 (not 6.5): the punchy-bumper feel — slow touches still get a solid pop; fast
// hits scale up via the gain and are clamped by MAX_BALL_XZ_SPEED.
const BUMPER_MIN_POP_SPEED = 10;
const BUMPER_POP_GAIN = 1.15;
// Minimum time between two registered pops on the same bumper.
const BUMPER_KICK_COOLDOWN = 0.15;

function quatFromY(angle: number): { x: number; y: number; z: number; w: number } {
  const half = angle / 2;
  return { x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) };
}

const _require = createRequire(import.meta.url);

export class RapierPhysicsWorld implements PhysicsWorld {
  private r!: RapierModule;
  private world!: RapierLib.World;
  private ballBody!: RapierLib.RigidBody;
  private ballColliderHandle!: number;
  private leftFlipper!: FlipperBody;
  private rightFlipper!: FlipperBody;
  private eventQueue!: RapierLib.EventQueue;
  private flipperHits = 0;
  private bumpers = new Map<number, BumperHit>();
  private bumperRadius = new Map<number, number>();
  private bumperHits: BumperHit[] = [];
  // Per-bumper cooldown (seconds remaining). While a ball rattles against a bumper,
  // Rapier can fire CollisionStarted every substep; without this guard each event would
  // re-apply the kick (energy stacks to absurd speeds) and re-award score. One pop per
  // contact window instead.
  private bumperCooldown = new Map<number, number>();
  private _laneSeparatorX: number = PLAYFIELD.launchLane.separatorX;
  private _spawnX: number = PLAYFIELD.ball.spawn.x;
  private _spawnZ: number = PLAYFIELD.ball.spawn.z;
  private _derivedBumpers: BumperPosition[] = [];

  async init(config: InitConfig = {}): Promise<void> {
    this.r = _require('@dimforge/rapier3d-compat') as RapierModule;
    await this.r.init();

    const cfg: BallConfig = {
      radius: PLAYFIELD.ball.radius,
      mass: 1.0,
      restitution: 0.4,
      friction: 0.3,
      ...config,
    };

    // Gravity: Y=-16 with the 18.4° floor incline gives ~6.0 m/s² of uphill deceleration
    // (+1.0 Z pulls toward the drain) — snappy falls without killing upfield reach, since
    // the flipper launches at 16 m/s (range ≈21 slope-units vs ≈15 needed for the top).
    // Y=-19 was so steep no launch could leave the lower half; Y=-13 reached fine but
    // the overall pace felt floaty.
    this.world = new this.r.World({ x: 0.0, y: -16.0, z: 1.0 });
    // Allow several CCD passes per substep — one pass can miss secondary impacts when a
    // flipper slams the ball into a thin trimesh wall within a single substep.
    this.world.integrationParameters.maxCcdSubsteps = 4;
    this.eventQueue = new this.r.EventQueue(true);

    this.ballBody = this.world.createRigidBody(
      this.r.RigidBodyDesc.dynamic()
        .setTranslation(PLAYFIELD.ball.spawn.x, PLAYFIELD.ball.spawn.y, PLAYFIELD.ball.spawn.z)
        // 0.06: at 0.15 the ball lost ~26% of its speed over a 2 s climb, contributing to
        // shots dying in the lower half of the table.
        .setLinearDamping(0.06)
        .setAngularDamping(0.1)
        .setCcdEnabled(true),
    );
    // Soft CCD predicts contacts within this distance even when regular CCD misses —
    // the main defense against tunneling through one-triangle-thick trimesh walls.
    this.ballBody.setSoftCcdPrediction(0.6);

    const ballCollider = this.world.createCollider(
      this.r.ColliderDesc.ball(cfg.radius)
        .setRestitution(cfg.restitution)
        .setFriction(cfg.friction)
        .setMass(cfg.mass)
        .setActiveEvents(this.r.ActiveEvents.COLLISION_EVENTS),
      this.ballBody,
    );
    this.ballColliderHandle = ballCollider.handle;
    // Thin virtual skin around the ball: contacts resolve slightly before geometric
    // overlap, which keeps fast impacts from embedding the ball inside trimesh walls.
    ballCollider.setContactSkin(0.01);

    await this.buildPlayfieldFromGlb(config.playfieldGlbPath ?? DEFAULT_GLB_PATH);
    // Force a safe spawn location: X=4.0 well into the right plunger lane (between
    // the lane separator at X=3.5 and the right outer wall at X=4.5), Y=1.0 above
    // the floor (floor top at Z=6 is Y≈0.635; resting center ≈ Y=0.835), Z=6 drain end.
    this.ballBody.setTranslation({ x: 4.0, y: 1.0, z: 6.0 }, true);
    this.ballBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.ballBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.leftFlipper = this.buildFlipper('left');
    this.rightFlipper = this.buildFlipper('right');
    // Bumper colliders. Positions come from PLAYFIELD.bumpers (extracted from the map
    // meshes) since the GLB has no col_bumper_marker_* geometry, so _derivedBumpers is
    // empty. Prefer GLB-derived markers if present (future maps), else fall back to the
    // hardcoded constants — the frontend mirrors the same list in physics-debug.
    const bumperSpecs =
      this._derivedBumpers.length > 0
        ? this._derivedBumpers.map((b) => ({ ...b, scale: 1 }))
        : PLAYFIELD.bumpers;
    for (const b of bumperSpecs) {
      this.buildBumper(b);
    }
  }

  private buildBumper(b: {
    id: string;
    x: number;
    z: number;
    radius: number;
    scale: number;
  }): void {
    const radius = b.radius * b.scale;
    const halfHeight = PLAYFIELD.wall.height / 2;
    const body = this.world.createRigidBody(
      this.r.RigidBodyDesc.fixed().setTranslation(b.x, halfHeight, b.z),
    );
    const collider = this.world.createCollider(
      this.r.ColliderDesc.cylinder(halfHeight, radius)
        // Modest passive restitution — the pop comes from the ACTIVE radial kick in
        // kickBallFromBumper(). Pure high restitution (1.2) was direction-dumb: fast
        // upfield shots reflected straight back into the lower half of the table.
        // Passive contact only matters during the kick cooldown window.
        .setRestitution(0.7)
        .setFriction(0.2)
        .setActiveEvents(this.r.ActiveEvents.COLLISION_EVENTS),
      body,
    );
    this.bumpers.set(collider.handle, { id: b.id, x: b.x, z: b.z });
    this.bumperRadius.set(collider.handle, radius);
  }

  // Push the ball radially away from a bumper it just touched (arcade pop-bumper kick).
  private kickBallFromBumper(b: BumperHit, radius: number): void {
    const p = this.ballBody.translation();
    const v = this.ballBody.linvel();
    let dx = p.x - b.x;
    let dz = p.z - b.z;
    let len = Math.hypot(dx, dz);
    if (len < 1e-4) {
      // Ball almost dead-centre: default kick up the table (toward the far end, -Z).
      dx = 0;
      dz = -1;
      len = 1;
    }
    const incoming = Math.hypot(v.x, v.z);
    const popSpeed = Math.max(BUMPER_MIN_POP_SPEED, incoming * BUMPER_POP_GAIN);
    const scale = popSpeed / len;
    // Set (not add) horizontal velocity to a clean radial-outward pop; keep vertical.
    this.ballBody.setLinvel({ x: dx * scale, y: v.y, z: dz * scale }, true);
    // Snap the ball back onto the bumper surface so a fast dead-centre hit can't sink
    // in (or tunnel) before the outward velocity takes effect on the next substep.
    const surfaceDist = radius + PLAYFIELD.ball.radius + 0.02;
    if (len < surfaceDist) {
      const push = surfaceDist / len;
      this.ballBody.setTranslation({ x: b.x + dx * push, y: p.y, z: b.z + dz * push }, true);
    }
  }

  private async buildPlayfieldFromGlb(path: string): Promise<void> {
    const geom = await loadPlayfieldGeometry(path, {
      targetWidth: PLAYFIELD.width,
      targetDepth: PLAYFIELD.depth,
    });
    // Store GLB-derived positions — the col_wall_plunger_lane mesh is the single source of
    // truth for both the lane separator (inner edge) and the ball spawn (lane centre).
    // PLAYFIELD.ball.spawn.x acts only as a safety default if the GLB lacks the lane mesh.
    this._laneSeparatorX = geom.derived.laneSeparatorX;
    this._spawnX = geom.derived.laneSpawnX;
    // _spawnZ is intentionally NOT overridden from the GLB — kept hardcoded so the ball
    // always spawns at the drain end of the lane, regardless of the lane mesh extent.
    this._derivedBumpers = geom.derived.bumpers;

    // Floor = base floor trimesh (col_floor_* meshes, stable slope).
    this.addTrimesh(geom.floor.vertices, geom.floor.indices, { friction: 0.15, restitution: 0.05 });
    // Inclined safety floor: thick box whose tilt is computed from the base floor vertices only.
    // Using only col_floor_* (not col_ref_floor_*) keeps the slope stable so the ball spawn
    // position (Y=0.6) stays above the box surface at Z=6.
    this.addInclinedFloor(geom.floor.vertices);
    // Reference floor trimesh (col_ref_floor_*): exact visual floor surface for accurate
    // collision. Added separately so it doesn't affect the inclined box slope.
    if (geom.refFloor && geom.refFloor.vertices.length > 0) {
      this.addTrimesh(geom.refFloor.vertices, geom.refFloor.indices, {
        friction: 0.15,
        restitution: 0.05,
      });
    }
    // Walls = walls from GLB (low bounce so ball doesn't fly off surface).
    this.addTrimesh(geom.walls.vertices, geom.walls.indices, { friction: 0.05, restitution: 0.6 });
    // Aprons = inlane/outlane guide walls, bottom edge dropped to the floor by the loader
    // so the ball can't roll under them (apron_2 floated 0.31 above the floor).
    if (geom.aprons && geom.aprons.vertices.length > 0) {
      this.addTrimesh(geom.aprons.vertices, geom.aprons.indices, {
        friction: 0.05,
        restitution: 0.6,
      });
    }
    // Ramp = full ramp geometry (all face angles) so the ball rolls through the channel.
    // friction=0 so the ball slides freely up the incline without losing speed to surface drag.
    if (geom.ramp && geom.ramp.vertices.length > 0) {
      this.addTrimesh(geom.ramp.vertices, geom.ramp.indices, { friction: 0.0, restitution: 0.3 });
    }
    // Panel = circular loop wall — very low restitution + high friction so the ball follows
    // the curve on hard shots instead of bouncing back into the plunger lane.
    if (geom.panel && geom.panel.vertices.length > 0) {
      this.addTrimesh(geom.panel.vertices, geom.panel.indices, {
        friction: 0.5,
        restitution: 0.05,
      });
    }
    // Frame walls (col_wall_frame_*) — extracted without the inLane filter so their
    // triangles inside the lane zone are preserved (col_wall_frame_black is at X≈3–4.5).
    if (geom.frameWalls && geom.frameWalls.vertices.length > 0) {
      this.addTrimesh(geom.frameWalls.vertices, geom.frameWalls.indices, {
        friction: 0.05,
        restitution: 0.4,
      });
    }
    // Solid convex hulls for the left inlane guide walls + both slingshot bodies —
    // replaces the thin quad trimeshes that wedged the ball (see glb-loader).
    for (const pts of geom.guides) {
      const body = this.world.createRigidBody(this.r.RigidBodyDesc.fixed());
      const desc = this.r.ColliderDesc.convexHull(pts);
      if (desc) {
        this.world.createCollider(desc.setFriction(0.1).setRestitution(0.5), body);
      }
    }
    // col_ramp_main has no up-facing floor between Z≈3.15 and Z≈3.85 (channel
    // X[-3.66,-2.96]) — the ball fell through the gap mid-climb. Bridge it with an
    // inclined box flush with the ramp floor on both edges (Y≈1.74 at Z=3.85 →
    // Y≈2.01 at Z=3.10).
    this.addRampPatch();
    // Approach wedge in front of the ramp mouth: the GLB has no slope from the main
    // floor (Y≈1.0 at Z=5.0) up to the ramp entry floor (Y≈1.72 at Z≈4.25) — only the
    // overhanging col_ref_plunger_001 lip, which balls slammed into (excluded from
    // physics in the loader). This wedge is the missing slope; the ball rolls up it
    // into the mouth at any approach speed.
    this.addRampEntryWedge();
    // Under-ramp seal: gaps below the ramp channel floor (Y≈2.0) let the ball slip
    // underneath and wedge in sub-floor pits (repro: rests at (-3.67, 1.49, 3.25) and
    // (-3.56, 1.57, 2.95)). One box fills the void under the channel's left half.
    // Top capped at Y=1.70 — below the ramp-patch surface (Y≥1.72) and ≥0.3 under the
    // channel floor upfield of the patch, so it never forms a curb inside the climb.
    this.addBoxWall(-3.54, 1.25, 3.2, 0.14, 0.45, 0.65);
    // Left channel floor pit: the floor mesh has a depression at X≈-3.6→-4.2,
    // Z≈3.2–4.2 (balls rested 0.06–0.17 BELOW the nominal incline there, pinned
    // against the black.003 deflector quad instead of sliding along it to the
    // outlane). Level it with an inclined patch flush with the nominal floor.
    this.addFloorPatch(-3.9, 0.28, 3.7, 0.55);
    // Guard rail flanking the UPPER ramp channel on the east side — the invisible
    // "wire form" of a real ramp. Elevated so ground balls pass under; catches hops.
    this.addGuardRail(-2.32, 0.7, 2.5);
    // The col_wall_black.001/.003 crests barely rise above the local floor (0.13–0.6)
    // and their sloped faces act as launch ramps — the ball ROLLED up and over them
    // (surface climbs bypass the ballistic off-plane cap). Ground-level walls make
    // them the solid obstacles the visuals show:
    // black.003 north crest (X≈-3.61, crest just +0.13): full wall, the descent
    // corridor runs WEST of it and stays open.
    this.addBoxWall(-3.61, 3.2, -0.3, 0.08, 0.8, 0.75);
    // black.003 eastern arm (X≈-2.45, Z 1→2.6, crest +0.21): full wall flush with the
    // arm; the ramp channel stays west of X=-2.48.
    this.addBoxWall(-2.42, 2.4, 1.75, 0.06, 0.8, 0.85);
    // black.001 east section (X -2.05→-1.35): interior cap block over the crest —
    // climbers summit into it and slide back. Limited to Z -1.55→-0.35 (upfield of
    // that, the rising floor buries the structure — a taller/longer cap would poke
    // above the floor as an invisible field wall) and east of X=-2.1 so ramp-exit
    // balls (X -3.2→-2.2, Y≈3.0 at Z≈-0.6) fly clear.
    this.addBoxWall(-1.7, 3.55, -0.95, 0.35, 0.6, 0.6);
    // West side: a thin rail left a 0.12-wide slot against col_wall_left_fill where
    // the ball rattled forever. Fill the whole gap (X -4.16→-3.90) with solid blocks
    // instead, leaving a 0.5-high ground tunnel so the left-channel descent corridor
    // still flows underneath.
    for (const [z0, z1] of [
      [1.2, 1.75],
      [1.75, 2.3],
      [2.3, 2.85],
    ] as const) {
      const bottom = (8 - z0) * FLOOR_SLOPE + 0.5;
      const top = 3.4;
      this.addBoxWall(
        -4.03,
        (bottom + top) / 2,
        (z0 + z1) / 2,
        0.13,
        (top - bottom) / 2,
        (z1 - z0) / 2,
      );
    }
    // Backup box colliders for the apron inlane/outlane guides.
    // The apron trimesh (col_wall_apron_*) can miss fast-moving balls — these boxes
    // duplicate the key boundary surfaces so there is always a solid fallback.
    this.addApronBoxes();
    // Solid box boundaries: the GLB outer wall has only 2 triangles on the far end and 6 per
    // side wall — too sparse to reliably stop a fast ball. Box colliders are the safety net.
    this.buildBoundaryWalls();
    // Lane separator: clean box wall between the shoot lane and the main playfield.
    // The GLB floor edge at that X had phantom triangles inside the lane — replaced by a box.
    // The separator stops just short of the far end (leaves an opening so the ball can
    // enter the playfield after travelling up the full lane).
    this.addLaneSeparator();
  }

  private addApronBoxes(): void {
    // Backup solid boxes for the apron guide surfaces and outer-wall inner face.
    // All positions derived from FlipperBase.glb inspection (physics space).
    const halfH = PLAYFIELD.wall.height / 2;
    const zFront = 3.35;
    const zBack = 7.05;
    const zCtr = (zFront + zBack) / 2; // ≈ 5.2
    const zHalf = (zBack - zFront) / 2; // ≈ 1.85

    // Left outlane separator (inner edge of left outlane channel, X ≈ -3.65).
    this.addBoxWall(-3.65, halfH, zCtr, 0.08, halfH, zHalf);

    // Right inlane separator — spans from the apron mesh right edge (X ≈ 2.94) flush to
    // the lane-separator box inner face (this._laneSeparatorX).  No gap means the ball
    // cannot slip between the apron guide and the plunger-lane wall.
    const rightGuide = 2.94;
    const sep = this._laneSeparatorX; // 3.5 (or GLB-derived)
    const rHalf = (sep - rightGuide) / 2;
    const rCtr = rightGuide + rHalf;
    this.addBoxWall(rCtr, halfH, zCtr, rHalf, halfH, zHalf);
  }

  private addLaneSeparator(): void {
    const halfD = PLAYFIELD.depth / 2;
    const sep = this._laneSeparatorX;
    // Separator spans the full wall height so it stays above the rising inclined floor
    // (which reaches Y≈4.2 at the far end). The opening is at Z < −2.5 (no separator
    // there) so the ball can still exit into the main field at the correct position.
    const wallCenterZ = halfD - 5.5; // center at Z=2.5, spans Z=-2.5 → +7.5
    const wallHalfZ = 5.0;
    const wallHalfY = PLAYFIELD.wall.height / 2; // = 3.5, spans Y=0 → 7.0 (full wall height)
    this.addBoxWall(sep, wallHalfY, wallCenterZ, 0.05, wallHalfY, wallHalfZ);
  }

  private buildBoundaryWalls(): void {
    const halfW = PLAYFIELD.width / 2;
    const halfD = PLAYFIELD.depth / 2;
    const halfH = PLAYFIELD.wall.height / 2;
    const t = 0.15;
    const sep = this._laneSeparatorX; // derived from GLB at init

    // Box walls sit just outside the GLB col_wall_main_outer inner faces.
    // Left/right are flush; far end stays at -halfD so the nudge trigger at Z=-7.5 fires
    // before the ball reaches the box inner face at Z=-7.85.
    this.addBoxWall(-(4.5 + t), halfH, 0, t, halfH, halfD + t); // left, face at X=-4.50
    this.addBoxWall(4.16 + t, halfH, 0, t, halfH, halfD + t); // right, face at X=+4.16
    this.addBoxWall(0, halfH, -halfD, halfW + t, halfH, t); // far end, face at Z=-7.85
    // Drain wall — main field (X: left outer wall → lane separator).
    // Previously there was no wall at +Z for the main field, so the ball flew off into
    // undefined space past Z=8. This wall gives the ball something to bounce off and
    // triggers the drain detection when the ball reaches zThreshold (7.5) before it.
    const mainHalfX = (sep + 4.5) / 2; // half-width of main field
    const mainCenterX = -4.5 + mainHalfX; // center X of main field
    this.addBoxWall(mainCenterX, halfH, halfD, mainHalfX, halfH, t);
    // Bottom wall for the GLB-derived lane (left side).
    const wallX = sep > 0 ? halfW : -halfW;
    const laneHalfX = Math.abs(wallX - sep) / 2;
    const laneCenterX = (sep + wallX) / 2;
    this.addBoxWall(laneCenterX, halfH, halfD, laneHalfX, halfH, t);
    // Bottom wall for the right lane (spawn side, X=separatorX→halfW).
    const rightSep = PLAYFIELD.launchLane.separatorX; // 3.5
    const rightLaneHalfX = (halfW - rightSep) / 2; // (4.5-3.5)/2 = 0.5
    const rightLaneCenterX = rightSep + rightLaneHalfX; // 4.0
    this.addBoxWall(rightLaneCenterX, halfH, halfD, rightLaneHalfX, halfH, t);

    // Ceiling at wall height. The table is inclined — the floor rises from Y≈0 at the
    // drain end to Y≈4.2 at the far end. A ceiling at Y=2 pinches the ball against the
    // rising floor around Z≈2 (which appeared as "no hitbox" blockage). Must sit above
    // the highest floor point + ball diameter, so we use the full wall height (7.0).
    this.addBoxWall(0, halfH * 2 + t, 0, halfW + t, t, halfD + t);
  }

  private addInclinedFloor(solVertices: Float32Array): void {
    // Linear regression: compute slope dY/dZ from the extracted floor vertices.
    // For our inclined table the drain end (Z=+halfD) is lower, far end (Z=-halfD) is higher.
    let sZ = 0,
      sY = 0,
      sZZ = 0,
      sZY = 0,
      n = 0;
    for (let i = 0; i < solVertices.length; i += 3) {
      const y = solVertices[i + 1]!;
      const z = solVertices[i + 2]!;
      sZ += z;
      sY += y;
      sZZ += z * z;
      sZY += z * y;
      n++;
    }
    const slope = n > 1 ? (n * sZY - sZ * sY) / (n * sZZ - sZ * sZ) : 0; // dY/dZ, negative

    const tiltAngle = Math.atan(Math.abs(slope)); // always positive angle
    const s = Math.sin(tiltAngle);
    const c = Math.cos(tiltAngle);
    const halfW = PLAYFIELD.width / 2 + 0.2;
    const halfH = 0.5; // 1 unit thick — no tunneling
    const halfD = PLAYFIELD.depth / 2 + 0.2;
    const halfD_local = halfD / c; // extend in rotated frame to cover full depth

    // Place the drain edge (box local +Z end) at physics Y=0, Z≈+halfD.
    const centerY = halfD_local * s - halfH * c;

    // Positive rotation around X: drain (+Z) goes down, far end (-Z) goes up.
    const half = tiltAngle / 2;
    const body = this.world.createRigidBody(
      this.r.RigidBodyDesc.fixed()
        .setTranslation(0, centerY, 0)
        .setRotation({ x: Math.sin(half), y: 0, z: 0, w: Math.cos(half) }),
    );
    this.world.createCollider(
      this.r.ColliderDesc.cuboid(halfW, halfH, halfD_local).setFriction(0.15).setRestitution(0.05),
      body,
    );
  }

  // Inclined box whose top surface follows the nominal floor line (FLOOR_SLOPE),
  // used to level local pits in the floor mesh.
  private addFloorPatch(cx: number, halfX: number, cz: number, halfZ: number): void {
    const tilt = Math.atan(FLOOR_SLOPE);
    const half = tilt / 2;
    const topY = (8 - cz) * FLOOR_SLOPE;
    const body = this.world.createRigidBody(
      this.r.RigidBodyDesc.fixed()
        .setTranslation(cx, topY - 0.05, cz)
        .setRotation({ x: Math.sin(half), y: 0, z: 0, w: Math.cos(half) }),
    );
    this.world.createCollider(
      this.r.ColliderDesc.cuboid(halfX, 0.05, halfZ).setFriction(0.15).setRestitution(0.05),
      body,
    );
  }

  private addRampEntryWedge(): void {
    // Inclined surface whose TOP EDGE lands exactly flush with the mouth floor:
    // from (Z=5.35, Y=0.88) up to (Z=4.30, Y=1.70). The first version overshot the
    // mouth (top corner at Z≈4.03, Y≈1.89 — 0.17 ABOVE the mouth floor), forming a
    // crest that kicked climbing balls back down-field. Spans exactly the mouth
    // width (up-facing entry floor is X[-3.54,-3.15]). Same rotation convention as
    // addRampPatch: positive X-rotation drops the drain-side (+Z) edge.
    const tilt = Math.atan(0.82 / 1.05); // ≈38°
    const half = tilt / 2;
    const halfLen = Math.hypot(0.82, 1.05) / 2; // half-length along the slope
    const thickness = 0.08;
    // Box centre = surface-segment midpoint, pushed one half-thickness down the
    // surface normal (0, cos tilt, sin tilt).
    const body = this.world.createRigidBody(
      this.r.RigidBodyDesc.fixed()
        .setTranslation(
          -3.345,
          (0.88 + 1.7) / 2 - Math.cos(tilt) * thickness,
          (5.35 + 4.3) / 2 - Math.sin(tilt) * thickness,
        )
        .setRotation({ x: Math.sin(half), y: 0, z: 0, w: Math.cos(half) }),
    );
    this.world.createCollider(
      this.r.ColliderDesc.cuboid(0.215, thickness, halfLen).setFriction(0.0).setRestitution(0.1),
      body,
    );
  }

  // Elevated guard rail along X=x, Z∈[zMin,zMax] — the invisible "wire form" every
  // real ramp has. The rail bottom floats 0.4 above the MAIN floor line so ground
  // balls roll under it untouched; the band 0.4→1.6 above the floor blocks the hops
  // a ball can take from the (higher) ramp surface. Emitted as short level segments
  // because the floor line rises along Z.
  private addGuardRail(x: number, zMin: number, zMax: number, bottomOffset = 0.35): void {
    const SEG = 0.5;
    for (let z0 = zMin; z0 < zMax; z0 += SEG) {
      const z1 = Math.min(z0 + SEG, zMax);
      const zc = (z0 + z1) / 2;
      // Floor is highest at the segment's LOW-z end — clearance is computed there.
      // Default +0.35 clears ground balls (top = floor+0.2) while catching hops from
      // the higher ramp surface (ball centre ≈ floor+0.65). Pass a larger offset when
      // a descent corridor runs beneath the rail.
      const bottom = (8 - z0) * FLOOR_SLOPE + bottomOffset;
      const top = bottom + 1.2;
      this.addBoxWall(x, (bottom + top) / 2, zc, 0.06, (top - bottom) / 2, (z1 - z0) / 2);
    }
  }

  private addRampPatch(): void {
    // Ramp floor bridge over the mesh gap: slope matched to the surrounding ramp floor
    // (dY/dZ ≈ -0.36 between (Z=3.85, Y=1.74) and (Z=3.10, Y=2.01)). Positive rotation
    // around X drops the +Z (drain-side) edge, same convention as addInclinedFloor.
    const tilt = Math.atan(0.36);
    const half = tilt / 2;
    const body = this.world.createRigidBody(
      this.r.RigidBodyDesc.fixed()
        .setTranslation(-3.31, 1.82, 3.48)
        .setRotation({ x: Math.sin(half), y: 0, z: 0, w: Math.cos(half) }),
    );
    this.world.createCollider(
      this.r.ColliderDesc.cuboid(0.36, 0.05, 0.45).setFriction(0.0).setRestitution(0.1),
      body,
    );
  }

  private addBoxWall(cx: number, cy: number, cz: number, hx: number, hy: number, hz: number): void {
    const body = this.world.createRigidBody(
      this.r.RigidBodyDesc.fixed().setTranslation(cx, cy, cz),
    );
    this.world.createCollider(
      this.r.ColliderDesc.cuboid(hx, hy, hz).setFriction(0.05).setRestitution(0.6),
      body,
    );
  }

  private addTrimesh(
    vertices: Float32Array,
    indices: Uint32Array,
    opts: { friction: number; restitution: number },
  ): void {
    // Cleanup flags only — no FIX_INTERNAL_EDGES (requires a closed manifold mesh;
    // our open surfaces would get wrong pseudo-normals at boundary edges, causing the
    // ball to be deflected upward or through the surface).
    // DELETE_BAD_TOPOLOGY: removes T-junctions that create invisible walls.
    // MERGE_DUPLICATE_VERTICES: collapses vertices at X=LANE_X_MIN produced by the X-clip.
    // DELETE_DEGENERATE + DUPLICATE: removes zero-area and overlapping triangles.
    const flags =
      this.r.TriMeshFlags.DELETE_BAD_TOPOLOGY_TRIANGLES | //   4
      this.r.TriMeshFlags.MERGE_DUPLICATE_VERTICES | //  16
      this.r.TriMeshFlags.DELETE_DEGENERATE_TRIANGLES | //  32
      this.r.TriMeshFlags.DELETE_DUPLICATE_TRIANGLES; //  64
    const body = this.world.createRigidBody(this.r.RigidBodyDesc.fixed());
    this.world.createCollider(
      this.r.ColliderDesc.trimesh(vertices, indices, flags)
        .setFriction(opts.friction)
        .setRestitution(opts.restitution),
      body,
    );
  }

  private buildFlipper(side: FlipperSide): FlipperBody {
    const pivot = side === 'left' ? PLAYFIELD.flippers.left : PLAYFIELD.flippers.right;
    const sign = side === 'left' ? -1 : 1;
    const restAngle = sign * PLAYFIELD.flippers.restAngle;
    const activeAngle = sign * PLAYFIELD.flippers.activeAngle;
    const dir = side === 'left' ? 1 : -1;
    const halfLength = PLAYFIELD.flippers.length / 2;

    // pivot.y from the GLB (bbFL.minY) is the floor level at the flipper Z position.
    // Using it directly as the body CENTER would place half the arm below the floor and
    // half above, making the ball (resting at floor+radius) sit inside the top face —
    // causing permanent penetration and erratic contact. Instead we raise the center by
    // TOTAL_HALF so the collider BOTTOM sits at floor level and the arm extends upward,
    // letting the ball contact the arm's front face cleanly from the field side.
    const totalHalf = FLIPPER_HALF_HEIGHT + FLIPPER_BORDER_RADIUS;
    const body = this.world.createRigidBody(
      this.r.RigidBodyDesc.kinematicVelocityBased()
        .setTranslation(pivot.x, pivot.y + totalHalf, pivot.z)
        .setRotation(quatFromY(restAngle))
        .setCcdEnabled(true),
    );

    const collider = this.world.createCollider(
      this.r.ColliderDesc.roundCuboid(
        halfLength,
        FLIPPER_HALF_HEIGHT,
        FLIPPER_HALF_THICKNESS,
        FLIPPER_BORDER_RADIUS,
      )
        .setTranslation(dir * halfLength, 0, 0)
        .setRestitution(FLIPPER_RESTITUTION)
        .setFriction(FLIPPER_FRICTION)
        .setActiveEvents(this.r.ActiveEvents.COLLISION_EVENTS),
      body,
    );

    return {
      body,
      colliderHandle: collider.handle,
      restAngle,
      activeAngle,
      current: restAngle,
      target: restAngle,
      swingHitCounted: false,
    };
  }

  // Maximum horizontal speed (m/s) for the ball. Applied per substep: 20 m/s covers
  // 0.042 units per substep at 8× 60 Hz — well under the ball diameter (0.2), so CCD
  // stays reliable on thin trimesh walls. Leaves headroom over the 16 m/s flipper
  // launch and the 10 m/s bumper kick.
  private static readonly MAX_BALL_XZ_SPEED = 20;

  // Anti-stuck watchdog. The GLB has one-sided quads / sub-floor structures forming
  // wedge pockets that geometry patches keep missing (e.g. the black.003 deflector quad
  // in the left channel, where the ball sits in a 0.1-unit slot between two near-parallel
  // faces). If the ball sits nearly still for STUCK_TICKS outside the legitimate rest
  // zones (plunger lane + flipper area), give it a table-nudge. Nudges ESCALATE (higher
  // hop, alternating lateral direction) until the ball has moved >0.6 units away from
  // the wedge — a single fixed nudge died instantly against the pocket walls.
  private static readonly STUCK_SPEED = 0.25;
  private static readonly STUCK_TICKS = 90; // 1.5 s at 60 Hz
  private stuckTicks = 0;
  private nudgeLevel = 0;
  // Ticks during which the vertical-velocity cap is relaxed so an escape hop can
  // actually rise out of the wedge (30 ticks ≈ 0.5 s covers a vy=7.5 hop at g=16).
  private nudgeGraceTicks = 0;
  private stuckAnchor: Vec3 | null = null;

  private tickStuckWatchdog(): void {
    const p = this.ballBody.translation();
    if (this.stuckAnchor) {
      const dx = p.x - this.stuckAnchor.x;
      const dy = p.y - this.stuckAnchor.y;
      const dz = p.z - this.stuckAnchor.z;
      if (dx * dx + dy * dy + dz * dz > 0.36) {
        // Escaped the wedge area — reset escalation.
        this.stuckAnchor = null;
        this.nudgeLevel = 0;
      }
    }
    const v = this.ballBody.linvel();
    const speed = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    const inRestZone =
      (Math.abs(p.x) < 2.2 && p.z > 5.6) || // resting on a raised flipper is legitimate
      (p.x > this._laneSeparatorX - 0.1 && p.z > 4.5); // plunger lane rest position
    if (speed > RapierPhysicsWorld.STUCK_SPEED || inRestZone) {
      this.stuckTicks = 0;
      return;
    }
    this.stuckTicks += 1;
    if (this.stuckTicks >= RapierPhysicsWorld.STUCK_TICKS) {
      this.stuckTicks = 0;
      // The left outlane bottom (X<-3.5, Z>6) is a sealed pocket in the GLB — there is
      // no under-apron passage to the drain, so no nudge can free the ball. A real
      // outlane loses the ball: hard-drain it so the game flow continues.
      if (p.x < -3.5 && p.z > 6.0) {
        this.ballBody.setTranslation({ x: -2.0, y: 0.5, z: 7.6 }, true);
        this.ballBody.setLinvel({ x: 0, y: 0, z: 1 }, true);
        return;
      }
      this.stuckAnchor = { x: p.x, y: p.y, z: p.z };
      this.nudgeLevel = Math.min(this.nudgeLevel + 1, 4);
      this.nudgeGraceTicks = 30;
      const level = this.nudgeLevel;
      const dirX = (level % 2 === 0 ? -1 : 1) * (p.x > 0 ? -1 : 1);
      // Ball PERCHED above the floor line (resting on top of a wall/rail after a hop):
      // push it laterally toward the field with no hop at all — a vertical hop from up
      // there just lands it on the next wall.
      const elevated = p.y > (8 - p.z) * FLOOR_SLOPE + 0.35;
      if (elevated) {
        this.ballBody.setLinvel({ x: dirX * (1 + level), y: 0.5, z: 2.0 }, true);
        return;
      }
      // On-floor wedge: escalating hop (rise 0.38 → 0.94) + alternating lateral push.
      this.ballBody.setLinvel(
        { x: dirX * level, y: 2.5 + 0.75 * level, z: 2.5 - 0.5 * level },
        true,
      );
    }
  }

  step(dt: number): void {
    // tickFlipper runs inside the substep loop (subDt) so the kinematic body still has
    // non-zero angular velocity when world.step() runs. Calling it once with the full dt
    // caused the flipper to snap to its target before any substep executed — angvel was 0
    // for all 8 substeps, so Rapier had no velocity to transfer to the ball on contact.
    // 8 substeps (vs 4) halves per-substep travel distance → less tunneling through thin walls.
    const subDt = dt / 8;
    this.world.timestep = subDt;
    for (let i = 0; i < 8; i++) {
      this.tickFlipper(this.leftFlipper, subDt);
      this.tickFlipper(this.rightFlipper, subDt);
      this.tickRampEntry();
      this.tickRampClimb();
      this.tickBumperCooldowns(subDt);
      this.world.step(this.eventQueue);
      this.eventQueue.drainCollisionEvents((h1, h2, started) => {
        if (!started) return;
        const ball = this.ballColliderHandle;
        const other = h1 === ball ? h2 : h2 === ball ? h1 : -1;
        if (other === -1) return;
        if (this.isFlipperHandle(other)) {
          this.flipperHits += 1;
          // Boost only while the flipper is actively swinging toward its active angle.
          // A resting (or held-up, or returning) flipper is a passive surface: the ball
          // just bounces softly or rolls along it, like on a real machine.
          const f =
            other === this.leftFlipper.colliderHandle ? this.leftFlipper : this.rightFlipper;
          if (f.target === f.activeAngle && Math.abs(f.target - f.current) > 0.01) {
            this.applyFlipperBoost(f);
          }
          return;
        }
        const bumper = this.bumpers.get(other);
        if (bumper && (this.bumperCooldown.get(other) ?? 0) <= 0) {
          this.bumperCooldown.set(other, BUMPER_KICK_COOLDOWN);
          this.bumperHits.push(bumper);
          this.kickBallFromBumper(bumper, this.bumperRadius.get(other) ?? 0.4);
        }
      });
      // Pinball constraints, applied PER SUBSTEP. The flipper arm tip moves at up to
      // ~80 m/s — capping once per full step let the ball fly 8 substeps at post-impact
      // speed, far past the safe CCD range, and tunnel through thin trimesh walls.
      // 1) Horizontal speed cap (CCD safety).
      // 2) No aerial bounces: cap the velocity component NORMAL to the inclined table
      //    plane (raw vy is the wrong axis — rolling uphill on the 18.4° incline
      //    inherently carries vy ≈ 0.32·v, so capping vy crushed upfield shots into
      //    the floor). 2.2 m/s off-plane ≈ a one-ball-radius hop. Exempt inside the
      //    ramp channel (the 37° entry wedge needs ~3.6 off-plane at entry speed) and
      //    during a watchdog-nudge grace window (escape hops).
      const vel = this.ballBody.linvel();
      const bp = this.ballBody.translation();
      const xzSpeed = Math.sqrt(vel.x * vel.x + vel.z * vel.z);
      const maxXZ = RapierPhysicsWorld.MAX_BALL_XZ_SPEED;
      const xzScale = xzSpeed > maxXZ ? maxXZ / xzSpeed : 1;
      let vx = vel.x * xzScale;
      let vy = vel.y;
      let vz = vel.z * xzScale;
      // "In the ramp": the entry corridor (needs 7.0 — the 37° wedge climb), or the
      // actual CHANNEL X-band while riding above the main floor (needs only 3.5 —
      // channel slope is gentler than the table). The previous exemption covered the
      // whole channel bbox (X up to -0.25): any slightly-bouncing ball in the left-
      // centre field got a 7 m/s vertical allowance, leapt ~1.5 units and landed on
      // top of / inside wall geometry.
      const channelXMax = bp.z > 2 ? -2.8 : bp.z > 1 ? -2.2 : -0.7;
      // West bound -3.95 (not -4.1): the channel floor never goes past X≈-3.92, and
      // extending the band over the under-ramp tunnel let a ball rattle in there
      // forever with the relaxed cap (too fast for the stuck watchdog to trigger).
      const onRampSurface =
        bp.x > -3.95 &&
        bp.x < channelXMax &&
        bp.z > -0.7 &&
        bp.z < 4.35 &&
        bp.y < 3.4 &&
        bp.y > (8 - bp.z) * FLOOR_SLOPE + 0.25;
      const inEntry = bp.x > -4.1 && bp.x < -2.4 && bp.z >= 3.8 && bp.z < 5.6 && bp.y < 3.4;
      // Default 1.5: max ballistic rise ≈ 0.07 (under one ball radius) — visually the
      // ball stays glued to the playfield. 2.2 still showed a perceptible hop.
      // Channel 2.8 (was 3.5): hop ≤0.25, contained by the guard rails either side.
      const maxOffPlane =
        this.nudgeGraceTicks > 0 ? 6.0 : inEntry ? 7.0 : onRampSurface ? 2.8 : 1.5;
      // Table plane normal (X=0): n = (0, cosθ, sinθ), θ = atan(FLOOR_SLOPE).
      const offPlane = vy * PLANE_NY + vz * PLANE_NZ;
      const excess = offPlane - maxOffPlane;
      if (excess > 0 || xzScale < 1) {
        if (excess > 0) {
          vy -= excess * PLANE_NY;
          vz -= excess * PLANE_NZ;
        }
        this.ballBody.setLinvel({ x: vx, y: vy, z: vz }, false);
      }
    }
    if (this.nudgeGraceTicks > 0) this.nudgeGraceTicks -= 1;
    this.tickStuckWatchdog();
  }

  private tickBumperCooldowns(dt: number): void {
    for (const [handle, remaining] of this.bumperCooldown) {
      const next = remaining - dt;
      if (next <= 0) this.bumperCooldown.delete(handle);
      else this.bumperCooldown.set(handle, next);
    }
  }

  private isFlipperHandle(handle: number): boolean {
    return (
      handle === this.leftFlipper.colliderHandle || handle === this.rightFlipper.colliderHandle
    );
  }

  // Guarantee a minimum launch speed after any flipper contact.
  // Rapier computes the collision impulse from restitution + angular velocity, but on
  // grazing contacts (ball barely touching the edge) the impulse can be too small.
  // This ensures even a light touch sends the ball flying at FLIPPER_MIN_LAUNCH_SPEED.
  private applyFlipperBoost(f: FlipperBody): void {
    const vel = this.ballBody.linvel();
    const xzSpeed = Math.sqrt(vel.x * vel.x + vel.z * vel.z);
    if (xzSpeed >= FLIPPER_MIN_LAUNCH_SPEED) return;
    // Launch PERPENDICULAR to the arm face, always upfield — like the solid face of a
    // real flipper. Scaling the ball's own post-contact direction (previous version)
    // relied on restitution to have reflected it upfield first; with the dead passive
    // surface (restitution 0.3) that direction could point sideways or into the drain
    // and the boost amplified the bad direction.
    const armSign = f === this.leftFlipper ? 1 : -1; // local arm extension along X
    const ax = Math.cos(f.current) * armSign;
    const az = -Math.sin(f.current) * armSign;
    // Horizontal perpendicular of the arm axis, flipped to point upfield (nz < 0).
    let nx = -az;
    let nz = ax;
    if (nz > 0) {
      nx = -nx;
      nz = -nz;
    }
    // Blend in a bit of the ball's incoming lateral motion so shots aren't robotic,
    // then renormalise and keep the upfield component dominant.
    if (xzSpeed > 1.0) {
      nx = nx + (vel.x / xzSpeed) * 0.25;
      nz = Math.min(nz + (vel.z / xzSpeed) * 0.25, -0.5);
      const nl = Math.hypot(nx, nz);
      nx /= nl;
      nz /= nl;
    }
    this.ballBody.setLinvel(
      {
        x: nx * FLIPPER_MIN_LAUNCH_SPEED,
        y: Math.max(vel.y, 0),
        z: nz * FLIPPER_MIN_LAUNCH_SPEED,
      },
      true,
    );
  }

  private tickRampEntry(): void {
    const p = this.ballBody.translation();
    if (
      p.x > RAMP_ENTRY_ZONE.xMin &&
      p.x < RAMP_ENTRY_ZONE.xMax &&
      p.z > RAMP_ENTRY_ZONE.zMin &&
      p.z < RAMP_ENTRY_ZONE.zMax &&
      p.y < RAMP_ENTRY_ZONE.yMax
    ) {
      const v = this.ballBody.linvel();
      // Only boost when ball is actively moving field-ward into the ramp.
      // Lift over the 0.63-unit step onto the ramp floor, guarantee enough forward
      // speed that the climb can complete, and steer X toward the mouth centre line
      // (X≈-3.35): cross shots arrive with |vx|≈8 and were slamming the funnel wall
      // sideways instead of entering the narrow mouth.
      if (v.z < -1.5) {
        const vz = Math.min(v.z, -RAMP_ENTRY_SPEED);
        // PREDICTIVE steering: pick vx so the ball crosses the mouth centre line
        // (X=-3.35) exactly when it reaches the mouth (Z≈4.25). The previous
        // proportional form (k·error) converged asymptotically — it actively damped
        // the lateral speed of well-aimed diagonal shots and they missed the mouth
        // by ~0.15 every time.
        const timeToMouth = Math.max(0.06, (p.z - 4.25) / -vz);
        const steerX = Math.max(-8, Math.min(8, (-3.35 - p.x) / timeToMouth));
        this.ballBody.setLinvel({ x: steerX, y: Math.max(v.y, 4.0), z: vz }, true);
      }
    }
  }

  private tickRampClimb(): void {
    const p = this.ballBody.translation();
    const floorY = (8 - p.z) * FLOOR_SLOPE;
    if (
      p.x > RAMP_CLIMB_ZONE.xMin &&
      p.x < RAMP_CLIMB_ZONE.xMax &&
      p.z > RAMP_CLIMB_ZONE.zMin &&
      p.z < RAMP_CLIMB_ZONE.zMax &&
      p.y > floorY + 0.3 &&
      p.y < RAMP_CLIMB_ZONE.yMax
    ) {
      const v = this.ballBody.linvel();
      // Assist only while the ball is climbing (moving upfield). A stalled ball
      // (v.z >= 0) is left alone so it can roll back out of the ramp naturally.
      if (v.z < -0.3 && v.z > -RAMP_MIN_CLIMB_SPEED) {
        this.ballBody.setLinvel({ x: v.x, y: v.y, z: -RAMP_MIN_CLIMB_SPEED }, true);
      }
    }
  }

  private tickFlipper(f: FlipperBody, dt: number): void {
    const delta = f.target - f.current;
    if (Math.abs(delta) < 0.001) {
      // At rest — make sure angular velocity is zero so the flipper doesn't drift.
      if (f.current !== f.target) {
        f.current = f.target;
        f.body.setRotation(quatFromY(f.target), true);
      }
      f.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      return;
    }
    const step = Math.sign(delta) * Math.min(Math.abs(delta), FLIPPER_ROTATION_SPEED * dt);
    f.current += step;
    if (Math.abs(f.target - f.current) < 0.001) {
      // Reached target this frame — snap to exact angle and stop.
      f.current = f.target;
      f.body.setRotation(quatFromY(f.target), true);
      f.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    } else {
      // Still moving — set explicit angular velocity so Rapier uses it for impulse calculation.
      f.body.setAngvel({ x: 0, y: Math.sign(delta) * FLIPPER_ROTATION_SPEED, z: 0 }, true);
    }
    // Cradled-ball flip: when the ball is already RESTING on the flipper, the swing
    // produces no new collision-start event, so the launch boost in the event handler
    // never fires and the ball left at ~5 m/s. While swinging toward the active angle,
    // check the live contact pair and boost if the ball is touching.
    if (f.target === f.activeAngle) {
      const ballColl = this.world.getCollider(this.ballColliderHandle);
      const flipColl = this.world.getCollider(f.colliderHandle);
      if (ballColl && flipColl) {
        let touching = false;
        this.world.contactPair(flipColl, ballColl, () => {
          touching = true;
        });
        if (touching) {
          if (!f.swingHitCounted) {
            f.swingHitCounted = true;
            this.flipperHits += 1;
          }
          this.applyFlipperBoost(f);
        }
      }
    }
  }

  getBallPosition(): Vec3 {
    const pos = this.ballBody.translation();
    return { x: pos.x, y: pos.y, z: pos.z };
  }

  getBallSpeed(): number {
    const v = this.ballBody.linvel();
    return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  }

  resetBall(): void {
    // Same inline spawn position as init() — right plunger lane, just above the floor.
    this.ballBody.setTranslation({ x: 4.0, y: 1.0, z: 6.0 }, true);
    this.ballBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.ballBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }

  getLaneSeparatorX(): number {
    return this._laneSeparatorX;
  }

  /** Test helper: place the ball at an arbitrary position with zero velocity. */
  setBallPosition(pos: Vec3): void {
    this.ballBody.setTranslation(pos, true);
    this.ballBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.ballBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }

  applyBallImpulse(impulse: Vec3): void {
    this.ballBody.applyImpulse({ x: impulse.x, y: impulse.y, z: impulse.z }, true);
  }

  setFlipperActive(side: FlipperSide, active: boolean): void {
    const f = side === 'left' ? this.leftFlipper : this.rightFlipper;
    f.target = active ? f.activeAngle : f.restAngle;
    if (active) f.swingHitCounted = false;
  }

  consumeFlipperHits(): number {
    const n = this.flipperHits;
    this.flipperHits = 0;
    return n;
  }

  consumeBumperHits(): BumperHit[] {
    const hits = this.bumperHits;
    this.bumperHits = [];
    return hits;
  }
}
