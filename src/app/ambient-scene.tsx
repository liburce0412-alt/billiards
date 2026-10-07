import { useEffect, useRef } from "react"
import { mountSpectraFx } from "../platform/fx"
import { mountGlassOverlay } from "../../packages/table-tennis/src/browser/glass"

export function AmbientScene({
  quality = "balanced",
  reducedMotion = false,
}: {
  quality?: "low" | "balanced" | "high"
  reducedMotion?: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!canvasRef.current) return
    const root = canvasRef.current.parentElement!
    const panels =
      ".holo-topbar,.holo-config-panel,.holo-room-panel,.platform-panel,.platform-modal__card,.tt-config,.caesar-appearance__panel"
    const register = () => {
      root.querySelectorAll<HTMLElement>(panels).forEach((element) => {
        element.dataset.glass = element.matches(
          ".holo-topbar,.tt-config,.holo-config-panel,.caesar-appearance__panel,.platform-modal__card"
        )
          ? "optical"
          : "ambient"
      })
    }
    register()
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        const nodes = [...record.addedNodes, ...record.removedNodes]
        if (nodes.some((node) => node instanceof Element)) {
          register()
          break
        }
      }
    })
    observer.observe(root, { childList: true, subtree: true })
    const glass = mountGlassOverlay(root, canvasRef.current, {
      quality,
      reducedMotion,
    })
    const handle = mountSpectraFx(canvasRef.current, {
      quality,
      interactive: true,
      reducedMotion,
      onRender: (now) => glass.render(now),
    })
    return () => {
      observer.disconnect()
      handle.dispose()
      glass.dispose()
    }
  }, [quality, reducedMotion])

  return <canvas ref={canvasRef} className="holo-ambient" aria-hidden="true" />
}
