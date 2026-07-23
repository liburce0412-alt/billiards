import { Vector3 } from "three"
import { HitEvent } from "../../events/hitevent"
import { Table } from "../../model/table"
import { offCenterLimit, R } from "../../model/physics/constants"
import { atan2 } from "../../utils/utils"
import { Pocket } from "../../model/physics/pocket"
import { PocketGeometry } from "../../view/pocketgeometry"
import { Knuckle } from "../../model/physics/knuckle"
import { TableGeometry } from "../../view/tablegeometry"
import { Ball } from "../../model/ball"
import type { BotShotContext } from "./botstrategy"

export interface SkillError {
  angle: number
  difficulty: number
}

/**
 * AimCalculator provides logic for the bot to calculate shot angles and power.
 * It uses a "ghost ball" method to determine where the cue ball should hit the target ball
 * to send it into a pocket.
 */
export class AimCalculator {
  private static readonly POCKET_INSET_FACTOR = 0.94
  private static readonly GHOST_BALL_DISTANCE_FACTOR = 2.001
  static readonly DEFAULT_SHOT_POWER = 90 * R
  static readonly MAX_SHOT_POWER = 110 * R
  private static readonly MAX_ERROR_DEGREES = [
    7.5, 6.2, 4.8, 3.5, 2.55, 0.32, 0.3, 0.28, 0.26, 0.24, 0.22,
  ]
  public readonly pockets: Vector3[]
  public readonly knuckles: Vector3[]

  constructor() {
    this.pockets = this.extractPocketPositions(PocketGeometry.pocketCenters)
    this.knuckles = this.extractPocketKnucklePositions(PocketGeometry.knuckles)
  }

  /**
   * Calculates the ideal position for the cue ball to be at the moment of impact
   * with the target ball to send it towards the best pocket.
   */
  public getAimPoint(
    cuePos: Vector3,
    targetPos: Vector3,
    pockets: Vector3[] = this.pockets
  ): Vector3 {
    const bestPocket = this.findBestPocket(cuePos, targetPos, pockets)
    return this.calculateGhostBallPos(targetPos, bestPocket)
  }

  /**
   * Adjusts pocket centers slightly inward to ensure balls don't just hit the corner.
   */
  private extractPocketPositions(pockets: Pocket[]): Vector3[] {
    return pockets.map((pocket) =>
      pocket.pos.clone().multiplyScalar(AimCalculator.POCKET_INSET_FACTOR)
    )
  }

  private extractPocketKnucklePositions(knuckles: []): Vector3[] {
    return knuckles
      .map((knuckle) => (knuckle as Knuckle).pos.clone())
      .map((pos) => {
        return pos.lerp(this.closestPocket(pos), 0.5)
      })
  }

  private closestPocket(pos) {
    return [...this.pockets].sort(
      (a, b) => pos.distanceTo(a) - pos.distanceTo(b)
    )[0]
  }

  public closestKnuckles(pos) {
    return [...this.knuckles]
      .sort((a, b) => pos.distanceTo(a) - pos.distanceTo(b))
      .slice(0, 2)
  }

  /**
   * Generates a HitEvent for a shot towards a target position.
   * angleError is an exact offset so bot shots remain deterministic in replays.
   */
  public generateShot(
    table: Table,
    angleError: number,
    power: number,
    targetPos: Vector3 = new Vector3().random(),
    spinOffset: Vector3 = new Vector3()
  ): HitEvent {
    const { cueball, cue, balls } = table
    const { aim } = cue

    aim.pos.copy(cueball.pos)
    aim.i = balls.indexOf(cueball)

    const lineTo = targetPos.clone().sub(cueball.pos)
    aim.angle = atan2(lineTo.y, lineTo.x) + angleError
    aim.power = power
    aim.offset = spinOffset

    if (cue.intersectsAnything(table, aim)) {
      aim.offset.set(0, offCenterLimit, 0)
    }

    return new HitEvent(table.serialiseHit())
  }

  /**
   * Returns a repeatable, difficulty-sensitive angular error for AI levels 1–11.
   * The level only scales the result; the sign and shot variation come from the
   * table state, so stronger levels are always more accurate for the same shot.
   */
  public skillError(
    context: BotShotContext,
    target: Ball,
    destination?: Vector3
  ): SkillError {
    const tableDiagonal = Math.hypot(
      TableGeometry.tableX * 2,
      TableGeometry.tableY * 2
    )
    const targetDestination =
      destination ??
      (this.pockets.length > 0
        ? this.findBestPocket(context.cueBall.pos, target.pos, this.pockets)
        : undefined)
    const cueDistance = Math.min(
      1,
      context.cueBall.pos.distanceTo(target.pos) / tableDiagonal
    )
    const objectDistance = targetDestination
      ? Math.min(1, target.pos.distanceTo(targetDestination) / tableDiagonal)
      : 0.65
    const cut = targetDestination
      ? Math.min(
          1,
          this.calculateCutScore(
            context.cueBall.pos,
            target.pos,
            targetDestination
          )
        )
      : 0.55
    const railDistance = Math.min(
      TableGeometry.tableX - Math.abs(target.pos.x),
      TableGeometry.tableY - Math.abs(target.pos.y)
    )
    const nearRail = railDistance < 4 * R ? 1 : 0
    const blocked = context.table.balls.some((ball) => {
      if (ball === context.cueBall || ball === target || !ball.onTable()) {
        return false
      }
      const shotLine = target.pos.clone().sub(context.cueBall.pos)
      const lengthSquared = shotLine.lengthSq()
      if (lengthSquared === 0) return true
      const projection =
        ball.pos.clone().sub(context.cueBall.pos).dot(shotLine) / lengthSquared
      if (projection <= 0 || projection >= 1) return false
      const closest = context.cueBall.pos
        .clone()
        .addScaledVector(shotLine, projection)
      return closest.distanceTo(ball.pos) < 2.2 * R
    })
      ? 1
      : 0

    let difficulty =
      0.08 +
      cueDistance * 0.2 +
      objectDistance * 0.18 +
      cut * 0.5 +
      nearRail * 0.12 +
      blocked * 0.18
    if (context.ruleName === "fourball") difficulty *= 1.18
    if (context.ruleName === "threecushion" || context.ruleName === "sagu") {
      difficulty *= 1.15
    }
    difficulty = Math.max(0.08, Math.min(1, difficulty))

    const variation = this.deterministicUnit(context, target, "angle")
    const direction =
      this.deterministicUnit(context, target, "direction") < 0.5 ? -1 : 1
    const level = Math.max(1, Math.min(11, Math.round(context.level)))
    const maxDegrees = AimCalculator.MAX_ERROR_DEGREES[level - 1]
    const magnitude = (0.3 + variation * 0.7) * difficulty
    return {
      angle: direction * ((maxDegrees * magnitude * Math.PI) / 180),
      difficulty,
    }
  }

  private deterministicUnit(
    context: BotShotContext,
    target: Ball,
    salt: string
  ): number {
    const ballState = context.table.balls
      .map(
        (ball) =>
          `${ball.id}:${Math.round(ball.pos.x * 10000)}:${Math.round(
            ball.pos.y * 10000
          )}:${ball.onTable() ? 1 : 0}`
      )
      .join("|")
    const value = `${context.ruleName}|${context.shotIndex}|${target.id}|${salt}|${ballState}`
    let hash = 2166136261
    for (let i = 0; i < value.length; i++) {
      hash ^= value.charCodeAt(i)
      hash = Math.imul(hash, 16777619)
    }
    return (hash >>> 0) / 4294967295
  }

  /**
   * Finds the pocket that requires the smallest cut angle for the given shot.
   */
  public findBestPocket(
    cuePos: Vector3,
    targetPos: Vector3,
    pockets: Vector3[]
  ): Vector3 {
    return pockets
      .map((p) => ({
        pocket: p,
        score: this.calculateCutScore(cuePos, targetPos, p),
      }))
      .sort((a, b) => a.score - b.score)[0].pocket
  }

  /**
   * Calculates a score based on the cut angle.
   */
  private calculateCutScore(
    cuePos: Vector3,
    targetPos: Vector3,
    pocket: Vector3
  ): number {
    const shotLine = this.getDirectionVector(cuePos, targetPos)
    const pocketLine = this.getDirectionVector(targetPos, pocket)
    return 1 - shotLine.dot(pocketLine)
  }

  /**
   * Calculates the position where the cue ball should be to hit the target ball towards the pocket.
   */
  private calculateGhostBallPos(targetPos: Vector3, pocket: Vector3): Vector3 {
    const incidentVector = this.getDirectionVector(pocket, targetPos)
    return targetPos
      .clone()
      .add(
        incidentVector.multiplyScalar(
          R * AimCalculator.GHOST_BALL_DISTANCE_FACTOR
        )
      )
  }

  private getDirectionVector(from: Vector3, to: Vector3): Vector3 {
    return new Vector3().subVectors(to, from).normalize()
  }

  /**
   * @param pos Current position of the moving ball
   * @param vel Velocity vector of the moving ball
   * @param target Center position of the stationary ball
   */
  static checkCollision(pos: Vector3, vel: Vector3, target: Vector3): boolean {
    // 1. Vector from moving ball to target
    const toTarget = new Vector3().subVectors(target, pos)

    // 2. Project toTarget onto the velocity vector to find the closest point's distance along the path
    const velNormalized = vel.clone().normalize()
    const dParallel = toTarget.dot(velNormalized)

    // 3. If dParallel is negative, the target is "behind" the moving ball
    if (dParallel < 0) return false

    // 4. Calculate the perpendicular distance squared using the Pythagorean theorem:
    // distSq = |toTarget|^2 - dParallel^2
    const distSq = toTarget.lengthSq() - dParallel * dParallel

    // 5. Collision occurs if the closest distance is within the combined radii
    return distSq <= 2 * R * 2 * R
  }

  static ghostBallPosition(
    cue: Vector3,
    target: Vector3,
    overlap: number
  ): Vector3 {
    const baseAngle = Math.atan2(cue.y - target.y, cue.x - target.x)
    const offsetAngle = Math.asin(1 - Math.abs(overlap)) * Math.sign(overlap)
    const angle = baseAngle + offsetAngle
    return new Vector3(
      target.x + Math.cos(angle) * 2 * R,
      target.y + Math.sin(angle) * 2 * R,
      0
    )
  }
  /**
   * Returns the distance to the nearest table corner.
   */
  static cornerDistance(pos: Vector3): number {
    const x = TableGeometry.X
    const y = TableGeometry.Y
    return Math.min(
      pos.distanceTo(new Vector3(-x, y, 0)),
      pos.distanceTo(new Vector3(x, y, 0)),
      pos.distanceTo(new Vector3(-x, -y, 0)),
      pos.distanceTo(new Vector3(x, -y, 0))
    )
  }

  /**
   * Finds the ball closest to any corner.
   */
  static findAnchor(balls: Ball[]): Ball {
    return [...balls].sort(
      (a, b) =>
        AimCalculator.cornerDistance(a.pos) -
        AimCalculator.cornerDistance(b.pos)
    )[0]
  }

  /**
   * Calculates the tangent vector (exit vector) of the cue ball after impact.
   */
  static getTangentVector(
    cue: Vector3,
    target: Vector3,
    ghost: Vector3
  ): Vector3 {
    let tx = -(ghost.y - target.y)
    let ty = ghost.x - target.x
    if (tx * (ghost.x - cue.x) + ty * (ghost.y - cue.y) < 0) {
      tx = -tx
      ty = -ty
    }
    return new Vector3(tx, ty, 0).normalize()
  }

  /**
   * Returns the Y-coordinate of the long rail closest to the given position.
   */
  static getActiveRailY(pos: Vector3): number {
    return Math.abs(pos.y - TableGeometry.Y) < Math.abs(pos.y + TableGeometry.Y)
      ? TableGeometry.Y
      : -TableGeometry.Y
  }

  /**
   * Returns true if the tangent vector points towards the specified rail.
   */
  static isHeadingToRail(
    ghost: Vector3,
    tangent: Vector3,
    railY: number
  ): boolean {
    return (railY - ghost.y) * tangent.y > 0
  }

  /**
   * Calculates a score based on how much the tangent vector points towards the anchor ball.
   * Lower scores mean pointing "more away".
   */
  static getNaturalLongScore(
    tangent: Vector3,
    ghost: Vector3,
    anchor: Vector3
  ): number {
    const toAnchor = new Vector3().subVectors(anchor, ghost).normalize()
    return tangent.dot(toAnchor)
  }

  /**
   * Returns true if clockwise spin (running side) is needed based on incident vector and cushion normal.
   */
  static isClockwiseSpin(v: Vector3, n: Vector3): boolean {
    return new Vector3().crossVectors(v, n).z > 0
  }
}
