import { useEffect, useRef, useState } from "react"
import type { PlatformMe } from "../platform/api"
import type { AppSection } from "./shell"
import { AppShell } from "./shell"

type Mount = (session: PlatformMe, root: HTMLElement) => void | Promise<void>

const routeLoaders: Record<
  "account" | "admin" | "lobby",
  () => Promise<Mount>
> = {
  account: () => import("../account").then((module) => module.mountAccountInto),
  admin: () => import("../admin").then((module) => module.mountAdminInto),
  lobby: () => import("../lobby").then((module) => module.mountLobbyInto),
}

const copy = {
  account: {
    eyebrow: "IDENTITY / PERSONALISATION",
    title: "账号与个性化",
    description: "让你的球杆、球台、环境、隐私和操作偏好跟随账号同步。",
  },
  admin: {
    eyebrow: "TRUST / OPERATIONS",
    title: "管理控制中心",
    description: "审核在线权限、处理举报与制裁，并留下可追溯的操作记录。",
  },
  lobby: {
    eyebrow: "SOCIAL / LIVE",
    title: "实时社交大厅",
    description: "找到球友，聊聊上一局，再约下一场。",
  },
} as const

export function LegacyPlatformPage({
  page,
  session,
}: {
  page: "account" | "admin" | "lobby"
  session: PlatformMe
}) {
  const mountRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const target = mountRef.current
    if (!target) return
    let active = true
    target.replaceChildren()
    routeLoaders[page]()
      .then((mount) => mount(session, target))
      .catch((reason: unknown) => {
        if (active)
          setError(reason instanceof Error ? reason.message : "页面加载失败")
      })
    return () => {
      active = false
      target.replaceChildren()
    }
  }, [page, session])

  const content = copy[page]
  return (
    <AppShell session={session} active={page as AppSection} {...content}>
      {error ? (
        <div className="holo-error" role="alert">
          {error}
        </div>
      ) : null}
      <div
        ref={mountRef}
        className="holo-legacy-boundary platform-page"
        data-route={page}
      />
    </AppShell>
  )
}
