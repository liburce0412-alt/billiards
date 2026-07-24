import { expect } from "chai"
import { Session } from "../../src/network/client/session"
import { console as nodeConsole } from "node:console"

const jestConsole = globalThis.console

beforeEach(() => {
  globalThis.console = nodeConsole
})

afterEach(() => {
  globalThis.console = jestConsole
})

describe("Session", () => {
  it("instance created", () => {
    Session.init("c1", "u1", "t1", false)
    expect(Session.getInstance().clientId).to.equal("c1")
  })

  it("can set opponentName", () => {
    Session.init("c1", "u1", "t1", false)
    const session = Session.getInstance()
    session.opponentName = "Opponent"
    expect(session.opponentName).to.equal("Opponent")
  })

  it("initializes self score at 0", () => {
    Session.init("c1", "u1", "t1", false)
    expect(Session.getInstance().myScore()).to.equal(0)
  })

  it("assigns opponent id and defaults unknown score to 0", () => {
    Session.init("c1", "u1", "t1", false)
    const session = Session.getInstance()
    session.setOpponentClientId("c2")
    expect(session.getScoreByClientId("c2")).to.equal(0)
    expect(session.getScoreByClientId("unknown")).to.equal(0)
  })

  it("adds my and opponent scores explicitly", () => {
    Session.init("c1", "u1", "t1", false)
    const session = Session.getInstance()
    session.setOpponentClientId("c2")
    session.addMyScore(3)
    session.addOpponentScore(4)
    expect(session.myScore()).to.equal(3)
    expect(session.opponentScore()).to.equal(4)
  })

  it("uses a bot opponent in bot mode", () => {
    Session.init("c1", "u1", "t1", false, true)
    const session = Session.getInstance()
    expect(session.opponentName).to.equal("ClawBreak")
    expect(session.opponentScore()).to.equal(0)
  })

  it("keeps fixed player slots while switching a local versus turn", () => {
    Session.init("c1", "Host", "t1", false)
    const session = Session.getInstance()
    session.enableLocalVersus("小明", "小红", "classic-maple", "jade-dragon")

    session.setMyScore(3)
    expect(Session.isLocalVersusMode()).to.equal(true)
    expect(session.orderedNamesForHud()).to.deep.equal({
      p1Name: "小明",
      p2Name: "小红",
    })
    expect(session.orderedScoresForHud()).to.deep.equal({ p1: 3, p2: 0 })
    expect(session.activeLocalCueStyle()).to.equal("classic-maple")

    session.p1type = 1
    session.switchLocalPlayer()
    session.setMyScore(5)

    expect(session.playerIndex).to.equal(1)
    expect(session.playername).to.equal("小红")
    expect(session.opponentName).to.equal("小明")
    expect(session.p1type).to.equal(2)
    expect(session.activeLocalCueStyle()).to.equal("jade-dragon")
    expect(session.orderedScoresForHud()).to.deep.equal({ p1: 3, p2: 5 })
    expect(session.orderedClientIdsForHud()).to.deep.equal({
      p1: "c1",
      p2: "c1-local-2",
    })
  })

  describe("getRaceTargetForPlayer", () => {
    afterEach(() => {
      jest.restoreAllMocks()
    })

    it("returns ThreeCushionConfig.raceTo when no handicaps are defined", () => {
      Session.init("c1", "u1", "t1", false)
      const session = Session.getInstance()
      jest.spyOn(session, "getHandicaps").mockReturnValue({})

      const {
        ThreeCushionConfig,
      } = require("../../src/utils/threecushionconfig")
      const originalRaceTo = ThreeCushionConfig.raceTo
      try {
        ThreeCushionConfig.raceTo = 5
        expect(session.getRaceTargetForPlayer("c1")).to.equal(5)
      } finally {
        ThreeCushionConfig.raceTo = originalRaceTo
      }
    })

    it("returns custom handicap or default 5 when handicaps exist", () => {
      Session.init("c1", "u1", "t1", false)
      const session = Session.getInstance()
      jest.spyOn(session, "getHandicaps").mockReturnValue({ c1: 4 })

      expect(session.getRaceTargetForPlayer("c1")).to.equal(4)
      expect(session.getRaceTargetForPlayer("other")).to.equal(5)
    })
  })
})
