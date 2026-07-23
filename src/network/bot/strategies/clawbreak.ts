import { AimEvent } from "../../../events/aimevent"
import { GameEvent } from "../../../events/gameevent"
import { Ball } from "../../../model/ball"
import { Respot } from "../../../utils/respot"
import { zero } from "../../../utils/three-utils"
import { AimCalculator } from "../aimcalculator"
import { BotShotContext, BotStrategy } from "../botstrategy"
import { TableGeometry } from "../../../view/tablegeometry"
import { ThreeStrategy } from "./threecushionstrategy"

export class ClawBreak implements BotStrategy {
  readonly name = "ClawBreak"

  aim(context: BotShotContext, calculator: AimCalculator): GameEvent[] {
    if (!TableGeometry.hasPockets) {
      return new ThreeStrategy(AimCalculator.DEFAULT_SHOT_POWER).aim(
        context,
        calculator
      )
    }

    const targetBall = this.pickTargetBall(context)
    const targetPoint = targetBall?.pos ?? zero
    const destination = targetBall
      ? calculator.findBestPocket(
          context.cueBall.pos,
          targetPoint,
          calculator.pockets
        )
      : undefined
    const directAimPoint = calculator.getAimPoint(
      context.cueBall.pos,
      targetPoint,
      destination ? [destination] : undefined
    )
    const directBlocked =
      targetBall &&
      calculator.pathBlocked(
        context.table,
        context.cueBall.pos,
        directAimPoint,
        [context.cueBall, targetBall]
      )
    const escape = directBlocked
      ? calculator.findLegalEscape(context)
      : undefined
    const shotTarget = escape?.target ?? targetBall
    const shotDestination = escape?.aimPoint ?? destination
    const escapeErrorScale = escape ? 1.12 : 1
    const error = shotTarget
      ? calculator.skillError(context, shotTarget, shotDestination).angle *
        escapeErrorScale
      : 0
    const hitEvent = calculator.generateShot(
      context.table,
      error,
      escape?.power ?? AimCalculator.DEFAULT_SHOT_POWER,
      escape?.aimPoint ?? directAimPoint,
      zero
    )
    const aimEvent = AimEvent.fromJson(hitEvent.tablejson.aim)
    return [aimEvent, hitEvent]
  }

  private pickTargetBall(context: BotShotContext): Ball | undefined {
    if (context.validTargetBalls.length === 0) {
      return undefined
    }

    if (context.table.proximityEnabled) {
      return Respot.furthest(context.cueBall, context.validTargetBalls)
    }

    return Respot.closest(context.cueBall, context.validTargetBalls)
  }
}
