import { expect } from "chai"
import {
  restoreRuleScenario,
  RULE_SCENARIOS,
  serialiseRuleScenario,
} from "../../src/controller/rules/rulescenario"

describe("RuleScenario", () => {
  it("contains at least 200 stable regression fixtures", () => {
    expect(RULE_SCENARIOS.length).to.be.at.least(200)
    expect(
      new Set(RULE_SCENARIOS.map((scenario) => scenario.id)).size
    ).to.equal(RULE_SCENARIOS.length)
  })

  it("round-trips every fixture through the replay-safe JSON format", () => {
    for (const scenario of RULE_SCENARIOS) {
      expect(
        restoreRuleScenario(serialiseRuleScenario(scenario))
      ).to.deep.equal(scenario)
    }
  })

  it("locks the high-risk Chinese eightball and fourball cases", () => {
    const ids = new Set(RULE_SCENARIOS.map((scenario) => scenario.id))
    expect(ids.has("eightball-opening-pot-stays-open")).to.equal(true)
    expect(ids.has("eightball-mixed-combination-stays-open")).to.equal(true)
    expect(ids.has("eightball-opening-scratch-behind-line")).to.equal(true)
    expect(ids.has("fourball-combination-nine")).to.equal(true)
    expect(ids.has("fourball-let-stroke-blocked-incoming")).to.equal(true)
    expect(ids.has("fourball-no-let-during-run")).to.equal(true)
  })
})
