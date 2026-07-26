import { expect } from "chai"
import { Vector3 } from "three"
import { eightBallGroupAfterShot } from "../../src/controller/rules/eightballgroup"
import { Ball } from "../../src/model/ball"
import { Outcome } from "../../src/model/outcome"

describe("eightBallGroupAfterShot", () => {
  const cueball = new Ball(new Vector3(), 0xffffff, 0)
  const solid = new Ball(new Vector3(1, 0), 0xffff00, 1)
  const stripe = new Ball(new Vector3(2, 0), 0x0000ff, 9)

  it("keeps the table open after the break", () => {
    const outcome = [
      Outcome.collision(cueball, solid, 1),
      Outcome.pot(solid, 1),
    ]
    expect(eightBallGroupAfterShot(cueball, outcome, true)).to.equal(0)
  })

  it("keeps the table open after a mixed combination", () => {
    const outcome = [
      Outcome.collision(cueball, solid, 1),
      Outcome.pot(solid, 1),
      Outcome.pot(stripe, 1),
    ]
    expect(eightBallGroupAfterShot(cueball, outcome, false)).to.equal(0)
  })

  it("assigns only the legally contacted and exclusively potted group", () => {
    const outcome = [
      Outcome.collision(cueball, stripe, 1),
      Outcome.pot(stripe, 1),
    ]
    expect(eightBallGroupAfterShot(cueball, outcome, false)).to.equal(2)
  })
})
