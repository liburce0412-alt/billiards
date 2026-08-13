import { id } from "../utils/dom"

export class Hud {
  p1Element: HTMLElement | null
  p2Element: HTMLElement | null
  middleElement: HTMLElement | null
  breakElement: HTMLElement | null

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

  setActivePlayer(active: 0 | 1 | 2) {
    this.p1Element?.classList.toggle("is-active", active === 1)
    this.p2Element?.classList.toggle("is-active", active === 2)
  }

  private setText(element: HTMLElement | null, text: string) {
    if (element) {
      element.textContent = text
    }
  }

  private setScore(
    element: HTMLElement | null,
    name?: string,
    value?: string,
    player: 1 | 2 = 1
  ) {
    if (!element) return
    element.replaceChildren()
    const avatar = document.createElement("span")
    avatar.className = "hud-avatar"
    avatar.setAttribute("aria-hidden", "true")
    const portrait = document.createElement("img")
    portrait.src =
      player === 1
        ? "assets/avatar-future-player.webp"
        : "assets/avatar-spectra-rival.webp"
    portrait.alt = ""
    avatar.append(portrait)
    element.append(avatar)
    const copy = document.createElement("span")
    copy.className = "hud-player-copy"
    if (name) {
      const nameElement = document.createElement("div")
      nameElement.className = "hud-name"
      nameElement.textContent = name
      copy.append(nameElement)
      const levelElement = document.createElement("small")
      levelElement.className = "hud-level"
      const levelBadge = document.createElement("b")
      levelBadge.textContent = "LV. 28"
      const rank = document.createElement("span")
      rank.textContent = player === 1 ? "紫晶 III" : "星耀 II"
      const signal = document.createElement("i")
      signal.setAttribute("aria-hidden", "true")
      levelElement.append(levelBadge, rank, signal)
      copy.append(levelElement)
    }
    element.append(copy)
    if (value !== undefined) {
      const valueElement = document.createElement("div")
      valueElement.className = "hud-value"
      valueElement.textContent = value
      element.append(valueElement)
    }
  }

  updateBreak(score: number) {
    this.setText(this.p1Element, "")
    this.setText(this.p2Element, "")
    this.setText(this.middleElement, "")
    if (score > 0 && this.breakElement) {
      this.breakElement.textContent = ""
      this.breakElement.appendChild(document.createTextNode("单杆"))
      this.breakElement.appendChild(document.createElement("br"))
      this.breakElement.appendChild(document.createTextNode(score.toString()))
    } else {
      this.setText(this.breakElement, "")
    }
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
    this.setText(this.p1Element, "")
    this.setText(this.p2Element, "")
    this.setText(this.middleElement, "")
    this.setText(this.breakElement, "")

    if (hideScore) {
      // Drill mode: show the player name only, no score count, no break.
      this.setText(this.p1Element, p1Name ?? "")
      return
    }

    const p1Str = p1Star ? `${p1}⭐` : `${p1}`
    const p2Str = p2Star ? `⭐${p2}` : `${p2}`

    if (p1Name && p2Name) {
      this.setScore(this.p1Element, p1Name, p1Str, 1)
      this.setScore(this.p2Element, p2Name, p2Str, 2)
      if (this.middleElement) {
        this.middleElement.replaceChildren()
        const scoreSeparator = document.createElement("strong")
        scoreSeparator.className = "hud-score-separator"
        scoreSeparator.textContent = "—"
        const turn = document.createElement("span")
        turn.className = "hud-turn-label"
        turn.textContent = "我方开球 · 先到目标分"
        this.middleElement.append(scoreSeparator, turn)
      }
    } else if (p1Name) {
      this.setScore(this.p1Element, p1Name, p1Str, 1)
    } else if (p2Name) {
      this.setScore(this.p2Element, p2Name, p2Str, 2)
    } else {
      this.setScore(this.p1Element, undefined, p1Str)
    }

    if (b > 0) {
      this.setText(this.breakElement, `单杆 ${b}`)
    }
  }
}
