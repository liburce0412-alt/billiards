import { useLayoutEffect, type ReactNode } from "react"
import { Link, NavLink } from "react-router"
import type { PlatformMe } from "../platform/api"
import { isLocalDemo } from "../platform/api"
import { approvalLabel } from "../platform/shell"
import { AmbientScene } from "./ambient-scene"
import { AppearanceControls } from "./appearance-controls"

export type AppSection =
  "play" | "lobby" | "account" | "admin" | "rules" | "tools"

const navigation: Array<{
  section: AppSection
  href: string
  icon: string
  label: string
}> = [
  { section: "play", href: "/", icon: "ph-game-controller", label: "开球" },
  { section: "lobby", href: "/lobby", icon: "ph-users-three", label: "社交" },
  {
    section: "account",
    href: "/account",
    icon: "ph-sliders-horizontal",
    label: "个性化",
  },
  {
    section: "rules",
    href: "/rules",
    icon: "ph-book-open-text",
    label: "规则",
  },
]

export function AppShell({
  session,
  active,
  eyebrow,
  title,
  description,
  children,
}: {
  session: PlatformMe
  active: AppSection
  eyebrow: string
  title: string
  description: string
  children: ReactNode
}) {
  useLayoutEffect(() => {
    document.body.classList.add("app-platform-route")
    return () => document.body.classList.remove("app-platform-route")
  }, [])
  const initial =
    session.user.displayName.trim().slice(0, 1).toUpperCase() || "B"
  const route = (href: string) =>
    isLocalDemo() ? `${href}?platformDemo=1` : href
  const accessStatus = session.capabilities.online ? "联机已启用" : "离线可玩"
  return (
    <div className="holo-app-shell" data-section={active}>
      <AmbientScene
        quality={session.preferences.quality}
        reducedMotion={session.preferences.reduced_motion === 1}
      />
      <header className="holo-topbar">
        <Link
          className="holo-wordmark"
          to={route("/")}
          aria-label="Break Builder 首页"
        >
          <span className="holo-wordmark__orb" aria-hidden="true" />
          <span>
            <strong>BREAK BUILDER</strong>
            <small>竞技球桌控制台</small>
          </span>
        </Link>
        <nav className="holo-nav" aria-label="主导航">
          {navigation.map((item) => (
            <NavLink
              key={item.section}
              to={route(item.href)}
              aria-current={active === item.section ? "page" : undefined}
            >
              <i className={`ph ${item.icon}`} aria-hidden="true" />
              <span>{item.label}</span>
            </NavLink>
          ))}
          {session.capabilities.admin && (
            <NavLink
              to={route("/admin")}
              aria-current={active === "admin" ? "page" : undefined}
            >
              <i className="ph ph-shield-checkered" aria-hidden="true" />
              <span>管理</span>
            </NavLink>
          )}
        </nav>
        <Link className="holo-account" to={route("/account")}>
          <span className="holo-account__avatar">
            {session.user.avatarUrl ? (
              <img src={session.user.avatarUrl} alt="" />
            ) : (
              initial
            )}
          </span>
          <span>
            <strong>{session.user.displayName}</strong>
            <small>
              {approvalLabel(session.user.approvalStatus)} · @
              {session.user.username}
            </small>
          </span>
          <i className="ph ph-caret-down" aria-hidden="true" />
        </Link>
      </header>
      <main className="holo-main">
        <header className="holo-page-heading">
          <div>
            <p>{eyebrow}</p>
            <h1>{title}</h1>
            <span>{description}</span>
          </div>
          <div className="holo-page-heading__signal">
            <i />
            <span>{isLocalDemo() ? "本地演示" : accessStatus}</span>
          </div>
        </header>
        <div className="caesar-appearance-row">
          <AppearanceControls />
        </div>
        {children}
      </main>
      <footer className="holo-footer">
        <span>Break Builder · GPL-3.0</span>
        <Link to={route("/rules")}>规则与许可证</Link>
        <Link to={route("/tools")}>操作帮助</Link>
      </footer>
      <div
        id="platformToastRegion"
        className="platform-toast-region"
        aria-live="polite"
        aria-atomic="true"
      />
    </div>
  )
}
