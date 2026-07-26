import { expect } from "chai"
import {
  BOT_DIFFICULTY_PROFILES,
  BotPlanRequest,
  planBotShotSync,
} from "../../../src/network/bot/shotplanner"

describe("physical bot shot planner", () => {
  it("uses the fixed 1-11 candidate budgets", () => {
    expect(
      BOT_DIFFICULTY_PROFILES.map((profile) => profile.candidateBudget)
    ).to.deep.equal([3, 4, 6, 8, 10, 14, 18, 24, 30, 40, 48])
    expect(BOT_DIFFICULTY_PROFILES[8].lookaheadDepth).to.equal(2)
    expect(BOT_DIFFICULTY_PROFILES[10].lookaheadDepth).to.equal(2)
  })

  it("repeatedly selects the physically legal first contact", () => {
    const request: BotPlanRequest = {
      type: "BOT_PLAN",
      id: "deterministic-plan",
      ruleType: "eightball",
      cueBallId: 0,
      level: 6,
      balls: [
        { id: 0, pos: { x: -0.5, y: 0 }, onTable: true },
        { id: 1, pos: { x: 0, y: 0 }, onTable: true },
      ],
      candidates: [
        {
          id: "miss",
          targetId: 1,
          kind: "pot",
          aim: {
            angle: Math.PI / 2,
            power: 2.2,
            offset: { x: 0, y: 0 },
            elevation: 0,
          },
          nextTargetIds: [],
          geometryScore: 0,
        },
        {
          id: "contact",
          targetId: 1,
          kind: "pot",
          aim: {
            angle: 0,
            power: 2.2,
            offset: { x: 0, y: 0 },
            elevation: 0,
          },
          nextTargetIds: [],
          geometryScore: 0.1,
        },
      ],
    }
    const first = planBotShotSync(request)
    const second = planBotShotSync(request)
    expect(first.candidateId).to.equal("contact")
    expect(second.candidateId).to.equal(first.candidateId)
    expect(second.score).to.equal(first.score)
  })
})
