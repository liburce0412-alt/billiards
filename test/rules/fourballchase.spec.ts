import { expect } from "chai"
import { Container } from "../../src/container/container"
import { FourBallChase } from "../../src/controller/rules/fourballchase"
import { Aim } from "../../src/controller/aim"
import { Ball, State } from "../../src/model/ball"
import { Outcome } from "../../src/model/outcome"
import { Session } from "../../src/network/client/session"
import { R } from "../../src/model/physics/constants"
import { Assets } from "../../src/view/assets"
import { initDom } from "../view/dom"

initDom()

function initFourBall(): {
  container: Container
  rules: FourBallChase
} {
  Ball.id = 0
  Session.reset()
  Session.init("test-client", "TestPlayer", "test-table", false)
  const container = new Container({
    element: undefined,
    log: (_: any) => {},
    assets: Assets.localAssets(),
    ruletype: "fourball",
  })
  return { container, rules: container.rules as FourBallChase }
}

describe("FourBallChase Rules", () => {
  afterEach(() => Session.reset())

  it("racks cue ball with 1, 2, 3 and 9", () => {
    const { container, rules } = initFourBall()
    expect(rules.rulename).to.equal("fourball")
    expect(container.table.balls.map((ball) => ball.label)).to.deep.equal([
      undefined,
      1,
      2,
      3,
      9,
    ])
  })

  it("starts with every ball separated by at least one diameter", () => {
    const { container } = initFourBall()
    const balls = container.table.balls
    balls.forEach((ball, index) => {
      balls.slice(index + 1).forEach((other) => {
        expect(ball.pos.distanceTo(other.pos)).to.be.greaterThanOrEqual(2 * R)
      })
    })
  })

  it("requires the lowest numbered ball first", () => {
    const { container, rules } = initFourBall()
    const two = container.table.balls.find((ball) => ball.label === 2)!
    const outcome = [
      Outcome.collision(container.table.cueball, two, 1),
      Outcome.cushion(two, 1, 2),
    ]
    expect(rules.foulReason(outcome)).to.equal("Wrong ball hit first")
  })

  it("awards 4 for a legal golden 9 while other balls remain", () => {
    const { container, rules } = initFourBall()
    const one = container.table.balls.find((ball) => ball.label === 1)!
    const nine = container.table.balls.find((ball) => ball.label === 9)!
    const outcome = [
      Outcome.collision(container.table.cueball, one, 1),
      Outcome.pot(nine, 1, 2),
    ]
    expect(rules.getAmountScored(outcome)).to.equal(4)
  })

  it("awards 10 for a break-and-run and reracks", () => {
    const { container, rules } = initFourBall()
    const objects = container.table.balls.filter(
      (ball) => ball !== container.table.cueball
    )
    objects.forEach((ball) => {
      ball.state = State.InPocket
    })
    const outcome = [
      Outcome.collision(container.table.cueball, objects[0], 1),
      ...objects.map((ball, index) => Outcome.pot(ball, 1, index + 2)),
    ]
    expect(rules.getAmountScored(outcome)).to.equal(10)
    expect(rules.update(outcome)).to.be.an.instanceof(Aim)
    expect(Session.getInstance().myScore()).to.equal(10)
    expect(objects.every((ball) => ball.onTable())).to.be.true
  })
})
