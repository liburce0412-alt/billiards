import { id, getInput } from "../utils/dom"

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

export class Chat {
  chatoutput: HTMLElement | null
  chatInput: HTMLElement | null
  chatSend: HTMLElement | null
  chatInputText: HTMLInputElement | null
  send
  constructor(send) {
    this.chatoutput = id("chatoutput")
    this.chatInputText = getInput("chatinputtext")
    this.chatSend = id("chatsend")
    this.chatSend?.addEventListener("click", this.sendClicked)
    this.send = send
  }

  sendClicked = (_) => {
    this.send(this.chatInputText?.value)
    this.showMessage(this.chatInputText?.value)
  }

  showMessage(msg) {
    if (!this.chatoutput || msg === undefined || msg === null) {
      this.updateScroll()
      return
    }

    if (msg.length > 2 && this.chatoutput.childNodes.length) {
      this.chatoutput.appendChild(document.createElement("br"))
    }
    const ball = /^\[\[ball:(\d{1,3})\]\]$/.exec(msg)
    if (ball) {
      appendBallIcon(this.chatoutput, Number(ball[1]))
    } else {
      this.chatoutput.appendChild(document.createTextNode(msg.slice(0, 240)))
    }
    this.updateScroll()
  }

  updateScroll() {
    this.chatoutput &&
      (this.chatoutput.scrollTop = this.chatoutput.scrollHeight)
  }
}
