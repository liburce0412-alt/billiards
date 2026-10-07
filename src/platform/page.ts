import type { PlatformMe } from "./api"
import { accountChip } from "./shell"
import { mountSpectraFx } from "./fx"
import { mountViewportCoordinator } from "./viewport"

export type PageName = "play" | "lobby" | "account" | "admin"

export function mountPlatformPage(
  session: PlatformMe,
  active: PageName,
  title: string,
  description: string
) {
  document.body.className = "platform-app"
  mountViewportCoordinator()
  document.body.innerHTML = `
    <canvas class="platform-app__fx" aria-hidden="true"></canvas>
    <div class="platform-app__shell">
      <header class="platform-app__header">
        <a class="platform-wordmark" href="/" aria-label="Break Builder 首页">
          <span class="platform-wordmark__mark"><i class="ph ph-circle-dashed" aria-hidden="true"></i></span>
          <span>BREAK BUILDER</span>
        </a>
        <nav class="platform-app__nav" aria-label="主导航">
          ${navLink("play", active, "/", "ph-game-controller", "开球")}
          ${navLink("lobby", active, "/lobby", "ph-users-three", "社交")}
          ${navLink("account", active, "/account", "ph-sliders-horizontal", "个性化")}
          ${session.capabilities.admin ? navLink("admin", active, "/admin", "ph-shield-checkered", "管理") : ""}
        </nav>
        ${accountChip(session)}
      </header>
      <main class="platform-app__main">
        <section class="platform-app__hero">
          <div>
            <p class="platform-eyebrow">BREAK BUILDER / ${active.toUpperCase()}</p>
            <h1></h1>
            <p class="platform-app__description"></p>
          </div>
          <div class="platform-app__signal" aria-hidden="true">
            <span>LIVE SYSTEM</span><i class="ph ph-wave-sine"></i>
          </div>
        </section>
        <div id="platformPage" class="platform-page"></div>
      </main>
      <footer class="platform-app__footer">
        <span>Break Builder · GPL-3.0</span>
        <a href="/rules">规则与许可证</a>
        <span>账号状态由服务器验证</span>
      </footer>
    </div>
    <div id="platformToastRegion" class="platform-toast-region" aria-live="polite" aria-atomic="true"></div>`
  document.querySelector<HTMLElement>(".platform-app__hero h1")!.textContent =
    title
  document.querySelector<HTMLElement>(
    ".platform-app__description"
  )!.textContent = description
  mountSpectraFx(
    document.querySelector<HTMLCanvasElement>(".platform-app__fx")!,
    {
      quality: session.preferences.quality,
      interactive: true,
    }
  )
  return document.querySelector<HTMLElement>("#platformPage")!
}

export function toast(
  message: string,
  state: "success" | "error" | "info" = "info"
) {
  const region = document.querySelector<HTMLElement>("#platformToastRegion")
  if (!region) return
  const item = document.createElement("div")
  item.className = "platform-toast"
  item.dataset.state = state
  const icon = document.createElement("i")
  const iconByState = {
    success: "ph-check-circle",
    error: "ph-warning-circle",
    info: "ph-info",
  }
  icon.className = `ph ${iconByState[state]}`
  const text = document.createElement("span")
  text.textContent = message
  item.append(icon, text)
  region.append(item)
  globalThis.setTimeout(() => item.remove(), 4200)
}

export function emptyState(iconClass: string, title: string, detail: string) {
  const element = document.createElement("div")
  element.className = "platform-empty"
  const icon = document.createElement("i")
  icon.className = `ph ${iconClass}`
  const heading = document.createElement("strong")
  heading.textContent = title
  const paragraph = document.createElement("p")
  paragraph.textContent = detail
  element.append(icon, heading, paragraph)
  return element
}

export function avatarElement(
  name: string,
  avatarUrl: string | null | undefined,
  size: "sm" | "md" | "lg" = "md"
) {
  const avatar = document.createElement("span")
  avatar.className = `platform-user-avatar platform-user-avatar--${size}`
  if (avatarUrl) {
    const image = document.createElement("img")
    image.src = avatarUrl
    image.alt = ""
    image.loading = "lazy"
    avatar.append(image)
  } else {
    avatar.textContent = name.trim().slice(0, 1).toUpperCase() || "B"
  }
  return avatar
}

function navLink(
  page: PageName,
  active: PageName,
  href: string,
  icon: string,
  label: string
) {
  return `<a href="${href}" ${page === active ? 'aria-current="page"' : ""}><i class="ph ${icon}" aria-hidden="true"></i><span>${label}</span></a>`
}
