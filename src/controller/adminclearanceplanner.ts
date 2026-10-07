import { Vector3 } from "three"
import { HitEvent } from "../events/hitevent"
import type { Ball } from "../model/ball"
import { maxPower, R } from "../model/physics/constants"
import { AimCalculator } from "../network/bot/aimcalculator"
import type { BotShotContext } from "../network/bot/botstrategy"
import { TableGeometry } from "../view/tablegeometry"

export interface AdminClearanceCandidate {
  target: Ball
  pocket: Vector3
  aimPoint: Vector3
  power: number
  spin: Vector3
  score: number
}

const POWER_SCALES = [0.78, 0.88, 0.98, 1.08, 1.16]
const SPIN_Y = [-0.34, -0.17, 0, 0.17, 0.34]

function remainingTargets(context: BotShotContext, target: Ball): Ball[] {
  const current = context.validTargetBalls.filter((ball) => ball !== target)
  if (current.length > 0) return current
  const remaining = context.table.balls
    .filter(
      (ball) => ball !== context.cueBall && ball !== target && ball.onTable()
    )
    .sort((a, b) => (a.label ?? 0) - (b.label ?? 0))
  if (context.ruleName === "nineball" || context.ruleName === "fourball") {
    return remaining.slice(0, 1)
  }
  if (context.ruleName === "eightball") {
    return remaining.filter((ball) => ball.label === 8).slice(0, 1)
  }
  return []
}

function predictedCuePosition(
  context: BotShotContext,
  target: Ball,
  pocket: Vector3,
  aimPoint: Vector3,
  power: number,
  spinY: number
): Vector3 {
  const tangent = AimCalculator.getTangentVector(
    context.cueBall.pos,
    target.pos,
    aimPoint
  )
  const powerRatio = maxPower > 0 ? power / maxPower : 0
  const predicted = target.pos
    .clone()
    .addScaledVector(tangent, R * (3.8 + powerRatio * 6.2))
  if (spinY > 0) {
    predicted.addScaledVector(
      pocket.clone().sub(target.pos).normalize(),
      spinY * 14 * R
    )
  } else if (spinY < 0) {
    predicted.addScaledVector(
      context.cueBall.pos.clone().sub(target.pos).normalize(),
      -spinY * 14 * R
    )
  }
  return predicted.clamp(
    new Vector3(
      -TableGeometry.tableX + 2.2 * R,
      -TableGeometry.tableY + 2.2 * R,
      0
    ),
    new Vector3(
      TableGeometry.tableX - 2.2 * R,
      TableGeometry.tableY - 2.2 * R,
      0
    )
  )
}

function routeScore(
  context: BotShotContext,
  calculator: AimCalculator,
  cuePosition: Vector3,
  remaining: Ball[],
  removedTarget: Ball
): number {
  if (remaining.length === 0) return 0
  const diagonal = Math.hypot(
    TableGeometry.tableX * 2,
    TableGeometry.tableY * 2
  )
  return Math.min(
    ...remaining.flatMap((next) =>
      calculator.pockets.map((pocket) => {
        const aimPoint = calculator.getAimPoint(cuePosition, next.pos, [pocket])
        const blockedCue = calculator.pathBlocked(
          context.table,
          cuePosition,
          aimPoint,
          [context.cueBall, next, removedTarget]
        )
        const blockedObject = calculator.pathBlocked(
          context.table,
          next.pos,
          pocket,
          [context.cueBall, next, removedTarget]
        )
        const alignment = next.pos
          .clone()
          .sub(cuePosition)
          .normalize()
          .dot(pocket.clone().sub(next.pos).normalize())
        return (
          cuePosition.distanceTo(next.pos) / diagonal +
          next.pos.distanceTo(pocket) / diagonal / 2 +
          Number(blockedCue) * 1.4 +
          Number(blockedObject) * 1.8 +
          Math.max(0, 0.18 - alignment) * 4
        )
      })
    )
  )
}

/** Enumerates a broad deterministic search only used by level 11 assistance. */
export function enumerateAdminClearanceCandidates(
  context: BotShotContext,
  calculator: AimCalculator
): AdminClearanceCandidate[] {
  if (!TableGeometry.hasPockets) return []
  const diagonal = Math.hypot(
    TableGeometry.tableX * 2,
    TableGeometry.tableY * 2
  )
  const candidates: AdminClearanceCandidate[] = []

  for (const target of context.validTargetBalls) {
    for (const pocket of calculator.pockets) {
      const aimPoint = calculator.getAimPoint(context.cueBall.pos, target.pos, [
        pocket,
      ])
      const cueBlocked = calculator.pathBlocked(
        context.table,
        context.cueBall.pos,
        aimPoint,
        [context.cueBall, target]
      )
      const objectBlocked = calculator.pathBlocked(
        context.table,
        target.pos,
        pocket,
        [context.cueBall, target]
      )
      const cueDirection = target.pos
        .clone()
        .sub(context.cueBall.pos)
        .normalize()
      const pocketDirection = pocket.clone().sub(target.pos).normalize()
      const alignment = cueDirection.dot(pocketDirection)
      if (cueBlocked || objectBlocked || alignment <= 0.04) continue

      const distance =
        context.cueBall.pos.distanceTo(target.pos) +
        target.pos.distanceTo(pocket)
      const assistPowerCeiling = Math.min(
        maxPower,
        Math.max(AimCalculator.MAX_SHOT_POWER, maxPower * 0.62)
      )
      const basePower = Math.min(
        assistPowerCeiling,
        Math.max(
          AimCalculator.DEFAULT_SHOT_POWER,
          maxPower * (0.28 + (distance / diagonal) * 0.22)
        )
      )
      const remaining = remainingTargets(context, target)

      for (const powerScale of POWER_SCALES) {
        for (const spinY of SPIN_Y) {
          const power = Math.min(
            assistPowerCeiling,
            Math.max(AimCalculator.DEFAULT_SHOT_POWER, basePower * powerScale)
          )
          const predicted = predictedCuePosition(
            context,
            target,
            pocket,
            aimPoint,
            power,
            spinY
          )
          const clearance = Math.min(
            TableGeometry.tableX - Math.abs(predicted.x),
            TableGeometry.tableY - Math.abs(predicted.y)
          )
          const pocketRisk = calculator.pockets.some(
            (candidate) => predicted.distanceTo(candidate) < 3.2 * R
          )
          candidates.push({
            target,
            pocket,
            aimPoint,
            power,
            spin: new Vector3(0, spinY, 0),
            score:
              calculator.skillError(context, target, pocket).difficulty * 0.46 +
              routeScore(context, calculator, predicted, remaining, target) *
                0.54 +
              Math.max(0, 4 * R - clearance) * 2.5 +
              Number(pocketRisk) * 0.34 +
              Math.abs(powerScale - 1) * 0.025,
          })
        }
      }
    }
  }

  return candidates.sort(
    (a, b) =>
      a.score - b.score ||
      a.target.id - b.target.id ||
      a.pocket.x - b.pocket.x ||
      a.pocket.y - b.pocket.y ||
      a.power - b.power ||
      a.spin.y - b.spin.y
  )
}

export function planAdminClearanceShot(
  context: BotShotContext,
  calculator: AimCalculator
): HitEvent | undefined {
  const candidate = enumerateAdminClearanceCandidates(context, calculator)[0]
  if (!candidate) return undefined
  return calculator.generateShot(
    context.table,
    0,
    candidate.power,
    candidate.aimPoint,
    candidate.spin
  )
}
