import { id } from "../../utils/dom"
import { Session } from "../client/session"

export interface LogEntry {
  timestamp: number
  direction: "in" | "out" | "info"
  message: string
}

export class Logger {
  element: HTMLDivElement
  logElement: HTMLPreElement
  entries: LogEntry[] = []
  visible: boolean = false
  expanded: boolean = false
  maxEntries: number = 50
  private readonly clearButton = document.getElementById("botDebugClear")
  private readonly toggleButton = document.getElementById("botDebugToggle")
  private readonly handleClear = () => this.clear()
  private readonly handleToggle = () => this.toggleExpanded()

  constructor() {
    this.element = id("botDebugOverlay") as HTMLDivElement
    this.logElement = id("botDebugLog") as HTMLPreElement
    this.hide()

    if (Session.isBotMode()) {
      this.info("Bot mode activated")
    }

    this.clearButton?.addEventListener("click", this.handleClear)
    this.toggleButton?.addEventListener("click", this.handleToggle)

    this.updateExpandedState()
  }

  toggle() {
    this.visible = !this.visible
    if (this.visible) {
      this.show()
    } else {
      this.hide()
    }
  }

  toggleExpanded() {
    this.expanded = !this.expanded
    this.updateExpandedState()
  }

  private updateExpandedState() {
    if (this.element) {
      if (this.expanded) {
        this.element.classList.remove("compact")
      } else {
        this.element.classList.add("compact")
      }
    }
  }

  show() {
    this.visible = true
    if (this.element) {
      this.element.style.display = "block"
    }
  }

  hide() {
    this.visible = false
    if (this.element) {
      this.element.style.display = "none"
    }
  }

  log(direction: "in" | "out" | "info", message: string) {
    const entry: LogEntry = {
      timestamp: Date.now(),
      direction,
      message: `${message.substring(0, 250)}...`,
    }
    this.entries.push(entry)
    if (this.entries.length > this.maxEntries) {
      this.entries.shift()
    }
    this.render()
  }

  info(message: string) {
    this.log("info", message)
  }

  incoming(message: string) {
    this.log("in", message)
  }

  outgoing(message: string) {
    this.log("out", message)
  }

  clear() {
    this.entries = []
    this.render()
  }

  private render() {
    if (!this.logElement) return

    this.logElement.textContent = ""
    this.entries.forEach((entry) => {
      const line = document.createElement("div")
      const time = new Date(entry.timestamp).toLocaleTimeString()

      let prefix: string
      let color: string

      if (entry.direction === "in") {
        prefix = "←"
        color = "#4ade80"
      } else if (entry.direction === "out") {
        prefix = "→"
        color = "#60a5fa"
      } else {
        prefix = "•"
        color = "#fbbf24"
      }

      const meta = document.createElement("span")
      meta.style.color = color
      meta.textContent = `[${time}] ${prefix} `
      line.appendChild(meta)
      line.appendChild(document.createTextNode(entry.message))

      this.logElement.appendChild(line)
    })

    this.logElement.scrollTop = this.logElement.scrollHeight
  }

  dispose() {
    this.clearButton?.removeEventListener("click", this.handleClear)
    this.toggleButton?.removeEventListener("click", this.handleToggle)
    this.entries.length = 0
  }
}
