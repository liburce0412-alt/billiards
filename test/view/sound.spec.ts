import { expect } from "chai"
import { gainForImpact } from "../../src/utils/impactgain"
import { AUDIO_BANKS } from "../../src/view/audiobank"

describe("Sound", () => {
  it("maps impact energy to a bounded perceptual gain", () => {
    expect(gainForImpact(0, 5)).to.equal(0)
    expect(gainForImpact(2.5, 5)).to.be.within(0, 1)
    expect(gainForImpact(10, 5)).to.equal(1)
  })

  it("provides at least three variants for every gameplay sound", () => {
    for (const key of [
      "collision",
      "collisionBody",
      "cue",
      "cushion",
      "potMouth",
      "potRoll",
      "potDrop",
    ] as const) {
      expect(AUDIO_BANKS[key].paths.length).to.be.at.least(3)
    }
  })
})
