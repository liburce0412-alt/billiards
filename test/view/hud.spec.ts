import { Hud, MatchHudPresentation } from "../../src/view/hud"

function mountHud() {
  document.body.innerHTML = `
    <div class="tray-score-container">
      <div id="p1Score"></div>
      <div id="p2Score"></div>
    </div>
    <div id="breakScore"></div>`
  return new Hud()
}

describe("Hud presentation", () => {
  afterEach(() => {
    document.body.replaceChildren()
  })

  it("renders real match details without fabricated level or rank labels", () => {
    const hud = mountHud()
    const presentation: MatchHudPresentation = {
      playerOne: {
        name: "未来玩家",
        score: 3,
        avatarUrl: "/media/avatar/me",
        kind: "human",
        detail: "已验证在线玩家",
        connection: "connected",
      },
      playerTwo: {
        name: "ClawBreak",
        score: 2,
        kind: "ai",
        detail: "AI 难度 4/11",
        connection: "local",
      },
      ruleLabel: "八球",
      turnLabel: "当前回合",
      activePlayer: 1,
    }

    hud.updateMatch(presentation)

    expect(document.body.textContent).toContain("未来玩家")
    expect(document.body.textContent).toContain("AI 难度 4/11")
    expect(document.body.textContent).toContain("八球")
    expect(document.body.textContent).not.toContain("LV.")
    expect(document.body.textContent).not.toContain("紫晶")
    expect(document.querySelector("#p1Score img")?.getAttribute("src")).toBe(
      "/media/avatar/me"
    )
    expect(document.querySelector("#p1Score")?.classList).toContain("is-active")
  })

  it("uses meaningful initials when an avatar is unavailable", () => {
    const hud = mountHud()
    hud.updateMatch({
      playerOne: { name: "未来玩家", score: 0, kind: "human" },
      playerTwo: { name: "Claw Break", score: 0, kind: "ai" },
      ruleLabel: "九球",
      turnLabel: "等待开球",
      activePlayer: 0,
    })
    expect(document.querySelector("#p1Score .hud-avatar")?.textContent).toBe(
      "未来"
    )
    expect(document.querySelector("#p2Score .hud-avatar")?.textContent).toBe(
      "CB"
    )
  })

  it("falls back to initials when an avatar cannot be loaded", () => {
    const hud = mountHud()
    hud.updateMatch({
      playerOne: {
        name: "未来玩家",
        score: 0,
        avatarUrl: "/media/avatar/missing",
        kind: "human",
      },
      playerTwo: { name: "Claw Break", score: 0, kind: "ai" },
      ruleLabel: "九球",
      turnLabel: "等待开球",
      activePlayer: 0,
    })

    document.querySelector("#p1Score img")?.dispatchEvent(new Event("error"))

    const avatar = document.querySelector<HTMLElement>("#p1Score .hud-avatar")
    expect(avatar?.textContent).toBe("未来")
    expect(avatar?.dataset.fallback).toBe("initials")
  })
})
