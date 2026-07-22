import { expect } from "chai"
import { gainForImpact } from "../../src/utils/impactgain"

describe("Sound", () => {
  it("maps impact energy to a bounded perceptual gain", () => {
    expect(gainForImpact(0, 5)).to.equal(0)
    expect(gainForImpact(2.5, 5)).to.be.within(0, 1)
    expect(gainForImpact(10, 5)).to.equal(1)
  })
})
