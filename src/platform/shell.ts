import {
  ApiError,
  apiJson,
  isPlatformPreview,
  loadSession,
  type PlatformMe,
} from "./api"
import { mountSpectraFx } from "./fx"
import { mountGlassOverlay } from "../../packages/table-tennis/src/browser/glass"
import {
  RENDER_QUALITY_STORAGE_KEY,
  renderQualityModeForPreference,
  serverQualityForRenderMode,
} from "../view/renderquality"

type TurnstileApi = {
  render(
    container: HTMLElement,
    options: {
      sitekey: string
      action: string
      theme: "light"
      size: "flexible"
      callback(token: string): void
      "expired-callback"(): void
      "error-callback"(): void
    }
  ): string
  reset(widgetId: string): void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

let turnstilePromise: Promise<TurnstileApi> | null = null
let disposeAuthPresentation: (() => void) | null = null

export async function platformGate(): Promise<PlatformMe | null> {
  document.documentElement.classList.add("platform-loading")
  try {
    if (isPlatformPreview()) {
      document.documentElement.classList.add("platform-gated")
      await mountAuthGate()
      return null
    }
    const session = await loadSession()
    if (session) {
      disposeAuthPresentation?.()
      document.getElementById("platformGate")?.remove()
      applyPersonalisation(session)
      ;(
        globalThis as typeof globalThis & {
          __BREAK_BUILDER_SESSION__?: PlatformMe
        }
      ).__BREAK_BUILDER_SESSION__ = session
      document.documentElement.classList.remove("platform-gated")
      return session
    }
    document.documentElement.classList.add("platform-gated")
    await mountAuthGate()
    return null
  } finally {
    document.documentElement.classList.remove("platform-loading")
  }
}

export function applyPersonalisation(session: PlatformMe) {
  const root = document.documentElement
  const qualityMode = renderQualityModeForPreference(
    session.preferences.quality
  )
  root.dataset.accent = session.user.accent
  root.dataset.approval = session.user.approvalStatus
  root.dataset.visibility = session.user.visibility
  root.dataset.quality = serverQualityForRenderMode(qualityMode)
  root.dataset.qualityMode = qualityMode
  root.dataset.camera = session.preferences.camera_mode
  root.classList.toggle("reduced-motion", !!session.preferences.reduced_motion)

  const touchLayout =
    globalThis.matchMedia?.("(pointer: coarse)").matches ||
    (globalThis.navigator?.maxTouchPoints ?? 0) > 0
  const dockState = touchLayout
    ? session.preferences.touch_shot_dock
    : session.preferences.desktop_shot_dock
  const cameraMode = {
    aim: "3d",
    top: "2d",
    free: "free",
  }[session.preferences.camera_mode]
  const storageValues: Record<string, string> = {
    "break-builder.cue-style": session.user.cueStyle,
    "break-builder.table-style": session.user.tableStyle,
    "break-builder.environment-style": session.user.environmentStyle,
    "break-builder.shot-dock": dockState,
    "break-builder.master-volume": String(session.preferences.master_volume),
    "break-builder.social-drawer": session.preferences.social_drawer_open
      ? "open"
      : "closed",
    [RENDER_QUALITY_STORAGE_KEY]: qualityMode,
    "billiards-camera-mode": cameraMode,
  }
  try {
    for (const [key, value] of Object.entries(storageValues)) {
      globalThis.localStorage?.setItem(key, value)
    }
    const stored = JSON.parse(
      globalThis.localStorage?.getItem("billiards-launcher-selection") ?? "{}"
    ) as Record<string, unknown>
    globalThis.localStorage?.setItem(
      "billiards-launcher-selection",
      JSON.stringify({
        ...stored,
        quality: qualityMode,
        cueStyle: session.user.cueStyle,
        tableStyle: session.user.tableStyle,
        environmentStyle: session.user.environmentStyle,
      })
    )
  } catch {
    // Personalisation remains active for this page when storage is unavailable.
  }
}

export function accountChip(session: PlatformMe): string {
  const state = approvalLabel(session.user.approvalStatus)
  const initial =
    session.user.displayName.trim().slice(0, 1).toUpperCase() || "B"
  return `
    <a class="platform-account-chip" href="/account" aria-label="打开账号与个性化设置">
      <span class="platform-avatar" aria-hidden="true">${escapeHtml(initial)}</span>
      <span><strong>${escapeHtml(session.user.displayName)}</strong><small>${state}</small></span>
      <i class="ph ph-caret-down" aria-hidden="true"></i>
    </a>`
}

export function approvalLabel(status: PlatformMe["user"]["approvalStatus"]) {
  const labels = {
    pending: "待审核 · 仅离线",
    approved: "在线权限已开启",
    rejected: "审核未通过 · 仅离线",
    revoked: "在线权限已撤销",
  }
  return labels[status]
}

export async function signOut() {
  await apiJson("/api/auth/sign-out", {
    method: "POST",
    body: JSON.stringify({}),
  })
  globalThis.location.assign("/")
}

async function mountAuthGate() {
  disposeAuthPresentation?.()
  document.getElementById("platformGate")?.remove()
  const config = await apiJson<{
    turnstileSiteKey: string | null
    account: { minimumPasswordLength: number }
  }>("/api/config").catch(() => ({
    turnstileSiteKey: null,
    account: { minimumPasswordLength: 10 },
  }))
  const root = document.createElement("section")
  root.id = "platformGate"
  root.className = "platform-gate"
  root.setAttribute("aria-label", "Break Builder 账号入口")
  root.innerHTML = `
    <canvas class="platform-gate__fx" aria-hidden="true"></canvas>
    <div class="platform-gate__shell">
      <header class="platform-gate__brand">
        <a class="platform-wordmark" href="/" aria-label="Break Builder 首页">
          <span class="platform-wordmark__mark"><i class="ph ph-circle-dashed" aria-hidden="true"></i></span>
          <span>BREAK BUILDER</span>
        </a>
        <span class="platform-gate__secure"><i class="ph ph-shield-check" aria-hidden="true"></i> 私有账号系统</span>
      </header>
      <main class="platform-auth-layout">
        <section class="platform-auth-intro">
          <p class="platform-eyebrow">实时 3D 台球空间</p>
          <h1>让每一杆<br />流动起来</h1>
          <p>登录后进入你的球台。球杆、球台、环境、画质与操作偏好会跟随账号同步。</p>
          <div class="platform-spectra-card" aria-hidden="true">
            <span>LIVE SPECTRA</span><strong>WEBGL / GLSL</strong>
            <i class="ph ph-wave-sine"></i>
          </div>
          <ul class="platform-auth-features">
            <li><i class="ph ph-circles-three-plus"></i><span><strong>离线完整可玩</strong>练习、AI 与同屏双人</span></li>
            <li><i class="ph ph-users-three"></i><span><strong>审核后开启在线</strong>好友、邀请、聊天与房间</span></li>
            <li><i class="ph ph-sliders-horizontal"></i><span><strong>跨设备个性化</strong>外观与操作一起同步</span></li>
          </ul>
        </section>
        <section class="platform-auth-card" data-glass="optical" aria-labelledby="authTitle">
          <div class="platform-auth-tabs" role="tablist" aria-label="账号操作">
            <button type="button" role="tab" data-auth-tab="login" aria-selected="true">登录</button>
            <button type="button" role="tab" data-auth-tab="register" aria-selected="false">注册</button>
            <button type="button" role="tab" data-auth-tab="recover" aria-selected="false">重置密码</button>
          </div>
          <div id="authTitle" class="sr-only">账号操作</div>
          <form class="platform-auth-form" data-auth-panel="login">
            <header><p>欢迎回来</p><h2>继续你的下一杆</h2></header>
            <label><span>用户名</span><div class="platform-input"><i class="ph ph-user"></i><input name="username" required minlength="3" maxlength="24" autocomplete="username" /></div></label>
            <label><span>密码</span><div class="platform-input"><i class="ph ph-lock-key"></i><input name="password" type="password" required minlength="${config.account.minimumPasswordLength}" maxlength="128" autocomplete="current-password" /></div></label>
            <div class="platform-turnstile" data-turnstile="login" hidden></div>
            <p class="platform-form-status" aria-live="polite"></p>
            <button class="platform-primary" type="submit"><span>登录并进入</span><i class="ph ph-arrow-right"></i></button>
          </form>
          <form class="platform-auth-form" data-auth-panel="register" hidden>
            <header><p>创建球员档案</p><h2>从离线模式开始</h2></header>
            <div class="platform-form-grid">
              <label><span>用户名</span><div class="platform-input"><i class="ph ph-at"></i><input name="username" required minlength="3" maxlength="24" autocomplete="username" /></div></label>
              <label><span>显示名</span><div class="platform-input"><i class="ph ph-identification-card"></i><input name="displayName" required minlength="2" maxlength="24" autocomplete="nickname" /></div></label>
            </div>
            <label><span>私有邮箱</span><div class="platform-input"><i class="ph ph-envelope-simple"></i><input name="email" type="email" required maxlength="254" autocomplete="email" /></div><small>仅用于你凭恢复码重置密码，不公开，不发送邮件。</small></label>
            <label><span>密码</span><div class="platform-input"><i class="ph ph-password"></i><input name="password" type="password" required minlength="${config.account.minimumPasswordLength}" maxlength="128" autocomplete="new-password" /></div><small>至少 ${config.account.minimumPasswordLength} 位。</small></label>
            <details class="platform-bootstrap"><summary>管理员首次初始化</summary><label><span>一次性管理员邀请码</span><div class="platform-input"><i class="ph ph-key"></i><input name="adminInvite" maxlength="128" autocomplete="off" /></div></label></details>
            <div class="platform-turnstile" data-turnstile="signup"></div>
            <p class="platform-form-status" aria-live="polite"></p>
            <button class="platform-primary" type="submit"><span>创建账号</span><i class="ph ph-arrow-right"></i></button>
            <p class="platform-form-note"><i class="ph ph-clock"></i> 注册后可立即玩离线；管理员通过审核后开启在线功能。</p>
          </form>
          <form class="platform-auth-form" data-auth-panel="recover" hidden>
            <header><p>无需邮件服务</p><h2>使用一次性恢复码</h2></header>
            <div class="platform-form-grid">
              <label><span>注册邮箱</span><div class="platform-input"><i class="ph ph-envelope-simple"></i><input name="email" type="email" required autocomplete="email" /></div></label>
              <label><span>用户名</span><div class="platform-input"><i class="ph ph-user"></i><input name="username" required autocomplete="username" /></div></label>
            </div>
            <label><span>一次性恢复码</span><div class="platform-input"><i class="ph ph-ticket"></i><input name="recoveryCode" required minlength="8" maxlength="64" autocomplete="one-time-code" /></div></label>
            <label><span>新密码</span><div class="platform-input"><i class="ph ph-lock-key-open"></i><input name="newPassword" type="password" required minlength="${config.account.minimumPasswordLength}" maxlength="128" autocomplete="new-password" /></div></label>
            <div class="platform-turnstile" data-turnstile="recovery"></div>
            <p class="platform-form-status" aria-live="polite"></p>
            <button class="platform-primary" type="submit"><span>重置密码</span><i class="ph ph-arrow-counter-clockwise"></i></button>
            <p class="platform-form-note"><i class="ph ph-shield-warning"></i> 仅知道邮箱不能重置；必须同时提供用户名与未使用的恢复码。</p>
          </form>
        </section>
      </main>
      <footer class="platform-gate__footer"><span>© Break Builder</span><a href="/rules">规则与许可证</a><span>WebGL2 安全降级</span></footer>
    </div>`
  document.body.append(root)
  const canvas = root.querySelector("canvas")!
  const glass = mountGlassOverlay(root, canvas)
  const background = mountSpectraFx(canvas, {
    interactive: true,
    onRender: (now) => glass.render(now),
  })
  const onPageHide = (event: PageTransitionEvent) => {
    if (!event.persisted) disposeAuthPresentation?.()
  }
  disposeAuthPresentation = () => {
    window.removeEventListener("pagehide", onPageHide)
    background.dispose()
    glass.dispose()
    disposeAuthPresentation = null
  }
  window.addEventListener("pagehide", onPageHide)
  initialiseTabs(root)
  initialiseAuthForms(root, config.turnstileSiteKey)
}

function initialiseTabs(root: HTMLElement) {
  const buttons = [
    ...root.querySelectorAll<HTMLButtonElement>("[data-auth-tab]"),
  ]
  const panels = [...root.querySelectorAll<HTMLElement>("[data-auth-panel]")]
  for (const button of buttons) {
    button.addEventListener("click", () => {
      const target = button.dataset.authTab
      for (const item of buttons) {
        item.setAttribute("aria-selected", String(item === button))
      }
      for (const panel of panels)
        panel.hidden = panel.dataset.authPanel !== target
      panels
        .find((panel) => !panel.hidden)
        ?.querySelector<HTMLInputElement>("input")
        ?.focus()
    })
  }
}

function initialiseAuthForms(root: HTMLElement, siteKey: string | null) {
  const tokens = new Map<string, string>()
  const widgets = new Map<string, string>()
  if (siteKey) {
    void loadTurnstile().then((turnstile) => {
      for (const element of root.querySelectorAll<HTMLElement>(
        "[data-turnstile]"
      )) {
        const action = element.dataset.turnstile!
        const widget = turnstile.render(element, {
          sitekey: siteKey,
          action,
          theme: "light",
          size: "flexible",
          callback: (token) => tokens.set(action, token),
          "expired-callback": () => tokens.delete(action),
          "error-callback": () => tokens.delete(action),
        })
        widgets.set(action, widget)
      }
    })
  }
  const login = root.querySelector<HTMLFormElement>(
    '[data-auth-panel="login"]'
  )!
  const register = root.querySelector<HTMLFormElement>(
    '[data-auth-panel="register"]'
  )!
  const recover = root.querySelector<HTMLFormElement>(
    '[data-auth-panel="recover"]'
  )!

  login.addEventListener("submit", (event) => {
    event.preventDefault()
    void submitForm(login, async (data) => {
      const response = await fetch("/api/auth/sign-in/username", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          "X-Turnstile-Token": tokens.get("login") ?? "",
        },
        body: JSON.stringify({
          username: data.get("username"),
          password: data.get("password"),
          rememberMe: true,
        }),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new ApiError(
          response.status,
          payload?.error?.code ?? "login_failed",
          payload?.error?.message ?? "用户名或密码不正确"
        )
      }
      globalThis.location.reload()
    })
  })
  register.addEventListener("submit", (event) => {
    event.preventDefault()
    void submitForm(register, async (data) => {
      const result = await apiJson<{
        recoveryCodes: string[]
        message: string
        approvalStatus: string
      }>("/api/register", {
        method: "POST",
        body: JSON.stringify({
          username: data.get("username"),
          displayName: data.get("displayName"),
          email: data.get("email"),
          password: data.get("password"),
          adminInvite: data.get("adminInvite") || undefined,
          turnstileToken: tokens.get("signup") ?? "",
        }),
      })
      showRecoveryCodes(root, result.recoveryCodes, result.message)
    })
  })
  recover.addEventListener("submit", (event) => {
    event.preventDefault()
    void submitForm(recover, async (data) => {
      await apiJson("/api/recover", {
        method: "POST",
        body: JSON.stringify({
          email: data.get("email"),
          username: data.get("username"),
          recoveryCode: data.get("recoveryCode"),
          newPassword: data.get("newPassword"),
          turnstileToken: tokens.get("recovery") ?? "",
        }),
      })
      setStatus(recover, "密码已重置，请切换到登录。", "success")
    })
  })
  for (const form of [login, register, recover]) {
    form.addEventListener("platform:reset-turnstile", () => {
      const action =
        form.dataset.authPanel === "register"
          ? "signup"
          : form.dataset.authPanel!
      const widget = widgets.get(action)
      if (widget && globalThis.turnstile) globalThis.turnstile.reset(widget)
      tokens.delete(action)
    })
  }
}

async function submitForm(
  form: HTMLFormElement,
  handler: (data: FormData) => Promise<void>
) {
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!
  const original = button.querySelector("span")?.textContent ?? "提交"
  button.disabled = true
  button.dataset.loading = "true"
  if (button.querySelector("span"))
    button.querySelector("span")!.textContent = "正在处理…"
  setStatus(form, "", "")
  try {
    await handler(new FormData(form))
  } catch (error) {
    setStatus(
      form,
      error instanceof Error ? error.message : "操作失败，请稍后重试",
      "error"
    )
    form.dispatchEvent(new CustomEvent("platform:reset-turnstile"))
  } finally {
    button.disabled = false
    delete button.dataset.loading
    if (button.querySelector("span"))
      button.querySelector("span")!.textContent = original
  }
}

function setStatus(form: HTMLFormElement, message: string, state: string) {
  const status = form.querySelector<HTMLElement>(".platform-form-status")!
  status.textContent = message
  status.dataset.state = state
}

function showRecoveryCodes(
  root: HTMLElement,
  codes: string[],
  message: string
) {
  const modal = document.createElement("div")
  modal.className = "platform-modal"
  modal.setAttribute("role", "dialog")
  modal.setAttribute("aria-modal", "true")
  modal.setAttribute("aria-labelledby", "recoveryCodesTitle")
  modal.innerHTML = `
    <div class="platform-modal__card" data-glass="optical">
      <span class="platform-modal__icon"><i class="ph ph-key"></i></span>
      <p class="platform-eyebrow">账号创建成功</p>
      <h2 id="recoveryCodesTitle">保存一次性恢复码</h2>
      <p class="platform-modal__lede"></p>
      <div class="platform-recovery-grid"></div>
      <p class="platform-form-note"><i class="ph ph-warning"></i> 离开后不会再次显示。每个恢复码只能使用一次。</p>
      <div class="platform-modal__actions">
        <button type="button" data-copy-codes><i class="ph ph-copy"></i> 复制全部</button>
        <button type="button" data-download-codes><i class="ph ph-download-simple"></i> 下载文本</button>
        <button type="button" class="platform-primary" data-continue><span>我已安全保存</span><i class="ph ph-arrow-right"></i></button>
      </div>
    </div>`
  modal.querySelector<HTMLElement>(".platform-modal__lede")!.textContent =
    message
  const grid = modal.querySelector<HTMLElement>(".platform-recovery-grid")!
  for (const code of codes) {
    const item = document.createElement("code")
    item.textContent = code
    grid.append(item)
  }
  const text = `Break Builder 一次性恢复码\n\n${codes.join("\n")}\n\n请离线安全保存。每个恢复码只能使用一次。`
  modal.querySelector<HTMLButtonElement>("[data-copy-codes]")!.onclick =
    async () => {
      await navigator.clipboard.writeText(text)
    }
  modal.querySelector<HTMLButtonElement>("[data-download-codes]")!.onclick =
    () => {
      const link = document.createElement("a")
      link.href = URL.createObjectURL(
        new Blob([text], { type: "text/plain;charset=utf-8" })
      )
      link.download = "break-builder-recovery-codes.txt"
      link.click()
      URL.revokeObjectURL(link.href)
    }
  modal.querySelector<HTMLButtonElement>("[data-continue]")!.onclick = () => {
    globalThis.location.reload()
  }
  root.append(modal)
  modal.querySelector<HTMLButtonElement>("[data-copy-codes]")?.focus()
}

function loadTurnstile(): Promise<TurnstileApi> {
  if (globalThis.turnstile) return Promise.resolve(globalThis.turnstile)
  if (turnstilePromise) return turnstilePromise
  turnstilePromise = new Promise((resolve, reject) => {
    const script = document.createElement("script")
    script.src =
      "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
    script.async = true
    script.defer = true
    script.onload = () => {
      if (globalThis.turnstile) resolve(globalThis.turnstile)
      else reject(new Error("人机验证加载失败"))
    }
    script.onerror = () => reject(new Error("人机验证加载失败"))
    document.head.append(script)
  })
  return turnstilePromise
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
}
