import { expect } from "chai"
import { OutcomeType } from "../../src/model/outcome"
import { simulateShotSync } from "../../src/model/shotsimulator"

describe("ShotSimulator", () => {
  const input = {
    ruleType: "eightball",
    balls: [
      { id: 0, pos: { x: -0.5, y: 0 }, onTable: true },
      { id: 1, pos: { x: 0, y: 0 }, onTable: true },
    ],
    cushionModel: "stronge" as const,
    shot: {
      cueBallId: 0,
      angle: 0,
      power: 2.2,
      offset: { x: 0, y: 0 },
      elevation: 0,
    },
    recordTrajectory: false,
  }

  it("uses the fixed 1/512 physics path and returns final state", () => {
    const result = simulateShotSync(input)
    expect(result.exhausted).to.equal(false)
    expect(result.frames).to.be.empty
    expect(result.finalBalls).to.have.length(2)
    expect(
      result.outcomes.some(
        (outcome) =>
          outcome.type === OutcomeType.Collision &&
          outcome.ballA === 0 &&
          outcome.ballB === 1
      )
    ).to.equal(true)
  })

  it("is deterministic for the same state and shot", () => {
    const first = simulateShotSync(input)
    const second = simulateShotSync(input)
    expect(second.outcomes).to.deep.equal(first.outcomes)
    expect(second.finalBalls).to.deep.equal(first.finalBalls)
  })
})
