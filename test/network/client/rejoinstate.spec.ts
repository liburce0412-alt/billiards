import { expect } from "chai"
import { Aim } from "../../../src/controller/aim"
import { WatchAim } from "../../../src/controller/watchaim"
import { EightBall } from "../../../src/controller/rules/eightball"
import { Container } from "../../../src/container/container"
import { Ball } from "../../../src/model/ball"
import { Session } from "../../../src/network/client/session"
import { Assets } from "../../../src/view/assets"
import { initDom } from "../../view/dom"

initDom()

function createEightBallContainer(): Container {
  return new Container({
    element: undefined,
    log: (_: any) => {},
    assets: Assets.localAssets(),
    ruletype: "eightball",
    isSinglePlayer: false,
  })
}

describe("Reconnect state", () => {
  afterEach(() => Session.reset())

  it("restores the table, fixed scores, player side and active turn", () => {
    Ball.id = 0
    Session.init("host", "房主", "ROOM1", false)
    const hostSession = Session.getInstance()
    hostSession.setOpponentClientId("guest")
    hostSession.opponentName = "访客"
    hostSession.setMyScore(4)
    hostSession.setOpponentScore(7)
    hostSession.p1type = 1
    const host = createEightBallContainer()
    host.table.balls[1].pos.x = 0.314
    host.updateController(new Aim(host))
    const snapshot = host.createRejoinSnapshot()!

    Ball.id = 0
    Session.init("guest", "访客", "ROOM1", false)
    const guestSession = Session.getInstance()
    guestSession.setOpponentClientId("host")
    guestSession.opponentName = "房主"
    const guest = createEightBallContainer()
    const next = guest.applyRejoinSnapshot(snapshot)

    expect(next).to.be.an.instanceof(WatchAim)
    expect(guestSession.playerIndex).to.equal(1)
    expect(guestSession.playername).to.equal("访客")
    expect(guestSession.opponentName).to.equal("房主")
    expect(guestSession.orderedScoresForHud()).to.deep.equal({ p1: 4, p2: 7 })
    expect(guestSession.p1type).to.equal(2)
    expect(guest.table.balls[1].pos.x).to.be.closeTo(0.314, 1e-9)
    expect((guest.rules as EightBall).serialiseState().behindLine).to.equal(
      false
    )
  })
})
