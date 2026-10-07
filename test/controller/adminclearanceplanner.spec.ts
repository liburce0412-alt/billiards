import { Vector3 } from "three"
import {
  enumerateAdminClearanceCandidates,
  planAdminClearanceShot,
} from "../../src/controller/adminclearanceplanner"
import { Ball } from "../../src/model/ball"
import { Table } from "../../src/model/table"
import { AimCalculator } from "../../src/network/bot/aimcalculator"
import type { BotShotContext } from "../../src/network/bot/botstrategy"
import { TableGeometry } from "../../src/view/tablegeometry"

describe("administrator level 11 clearance planner", () => {
  beforeEach(() => {
    Ball.id = 0
    TableGeometry.hasPockets = true
  })

  function fixture(): {
    context: BotShotContext
    calculator: AimCalculator
  } {
    const cueBall = new Ball(new Vector3(-0.55, 0, 0), 0xffffff, 0)
    const target = new Ball(new Vector3(0.15, 0, 0), 0xff0000, 1)
    const table = new Table([cueBall, target])
    return {
      calculator: new AimCalculator(),
      context: {
        table,
        cueBall,
        validTargetBalls: [target],
        ballInHand: false,
        ruleName: "nineball",
        shotIndex: 2,
        level: 11,
      },
    }
  }

  it("searches many power, spin and pocket combinations", () => {
    const { context, calculator } = fixture()
    const candidates = enumerateAdminClearanceCandidates(context, calculator)

    expect(candidates.length).toBeGreaterThanOrEqual(48)
    expect(
      new Set(candidates.map((candidate) => candidate.power)).size
    ).toBeGreaterThanOrEqual(3)
    expect(new Set(candidates.map((candidate) => candidate.spin.y)).size).toBe(
      5
    )
  })

  it("returns a deterministic legal shot", () => {
    const { context, calculator } = fixture()
    const first = planAdminClearanceShot(context, calculator)!
    const second = planAdminClearanceShot(context, calculator)!

    expect(first.tablejson.aim.angle).toBe(second.tablejson.aim.angle)
    expect(first.tablejson.aim.power).toBe(second.tablejson.aim.power)
    expect(first.tablejson.aim.power).toBeGreaterThan(0)
    expect(Number.isFinite(first.tablejson.aim.angle)).toBe(true)
  })
})
