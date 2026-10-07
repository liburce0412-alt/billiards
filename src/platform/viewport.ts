export interface ViewportCoordinatorOptions {
  game?: boolean
}

let disposeActiveCoordinator: (() => void) | undefined

export function mountViewportCoordinator(
  options: ViewportCoordinatorOptions = {}
): () => void {
  disposeActiveCoordinator?.()

  const root = document.documentElement
  const body = document.body
  const viewport = globalThis.visualViewport
  const update = () => {
    const layoutHeight = globalThis.innerHeight
    const visibleHeight = viewport?.height ?? layoutHeight
    const viewportTop = viewport?.offsetTop ?? 0
    const keyboardHeight = Math.max(
      0,
      layoutHeight - visibleHeight - viewportTop
    )
    const landscape = globalThis.innerWidth > visibleHeight

    root.style.setProperty("--bb-visual-height", `${visibleHeight}px`)
    root.style.setProperty("--bb-viewport-top", `${viewportTop}px`)
    root.style.setProperty("--bb-keyboard-height", `${keyboardHeight}px`)
    root.dataset.viewportOrientation = landscape ? "landscape" : "portrait"
    root.dataset.viewportHeight = visibleHeight < 520 ? "compact" : "regular"
    root.classList.toggle("bb-keyboard-open", keyboardHeight > 120)
  }

  body.classList.toggle("game-viewport", options.game === true)
  root.classList.toggle("game-viewport-root", options.game === true)
  update()
  viewport?.addEventListener("resize", update)
  viewport?.addEventListener("scroll", update)
  globalThis.addEventListener("resize", update)
  globalThis.addEventListener("orientationchange", update)

  const dispose = () => {
    viewport?.removeEventListener("resize", update)
    viewport?.removeEventListener("scroll", update)
    globalThis.removeEventListener("resize", update)
    globalThis.removeEventListener("orientationchange", update)
    if (disposeActiveCoordinator === dispose)
      disposeActiveCoordinator = undefined
  }
  disposeActiveCoordinator = dispose
  return dispose
}
