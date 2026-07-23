import { AimEvent } from "../../../events/aimevent"
import { GameEvent } from "../../../events/gameevent"
import { Ball } from "../../../model/ball"
import { R } from "../../../model/physics/constants"
import { Vector3 } from "three"
import { Respot } from "../../../utils/respot"
import { AimCalculator } from "../aimcalculator"
import { BotShotContext, BotStrategy } from "../botstrategy"
import { TableGeometry } from "../../../view/tablegeometry"
import { ThreeStrategy } from "./threecushionstrategy"

interface PositionPlan {
  power: number
  spin: Vector3
  score: number
}

interface PlannedShot {
  target: Ball
  pocket: Vector3
  aimPoint: Vector3
  difficulty: number
  blockedSegments: number
  position: PositionPlan
}

export class TheFarJaw implements BotStrategy {
  readonly name = "TheFarJaw"

  aim(context: BotShotContext, calculator: AimCalculator): GameEvent[] {
    if (!TableGeometry.hasPockets) {
      return new ThreeStrategy(AimCalculator.MAX_SHOT_POWER).aim(
        context,
        calculator
      )
    }

    const shot = this.pickShot(context, calculator)
    if (!shot) return []

    const error = calculator.skillError(context, shot.target, shot.pocket).angle
    const hitEvent = calculator.generateShot(
      context.table,
      error,
      shot.position.power,
      shot.aimPoint,
      shot.position.spin
    )
    return [AimEvent.fromJson(hitEvent.tablejson.aim), hitEvent]
  }

  private pickShot(
    context: BotShotContext,
    calculator: AimCalculator
  ): PlannedShot | undefined {
    if (context.validTargetBalls.length === 0) return undefined

    if (context.table.proximityEnabled) {
      const target = Respot.furthest(context.cueBall, context.validTargetBalls)
      const pocket = target
        ? calculator.findBestPocket(
            context.cueBall.pos,
            target.pos,
            calculator.pockets
          )
        : undefined
      return target && pocket
        ? this.planShot(context, calculator, target, pocket)
        : undefined
    }

    const positionWeight = ((context.level - 6) / 5) * 0.46
    return context.validTargetBalls
      .flatMap((target) =>
        calculator.pockets.map((pocket) =>
          this.planShot(context, calculator, target, pocket)
        )
      )
      .sort((a, b) => {
        const aScore =
          a.difficulty * (1 - positionWeight) +
          a.position.score * positionWeight
        const bScore =
          b.difficulty * (1 - positionWeight) +
          b.position.score * positionWeight
        return (
          a.blockedSegments - b.blockedSegments ||
          aScore - bScore ||
          a.target.id - b.target.id ||
          a.pocket.x - b.pocket.x ||
          a.pocket.y - b.pocket.y
        )
      })[0]
  }

  private planShot(
    context: BotShotContext,
    calculator: AimCalculator,
    target: Ball,
    pocket: Vector3
  ): PlannedShot {
    const aimPoint = calculator.getAimPoint(context.cueBall.pos, target.pos, [
      pocket,
    ])
    const cuePathBlocked = this.pathBlocked(
      context,
      context.cueBall.pos,
      aimPoint,
      target
    )
    const objectPathBlocked = this.pathBlocked(
      context,
      target.pos,
      pocket,
      target
    )
    const blockedSegments = Number(cuePathBlocked) + Number(objectPathBlocked)
    const cueDirection = target.pos.clone().sub(context.cueBall.pos).normalize()
    const pocketDirection = pocket.clone().sub(target.pos).normalize()
    const alignment = cueDirection.dot(pocketDirection)
    let impossibleCutPenalty = 0
    if (alignment <= 0) {
      impossibleCutPenalty = 2
    } else if (alignment < 0.15) {
      impossibleCutPenalty = 0.4
    }
    const difficulty =
      calculator.skillError(context, target, pocket).difficulty +
      blockedSegments * 0.8 +
      impossibleCutPenalty
    return {
      target,
      pocket,
      aimPoint,
      difficulty,
      blockedSegments,
      position: this.positionPlan(
        context,
        calculator,
        target,
        pocket,
        aimPoint,
        difficulty
      ),
    }
  }

  private positionPlan(
    context: BotShotContext,
    calculator: AimCalculator,
    target: Ball,
    pocket: Vector3,
    aimPoint: Vector3,
    difficulty: number
  ): PositionPlan {
    const remaining = this.positionTargets(context, target)
    const basePower = this.shotPower(context, target, pocket, difficulty)
    if (context.level <= 6 || remaining.length === 0) {
      return {
        power: basePower,
        spin: new Vector3(),
        score: remaining.length === 0 ? 0 : 0.65,
      }
    }

    const spinLimit = Math.min(0.36, 0.08 + (context.level - 7) * 0.07)
    const spinOptions =
      context.level === 7
        ? [-spinLimit, 0, spinLimit]
        : [-spinLimit, -spinLimit / 2, 0, spinLimit / 2, spinLimit]
    const tableDiagonal = Math.hypot(
      TableGeometry.tableX * 2,
      TableGeometry.tableY * 2
    )
    let powerScales = [1]
    if (context.level >= 9) {
      powerScales = [0.88, 1, 1.12]
    } else if (context.level >= 8) {
      powerScales = [0.94, 1.06]
    }

    return powerScales
      .flatMap((powerScale) =>
        spinOptions.map((spinY) => {
          const power = Math.min(
            AimCalculator.MAX_SHOT_POWER,
            Math.max(44 * R, basePower * powerScale)
          )
          const predicted = this.estimateCuePosition(
            context,
            target,
            pocket,
            aimPoint,
            spinY,
            power
          )
          const nextRouteScore = Math.min(
            ...remaining.map((ball) => {
              const nextPocket = calculator.findBestPocket(
                predicted,
                ball.pos,
                calculator.pockets
              )
              const nextAimPoint = calculator.getAimPoint(predicted, ball.pos, [
                nextPocket,
              ])
              const blocked = this.pathBlocked(
                context,
                predicted,
                nextAimPoint,
                ball
              )
              return (
                predicted.distanceTo(ball.pos) / tableDiagonal +
                (blocked ? 0.32 : 0)
              )
            })
          )
          const railClearance = Math.min(
            TableGeometry.tableX - Math.abs(predicted.x),
            TableGeometry.tableY - Math.abs(predicted.y)
          )
          const railPenalty = railClearance < 4 * R ? 0.18 : 0
          return {
            power,
            spin: new Vector3(0, spinY, 0),
            score:
              nextRouteScore + railPenalty + Math.abs(powerScale - 1) * 0.025,
          }
        })
      )
      .sort(
        (a, b) => a.score - b.score || a.spin.lengthSq() - b.spin.lengthSq()
      )[0]
  }

  private shotPower(
    context: BotShotContext,
    target: Ball,
    pocket: Vector3,
    difficulty: number
  ): number {
    if (context.shotIndex === 0) {
      return AimCalculator.MAX_SHOT_POWER
    }
    const tableDiagonal = Math.hypot(
      TableGeometry.tableX * 2,
      TableGeometry.tableY * 2
    )
    const shotDistance =
      context.cueBall.pos.distanceTo(target.pos) + target.pos.distanceTo(pocket)
    const distanceFactor = Math.min(1, shotDistance / tableDiagonal)
    const difficultyBoost = Math.max(0, Math.min(1, difficulty) - 0.45) * 18
    const powerInRadii = 48 + distanceFactor * 38 + difficultyBoost
    return Math.min(98 * R, Math.max(48 * R, powerInRadii * R))
  }

  private positionTargets(context: BotShotContext, target: Ball): Ball[] {
    const currentGroup = context.validTargetBalls.filter(
      (ball) => ball !== target
    )
    if (currentGroup.length > 0) return currentGroup

    const ballsAfterPot = context.table.balls.filter(
      (ball) => ball !== context.cueBall && ball !== target && ball.onTable()
    )
    if (context.ruleName === "nineball" || context.ruleName === "fourball") {
      return ballsAfterPot
        .sort((a, b) => (a.label ?? 0) - (b.label ?? 0))
        .slice(0, 1)
    }
    if (context.ruleName === "eightball") {
      return ballsAfterPot.filter((ball) => ball.label === 8).slice(0, 1)
    }
    return []
  }

  private estimateCuePosition(
    context: BotShotContext,
    target: Ball,
    pocket: Vector3,
    aimPoint: Vector3,
    spinY: number,
    power: number
  ): Vector3 {
    const tangent = AimCalculator.getTangentVector(
      context.cueBall.pos,
      target.pos,
      aimPoint
    )
    const travelScale = 4 + (power / AimCalculator.MAX_SHOT_POWER) * 5
    const predicted = target.pos
      .clone()
      .addScaledVector(tangent, travelScale * R)
    if (spinY > 0) {
      predicted.addScaledVector(
        pocket.clone().sub(target.pos).normalize(),
        spinY * 12 * R
      )
    } else if (spinY < 0) {
      predicted.addScaledVector(
        context.cueBall.pos.clone().sub(target.pos).normalize(),
        -spinY * 12 * R
      )
    }
    return predicted.clamp(
      new Vector3(
        -TableGeometry.tableX + 2 * R,
        -TableGeometry.tableY + 2 * R,
        0
      ),
      new Vector3(TableGeometry.tableX - 2 * R, TableGeometry.tableY - 2 * R, 0)
    )
  }

  private pathBlocked(
    context: BotShotContext,
    from: Vector3,
    to: Vector3,
    target: Ball
  ): boolean {
    const line = to.clone().sub(from)
    const lengthSquared = line.lengthSq()
    if (lengthSquared === 0) return true
    return context.table.balls.some((ball) => {
      if (ball === context.cueBall || ball === target || !ball.onTable()) {
        return false
      }
      const projection = ball.pos.clone().sub(from).dot(line) / lengthSquared
      if (projection <= 0 || projection >= 1) return false
      const closest = from.clone().addScaledVector(line, projection)
      return closest.distanceTo(ball.pos) < 2.2 * R
    })
  }
}
