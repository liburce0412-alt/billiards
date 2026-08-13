import { id } from "../utils/dom"

export type HudPlayerKind = "human" | "ai" | "local" | "spectator"
export type HudConnectionState =
  "connected" | "reconnecting" | "offline" | "local"
export type HudActivePlayer = 0 | 1 | 2

export interface HudPlayerPresentation {
  name: string
  score: number | string
  avatarUrl?: string | null
  kind: HudPlayerKind
  detail?: string
  connection?: HudConnectionState
  scoreStar?: "before" | "after"
}

export interface MatchHudPresentation {
  playerOne: HudPlayerPresentation
  playerTwo: HudPlayerPresentation
  ruleLabel: string
  targetLabel?: string
  turnLabel: string
  activePlayer: HudActivePlayer
  breakScore?: number
}

const FALLBACK_MATCH: MatchHudPresentation = {
  playerOne: { name: "玩家一", score: 0, kind: "human", connection: "local" },
  playerTwo: { name: "玩家二", score: 0, kind: "human", connection: "local" },
  ruleLabel: "比赛",
  turnLabel: "等待开球",
  activePlayer: 0,
}

export class Hud {
  p1Element: HTMLElement | null
  p2Element: HTMLElement | null
  middleElement: HTMLElement | null
  breakElement: HTMLElement | null
  private presentation: MatchHudPresentation = FALLBACK_MATCH

  constructor() {
    this.p1Element = id("p1Score")
    this.p2Element = id("p2Score")
    this.breakElement = id("breakScore")

    let middle = id("hudMiddle")
    if (!middle && this.p1Element && this.p1Element.parentNode) {
      middle = document.createElement("div")
      middle.id = "hudMiddle"
      middle.className = "hudMiddle"
      this.p1Element.parentNode.insertBefore(middle, this.p2Element)
    }
    this.middleElement = middle
  }

  setActivePlayer(active: HudActivePlayer) {
    this.presentation = { ...this.presentation, activePlayer: active }
    this.p1Element?.classList.toggle("is-active", active === 1)
    this.p2Element?.classList.toggle("is-active", active === 2)
    this.updateTurnState(active)
  }

  private setText(element: HTMLElement | null, text: string) {
    if (element) element.textContent = text
  }

  private initials(name: string): string {
    const parts = name.trim().split(/\s+/u).filter(Boolean)
    if (!parts.length) return "?"
    if (parts.length === 1) {
      return Array.from(parts[0]).slice(0, 2).join("").toUpperCase()
    }
    const first = Array.from(parts[0])[0] ?? ""
    const last = Array.from(parts[parts.length - 1])[0] ?? ""
    return `${first}${last}`.toUpperCase()
  }

  private connectionLabel(player: HudPlayerPresentation): string {
    if (player.detail) return player.detail
    if (player.kind === "ai") return "AI 对手"
    if (player.connection === "reconnecting") return "正在重连"
    if (player.connection === "offline") return "连接中断"
    if (player.connection === "connected") return "已连接"
    if (player.kind === "local") return "同设备玩家"
    return "本地玩家"
  }

  private createAvatar(player: HudPlayerPresentation): HTMLElement {
    const avatar = document.createElement("span")
    avatar.className = "hud-avatar"
    avatar.dataset.playerKind = player.kind
    if (player.avatarUrl) {
      const portrait = document.createElement("img")
      portrait.src = player.avatarUrl
      portrait.alt = `${player.name}的头像`
      portrait.referrerPolicy = "same-origin"
      avatar.append(portrait)
    } else {
      avatar.textContent = this.initials(player.name)
      avatar.setAttribute("aria-label", `${player.name}的姓名头像`)
    }
    return avatar
  }

  private setPlayer(
    element: HTMLElement | null,
    player: HudPlayerPresentation,
    slot: 1 | 2
  ) {
    if (!element) return
    element.replaceChildren()
    const avatar = this.createAvatar(player)
    const copy = document.createElement("span")
    copy.className = "hud-player-copy"

    const name = document.createElement("strong")
    name.className = "hud-name"
    name.textContent = player.name

    const detail = document.createElement("span")
    detail.className = "hud-player-detail"
    detail.dataset.connection = player.connection ?? "local"
    const dot = document.createElement("i")
    dot.setAttribute("aria-hidden", "true")
    const detailText = document.createElement("span")
    detailText.textContent = this.connectionLabel(player)
    detail.append(dot, detailText)
    copy.append(name, detail)

    const value = document.createElement("strong")
    value.className = "hud-value"
    let scoreText = String(player.score)
    if (player.scoreStar === "before") scoreText = `★${player.score}`
    if (player.scoreStar === "after") scoreText = `${player.score}★`
    value.textContent = scoreText
    value.setAttribute("aria-label", `${player.name} ${player.score} 分`)

    if (slot === 1) element.append(avatar, copy, value)
    else element.append(value, copy, avatar)
  }

  private renderMiddle(presentation: MatchHudPresentation) {
    if (!this.middleElement) return
    this.middleElement.replaceChildren()
    const rule = document.createElement("span")
    rule.className = "hud-rule-label"
    rule.textContent = presentation.targetLabel
      ? `${presentation.ruleLabel} · ${presentation.targetLabel}`
      : presentation.ruleLabel

    const score = document.createElement("strong")
    score.className = "hud-scoreline"
    const p1 = document.createElement("span")
    p1.textContent = String(presentation.playerOne.score)
    const separator = document.createElement("i")
    separator.textContent = "–"
    const p2 = document.createElement("span")
    p2.textContent = String(presentation.playerTwo.score)
    score.append(p1, separator, p2)

    const turn = document.createElement("span")
    turn.className = "hud-turn-label"
    const dot = document.createElement("i")
    dot.setAttribute("aria-hidden", "true")
    const copy = document.createElement("span")
    copy.textContent = presentation.turnLabel
    turn.append(dot, copy)
    this.middleElement.append(rule, score, turn)
  }

  private updateTurnState(active: HudActivePlayer) {
    const turn =
      this.middleElement?.querySelector<HTMLElement>(".hud-turn-label")
    if (!turn) return
    turn.dataset.activePlayer = String(active)
    let name = ""
    if (active === 1) name = this.presentation.playerOne.name
    if (active === 2) name = this.presentation.playerTwo.name
    const copy = turn.querySelector("span")
    if (copy && name) copy.textContent = `${name}的回合`
  }

  updateMatch(presentation: MatchHudPresentation) {
    this.presentation = presentation
    this.setPlayer(this.p1Element, presentation.playerOne, 1)
    this.setPlayer(this.p2Element, presentation.playerTwo, 2)
    this.renderMiddle(presentation)
    this.setActivePlayer(presentation.activePlayer)
    this.setText(
      this.breakElement,
      presentation.breakScore && presentation.breakScore > 0
        ? `单杆 ${presentation.breakScore}`
        : ""
    )
  }

  updatePresentation(presentation: MatchHudPresentation) {
    this.updateMatch(presentation)
  }

  updateBreak(score: number) {
    this.setText(this.breakElement, score > 0 ? `单杆 ${score}` : "")
  }

  updateScores(
    p1: number,
    p2: number,
    p1Name?: string,
    p2Name?: string,
    b: number = 0,
    hideScore: boolean = false,
    p1Star: boolean = false,
    p2Star: boolean = false
  ) {
    if (hideScore) {
      this.setText(this.p1Element, p1Name ?? "")
      this.setText(this.p2Element, "")
      this.setText(this.middleElement, "")
      this.updateBreak(0)
      return
    }
    this.updateMatch({
      ...this.presentation,
      playerOne: {
        ...this.presentation.playerOne,
        name: p1Name ?? this.presentation.playerOne.name,
        score: p1,
        scoreStar: p1Star ? "after" : undefined,
      },
      playerTwo: {
        ...this.presentation.playerTwo,
        name: p2Name ?? this.presentation.playerTwo.name,
        score: p2,
        scoreStar: p2Star ? "before" : undefined,
      },
      breakScore: b,
    })
  }
}
