import { expect } from "chai"
import { RuleFactory } from "../../src/controller/rules/rulefactory"
import {
  RULE_PROFILES,
  ruleProfileFor,
} from "../../src/controller/rules/ruleprofile"

describe("RuleProfile", () => {
  it("selects the five competition profiles by rule id", () => {
    for (const id of [
      "eightball",
      "nineball",
      "snooker",
      "fourball",
      "threecushion",
    ]) {
      const profile = RuleFactory.profile(id)
      expect(profile.id).to.equal(id)
      expect(profile.version).not.to.equal("")
      expect(profile.reviewedOn).to.match(/^\d{4}-\d{2}-\d{2}$/)
      expect(profile.sourceUrls).not.to.be.empty
    }
  })

  it("falls back to nineball for old links with an unknown rule", () => {
    expect(ruleProfileFor("unknown")).to.equal(RULE_PROFILES.nineball)
  })

  it("documents the fourball 1/4/7/10 scoring baseline", () => {
    expect(RULE_PROFILES.fourball.scoring).to.include("-1")
    expect(RULE_PROFILES.fourball.scoring).to.include("+4")
    expect(RULE_PROFILES.fourball.scoring).to.include("+7")
    expect(RULE_PROFILES.fourball.scoring).to.include("+10")
  })
})
