import { useSyncExternalStore } from "react"

export interface ViewportSnapshot {
  width: number
  height: number
  orientation: "portrait" | "landscape"
  fullscreen: boolean
  keyboardHeight: number
  coarsePointer: boolean
}

export interface GameUiSnapshot {
  phase: "idle" | "loading" | "ready" | "error"
  error: string | null
  controlsEnabled: boolean
}

class ExternalStore<T> {
  private listeners = new Set<() => void>()

  constructor(private snapshot: T) {}

  getSnapshot = () => this.snapshot

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  update(next: T) {
    if (Object.is(next, this.snapshot)) return
    this.snapshot = next
    for (const listener of this.listeners) listener()
  }
}

function readViewport(): ViewportSnapshot {
  const viewport = globalThis.visualViewport
  const width = Math.round(viewport?.width ?? globalThis.innerWidth ?? 0)
  const height = Math.round(viewport?.height ?? globalThis.innerHeight ?? 0)
  const layoutHeight = globalThis.innerHeight ?? height
  return {
    width,
    height,
    orientation: width > height ? "landscape" : "portrait",
    fullscreen: Boolean(document.fullscreenElement),
    keyboardHeight: Math.max(0, Math.round(layoutHeight - height)),
    coarsePointer:
      globalThis.matchMedia?.("(pointer: coarse)").matches ?? false,
  }
}

export const viewportStore = new ExternalStore<ViewportSnapshot>(readViewport())
export const gameUiStore = new ExternalStore<GameUiSnapshot>({
  phase: "idle",
  error: null,
  controlsEnabled: false,
})

let viewportMounted = false

export function mountViewportStore() {
  if (viewportMounted) return () => undefined
  viewportMounted = true
  const update = () => {
    const next = readViewport()
    document.documentElement.style.setProperty(
      "--viewport-width",
      `${next.width}px`
    )
    document.documentElement.style.setProperty(
      "--viewport-height",
      `${next.height}px`
    )
    document.documentElement.style.setProperty(
      "--keyboard-height",
      `${next.keyboardHeight}px`
    )
    document.documentElement.dataset.orientation = next.orientation
    viewportStore.update(next)
  }
  update()
  globalThis.addEventListener("resize", update, { passive: true })
  globalThis.addEventListener("orientationchange", update, { passive: true })
  globalThis.visualViewport?.addEventListener("resize", update, {
    passive: true,
  })
  document.addEventListener("fullscreenchange", update)
  return () => {
    viewportMounted = false
    globalThis.removeEventListener("resize", update)
    globalThis.removeEventListener("orientationchange", update)
    globalThis.visualViewport?.removeEventListener("resize", update)
    document.removeEventListener("fullscreenchange", update)
  }
}

export function useViewportSnapshot() {
  return useSyncExternalStore(
    viewportStore.subscribe,
    viewportStore.getSnapshot,
    viewportStore.getSnapshot
  )
}
