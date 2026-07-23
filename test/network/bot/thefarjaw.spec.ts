import { Vector3 } from "three"
import { Ball } from "../../../src/model/ball"
import { Table } from "../../../src/model/table"
import { AimCalculator } from "../../../src/network/bot/aimcalculator"
import { BotShotContext } from "../../../src/network/bot/botstrategy"
import { TheFarJaw } from "../../../src/network/bot/strategies/thefarjaw"
import { ClawBreak } from "../../../src/network/bot/strategies/clawbreak"
import { HitEvent } from "../../../src/events/hitevent"

describe("TheFarJaw", () => {
  it("hits a routine straight pot at the pocket center", () => {
    Ball.id = 0
    const cueBall = new Ball(new Vector3(0, 0, 0))
    const target = new Ball(new Vector3(0, 0.4, 0), 1)
    const table = new Table([cueBall, target])
    const context: BotShotContext = {
      table,
      cueBall,
      validTargetBalls: [target],
      ballInHand: false,
      ruleName: "eightball",
      shotIndex: 1,
      level: 6,
    }

    const events = new TheFarJaw().aim(context, new AimCalculator())
    const hit = events.at(-1) as HitEvent

    expect(events).toHaveLength(2)
    expect(hit.tablejson.aim.power).toBeLessThan(
      AimCalculator.DEFAULT_SHOT_POWER
    )
    expect(hit.tablejson.aim.power).toBeGreaterThan(0)
  })

  it("uses full power for an opening break", () => {
    Ball.id = 0
    const cueBall = new Ball(new Vector3(0, -0.8, 0))
    const target = new Ball(new Vector3(0, 0.25, 0), 1)
    const table = new Table([cueBall, target])
    const context: BotShotContext = {
      table,
      cueBall,
      validTargetBalls: [target],
      ballInHand: false,
      ruleName: "nineball",
      shotIndex: 0,
      level: 11,
    }

    const events = new TheFarJaw().aim(context, new AimCalculator())
    const hit = events.at(-1) as HitEvent

    expect(hit.tablejson.aim.power).toBe(AimCalculator.MAX_SHOT_POWER)
  })

  it("chooses a clear pocket route instead of shooting through another ball", () => {
    Ball.id = 0
    const cueBall = new Ball(new Vector3(0, -0.8, 0))
    const target = new Ball(new Vector3(0, 0, 0), 1)
    const blocker = new Ball(new Vector3(0, 0.5, 0), 2)
    const table = new Table([cueBall, target, blocker])
    const calculator = new AimCalculator()
    const blockedPocket = new Vector3(0, 1.2, 0)
    const clearPocket = new Vector3(1.2, 0.8, 0)
    calculator.pockets.splice(
      0,
      calculator.pockets.length,
      blockedPocket,
      clearPocket
    )
    const context: BotShotContext = {
      table,
      cueBall,
      validTargetBalls: [target],
      ballInHand: false,
      ruleName: "eightball",
      shotIndex: 2,
      level: 11,
    }

    const events = new TheFarJaw().aim(context, calculator)
    const hit = events.at(-1) as HitEvent
    const clearAimPoint = calculator.getAimPoint(cueBall.pos, target.pos, [
      clearPocket,
    ])
    const blockedAimPoint = calculator.getAimPoint(cueBall.pos, target.pos, [
      blockedPocket,
    ])
    const angleTo = (point: Vector3) =>
      Math.atan2(point.y - cueBall.pos.y, point.x - cueBall.pos.x)
    const angleDistance = (a: number, b: number) =>
      Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)))

    expect(
      angleDistance(hit.tablejson.aim.angle, angleTo(clearAimPoint))
    ).toBeLessThan(
      angleDistance(hit.tablejson.aim.angle, angleTo(blockedAimPoint))
    )
  })

  it("separates high levels through cue-ball position control", () => {
    const shotForLevel = (level: number, ruleName = "eightball") => {
      Ball.id = 0
      const cueBall = new Ball(new Vector3(0, -0.4, 0))
      const target = new Ball(new Vector3(0, 0.2, 0), 1)
      const nextTarget = new Ball(new Vector3(0.55, 0.55, 0), 2)
      const table = new Table([cueBall, target, nextTarget])
      const context: BotShotContext = {
        table,
        cueBall,
        validTargetBalls:
          ruleName === "nineball" ? [target] : [target, nextTarget],
        ballInHand: false,
        ruleName,
        shotIndex: 2,
        level,
      }
      const events = new TheFarJaw().aim(context, new AimCalculator())
      return (events.at(-1) as HitEvent).tablejson.aim
    }

    const level6 = shotForLevel(6)
    const level11 = shotForLevel(11)

    expect(level6.offset.lengthSq()).toBe(0)
    expect(level11.offset.lengthSq()).toBeGreaterThan(0)
    expect(level11.power).toBeGreaterThan(0)
    expect(level11.power).toBeLessThanOrEqual(AimCalculator.MAX_SHOT_POWER)

    const orderedLevel11 = shotForLevel(11, "nineball")
    expect(orderedLevel11.offset.lengthSq()).toBeGreaterThan(0)
  })

  it("uses legal escape routes instead of striking a blocker", () => {
    const shotFor = (level: number) => {
      Ball.id = 0
      const cueBall = new Ball(new Vector3(0, -0.72, 0))
      const target = new Ball(new Vector3(0, 0.34, 0), 1)
      const blocker = new Ball(new Vector3(0, -0.18, 0), 2)
      const table = new Table([cueBall, target, blocker])
      const context: BotShotContext = {
        table,
        cueBall,
        validTargetBalls: [target],
        ballInHand: false,
        ruleName: "nineball",
        shotIndex: 3,
        level,
      }
      const strategy = level >= 6 ? new TheFarJaw() : new ClawBreak()
      const events = strategy.aim(context, new AimCalculator())
      return { hit: events.at(-1) as HitEvent, cueBall, blocker }
    }

    ;[3, 11].forEach((level) => {
      const { hit, cueBall, blocker } = shotFor(level)
      const direction = new Vector3(
        Math.cos(hit.tablejson.aim.angle),
        Math.sin(hit.tablejson.aim.angle),
        0
      )
      expect(
        AimCalculator.checkCollision(cueBall.pos, direction, blocker.pos)
      ).toBe(false)
    })
  })
})
