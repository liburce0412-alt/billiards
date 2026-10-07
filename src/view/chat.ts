import { id } from "../utils/dom"

/**
 * Generate SVG markup for a ball icon with a blue dot at the given angle.
 * @param angleDeg - 0=N ↑, 90=E →, 180=S ↓, 270=W ←
 * @returns SVG markup string
 */
export function ballSvg(angleDeg: number): string {
  const rad = (angleDeg * Math.PI) / 180
  const offset = 4.0 // dot offset from center
  const cx = (10 + offset * Math.sin(rad)).toFixed(1)
  const cy = (10 - offset * Math.cos(rad)).toFixed(1)
  return `<svg width="20" height="20" viewBox="0 0 20 20" style="vertical-align:middle"><circle cx="10" cy="10" r="7.2" fill="white" stroke="black" stroke-width="0.5"/><circle cx="${cx}" cy="${cy}" r="1.5" fill="blue"/></svg>`
}

export function ballChatToken(angleDeg: number): string {
  const normalized = ((Math.round(angleDeg) % 360) + 360) % 360
  return `[[ball:${normalized}]]`
}

function appendBallIcon(parent: HTMLElement, angleDeg: number) {
  const template = document.createElement("template")
  template.innerHTML = ballSvg(angleDeg)
  const svg = template.content.firstElementChild
  if (svg) parent.append(svg)
}

export interface MatchChatMessage {
  id?: string
  senderId?: string | null
  senderName: string
  body: string
  createdAt: number
  isMine: boolean
}

export class Chat {
  chatoutput: HTMLElement | null
  private readonly toggle = id("matchChatToggle") as HTMLButtonElement | null
  private readonly compose = id("matchChatCompose") as HTMLButtonElement | null
  private readonly unread = id("matchChatUnread")
  private readonly shell = document.querySelector<HTMLElement>(".chatarea")
  private readonly seenIds = new Set<string>()
  private unreadCount = 0
  private readonly openComposer = () => {
    const dialog = document.getElementById("inputTextDiv") as HTMLDialogElement
    const input = document.getElementById("inputText") as HTMLInputElement
    dialog?.showModal()
    input?.focus()
  }

  constructor(_send: (message: string) => void) {
    this.chatoutput = id("chatoutput")
    this.toggle?.addEventListener("click", this.toggleOpen)
    this.compose?.addEventListener("click", this.openComposer)
    this.close()
    document.addEventListener("pointerdown", this.closeOnOutside)
    document.addEventListener("keydown", this.closeOnEscape)
  }

  private close = () => {
    if (this.shell) this.shell.dataset.chatState = "peek"
    this.toggle?.setAttribute("aria-expanded", "false")
  }

  private closeOnOutside = (event: PointerEvent) => {
    if (
      event.target instanceof Node &&
      !this.toggle?.contains(event.target) &&
      !this.shell?.contains(event.target) &&
      !document.getElementById("inputTextDiv")?.contains(event.target)
    )
      this.close()
  }

  private closeOnEscape = (event: KeyboardEvent) => {
    if (event.key === "Escape") this.close()
  }

  showMessage(message: MatchChatMessage | string) {
    if (!this.chatoutput || message === undefined || message === null) {
      this.updateScroll()
      return
    }
    const item: MatchChatMessage =
      typeof message === "string"
        ? {
            senderName: "系统",
            body: message,
            createdAt: Date.now(),
            isMine: false,
          }
        : message
    if (item.id && this.seenIds.has(item.id)) return
    if (item.id) this.seenIds.add(item.id)

    const article = document.createElement("article")
    article.className = "match-chat-message"
    article.classList.toggle("is-mine", item.isMine)
    const meta = document.createElement("header")
    const sender = document.createElement("strong")
    sender.textContent = item.isMine ? "我" : item.senderName
    const time = document.createElement("time")
    time.dateTime = new Date(item.createdAt).toISOString()
    time.textContent = new Intl.DateTimeFormat("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(item.createdAt)
    meta.append(sender, time)
    const body = document.createElement("div")
    body.className = "match-chat-message__body"
    const text = item.body.trim().slice(0, 240)
    const ball = /^\[\[ball:(\d{1,3})\]\]$/.exec(text)
    if (ball) {
      appendBallIcon(body, Number(ball[1]))
    } else {
      body.textContent = text
    }
    article.append(meta, body)
    this.chatoutput.append(article)
    while (this.chatoutput.childElementCount > 30) {
      this.chatoutput.firstElementChild?.remove()
    }
    if (this.shell?.dataset.chatState !== "open" && !item.isMine) {
      this.unreadCount += 1
      this.updateUnread()
    }
    this.updateScroll()
  }

  private toggleOpen = () => {
    if (!this.shell || !this.toggle) return
    const open = this.shell.dataset.chatState !== "open"
    this.shell.dataset.chatState = open ? "open" : "peek"
    this.toggle.setAttribute("aria-expanded", String(open))
    if (open) {
      this.unreadCount = 0
      this.updateUnread()
      this.updateScroll()
    }
  }

  private updateUnread() {
    if (!this.unread) return
    this.unread.hidden = this.unreadCount === 0
    this.unread.textContent = String(Math.min(99, this.unreadCount))
  }

  updateScroll() {
    this.chatoutput &&
      (this.chatoutput.scrollTop = this.chatoutput.scrollHeight)
  }

  dispose() {
    document.removeEventListener("pointerdown", this.closeOnOutside)
    document.removeEventListener("keydown", this.closeOnEscape)
    this.toggle?.removeEventListener("click", this.toggleOpen)
    this.compose?.removeEventListener("click", this.openComposer)
    if (this.shell) this.shell.dataset.chatState = "peek"
    this.toggle?.setAttribute("aria-expanded", "false")
    this.seenIds.clear()
    this.unreadCount = 0
    this.updateUnread()
    this.chatoutput?.replaceChildren()
    this.chatoutput = null
  }
}
