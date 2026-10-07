import { useEffect, useState } from "react"
import type { PlatformMe } from "../platform/api"
import { gameEngineAdapter } from "./game-engine-adapter"
import { useViewportSnapshot } from "./stores"
import { registerGameDebugTools } from "../platform/webmcp"

function isAndroidLike() {
  return /Android|MiuiBrowser|XiaoMi/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && matchMedia("(pointer: coarse)").matches)
}

export function GameRoute({ session }: { session: PlatformMe }) {
  const viewport = useViewportSnapshot()
  const [message, setMessage] = useState("正在准备球台")
  const mustRotate =
    viewport.orientation === "portrait" &&
    (isAndroidLike() || viewport.coarsePointer)

  useEffect(() => {
    document.documentElement.dataset.quality = session.preferences.quality
    document.body.classList.add("app-game-route")
    document.body.classList.remove("app-platform-route")
    return () => document.body.classList.remove("app-game-route")
  }, [session.preferences.quality])

  useEffect(() => registerGameDebugTools(session), [session])

  useEffect(() => {
    if (mustRotate) return
    let active = true
    gameEngineAdapter
      .mount()
      .then(() => {
        if (active) setMessage("")
      })
      .catch((reason: unknown) => {
        if (active) {
          setMessage(reason instanceof Error ? reason.message : "游戏加载失败")
        }
      })
    return () => {
      active = false
      gameEngineAdapter.unmount()
    }
  }, [mustRotate])

  async function retryLandscape() {
    try { await document.documentElement.requestFullscreen?.({ navigationUI: "hide" }) } catch {
      // Browser-safe landscape mode remains available without fullscreen.
    }
    try { await screen.orientation?.lock?.("landscape") } catch {
      // The user can still rotate the device manually.
    }
    setMessage("请将设备横放；若浏览器拒绝锁定，可手动旋转后继续")
  }

  if (!mustRotate) {
    return message ? (
      <div className="game-react-status" aria-live="polite">
        {message}
      </div>
    ) : null
  }
  return (
    <section className="react-landscape-gate" role="dialog" aria-modal="true" aria-labelledby="rotateTitle">
      <div className="react-landscape-gate__device" aria-hidden="true"><span /></div>
      <p>ANDROID LANDSCAPE</p><h1 id="rotateTitle">横放设备，完整展开球台</h1>
      <span>竖屏不加载可交互击球控制，避免浏览器栏挤压蓄力轨与操作盘。</span>
      <div><button type="button" onClick={retryLandscape}>进入横屏</button><a href="/">退出比赛</a></div>
      <small>{message}</small>
    </section>
  )
}
