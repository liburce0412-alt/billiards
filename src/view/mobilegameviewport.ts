type LockableOrientation = ScreenOrientation & {
  lock?: (orientation: "landscape") => Promise<void>
}

export class MobileGameViewport {
  private readonly prompt = document.getElementById("landscapePrompt")
  private readonly enterButton = document.getElementById("landscapeEnter")
  private mounted = false

  mount() {
    if (this.mounted) return
    this.mounted = true
    this.enterButton?.addEventListener("click", this.enterLandscape)
    const continueButton = document.getElementById("landscapeContinue")
    if (continueButton) continueButton.hidden = true
    globalThis.addEventListener("resize", this.update)
    globalThis.addEventListener("orientationchange", this.update)
    this.update()
  }

  dispose() {
    if (!this.mounted) return
    this.mounted = false
    this.enterButton?.removeEventListener("click", this.enterLandscape)
    globalThis.removeEventListener("resize", this.update)
    globalThis.removeEventListener("orientationchange", this.update)
    document.body.classList.remove("portrait-controls-blocked")
  }

  private update = () => {
    if (!this.prompt) return
    const isTouch = globalThis.matchMedia?.("(pointer: coarse)").matches
    const portrait = globalThis.innerHeight > globalThis.innerWidth
    const blocked = Boolean(isTouch && portrait)
    this.prompt.hidden = !blocked
    document.body.classList.toggle("portrait-controls-blocked", blocked)
  }

  private enterLandscape = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen?.()
      }
      await (screen.orientation as LockableOrientation).lock?.("landscape")
    } catch {
      this.prompt
        ?.querySelector<HTMLElement>("[data-orientation-status]")
        ?.replaceChildren("浏览器未允许自动旋转，请手动横放手机。")
    }
    this.update()
  }
}
