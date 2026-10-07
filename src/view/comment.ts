import { Container } from "../container/container"
import { getButton } from "../utils/dom"
import { randomEmoji } from "../utils/utils"
import { ballChatToken, ballSvg } from "./chat"

export class Comment {
  container: Container
  button: HTMLButtonElement | null
  menu: HTMLDivElement | null
  private readonly listenerAbort = new AbortController()
  private readonly toggle = () => this.toggleMenu()

  constructor(container: Container) {
    this.container = container

    this.button = getButton("comment")
    this.menu = document.getElementById("commentMenu") as HTMLDivElement

    if (!this.button || !this.menu) {
      return
    }

    // Hydrate ball-SVG buttons
    this.menu
      .querySelectorAll<HTMLButtonElement>(".comment-emoji[data-angle]")
      .forEach((btn) => {
        const angle = parseInt(btn.dataset.angle ?? "0", 10)
        const safeAngle = Number.isNaN(angle) ? 0 : angle
        btn.innerHTML = ballSvg(safeAngle)
        btn.dataset.chatMessage = ballChatToken(safeAngle)
      })

    this.button.onclick = this.toggle

    const inputTextDiv = document.getElementById(
      "inputTextDiv"
    ) as HTMLDialogElement
    const inputText = document.getElementById("inputText") as HTMLInputElement
    const restoreGameFocus = () => {
      document.querySelector<HTMLCanvasElement>("#viewP1 canvas")?.focus()
    }

    const sendText = () => {
      const text = inputText.value.trim()
      inputTextDiv.close()
      if (text) {
        this.container.sendChat(text)
      }
    }

    const emojiButtons =
      this.menu.querySelectorAll<HTMLButtonElement>(".comment-emoji")
    emojiButtons.forEach((btn) => {
      if (btn.id === "voice") return
      btn.addEventListener(
        "click",
        () => {
          if (btn.id === "openTextInput") {
            this.openChat()
            return
          }
          const text = btn.dataset.chatMessage ?? btn.textContent ?? ""
          this.container.sendChat(text)
          this.hideMenu()
        },
        { signal: this.listenerAbort.signal }
      )
    })

    inputText.addEventListener(
      "keydown",
      (e) => {
        e.stopPropagation()
        if (e.key === "Enter") sendText()
      },
      { signal: this.listenerAbort.signal }
    )

    inputText.addEventListener("keyup", (e) => e.stopPropagation(), {
      signal: this.listenerAbort.signal,
    })

    document.getElementById("inputSend")?.addEventListener("click", sendText, {
      signal: this.listenerAbort.signal,
    })
    document.getElementById("inputClose")?.addEventListener(
      "click",
      () => {
        inputTextDiv.close()
      },
      { signal: this.listenerAbort.signal }
    )

    inputTextDiv.addEventListener("close", restoreGameFocus, {
      signal: this.listenerAbort.signal,
    })
  }

  setVisible(visible: boolean) {
    if (this.button) {
      this.button.hidden = !visible
      this.button.disabled = !visible
    }
  }

  toggleMenu() {
    if (!this.menu) return
    if (this.menu.classList.contains("comment-menu--hidden")) {
      this.showMenu()
    } else {
      this.hideMenu()
    }
  }

  showMenu() {
    if (!this.menu) return
    this.menu.classList.remove("comment-menu--hidden")
    this.menu
      .querySelectorAll<HTMLButtonElement>(".comment-random")
      .forEach((btn) => {
        btn.textContent = randomEmoji()
      })
  }

  openChat() {
    const inputTextDiv = document.getElementById(
      "inputTextDiv"
    ) as HTMLDialogElement
    const inputText = document.getElementById("inputText") as HTMLInputElement
    this.hideMenu()
    inputTextDiv.showModal()
    inputText.value = ""
    inputText.focus()
  }

  hideMenu() {
    if (this.menu) {
      this.menu.classList.add("comment-menu--hidden")
    }
  }

  dispose() {
    this.listenerAbort.abort()
    if (this.button?.onclick === this.toggle) this.button.onclick = null
    const dialog = document.getElementById(
      "inputTextDiv"
    ) as HTMLDialogElement | null
    if (dialog?.open) dialog.close()
    this.hideMenu()
  }
}
