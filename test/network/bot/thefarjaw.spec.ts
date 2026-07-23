import { Vector3 } from "three"
import { Ball } from "../../../src/model/ball"
import { Table } from "../../../src/model/table"
import { AimCalculator } from "../../../src/network/bot/aimcalculator"
import { BotShotContext } from "../../../src/network/bot/botstrategy"
import { TheFarJaw } from "../../../src/network/bot/strategies/thefarjaw"
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
    expect(hit.tablejson.aim.power).toBe(AimCalculator.DEFAULT_SHOT_POWER)
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
    expect(level11.power).not.toBe(level6.power)

    const orderedLevel11 = shotForLevel(11, "nineball")
    expect(orderedLevel11.offset.lengthSq()).toBeGreaterThan(0)
  })
})
