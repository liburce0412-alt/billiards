import { Rules } from "../controller/rules/rules"
import { id } from "../utils/dom"

type PresenceUser = {
  userId: string
  displayName: string
  visibility: string
}

type SocialMessage =
  | { type: "presence.snapshot"; users: PresenceUser[]; visibleCount: number }
  | { type: "invite.created"; invite: { challengerName: string } }
  | { type: "moderation.session_revoked"; reason: string }
  | { type: string }

export class LobbyIndicator {
  private readonly listenerAbort = new AbortController()
  private readonly element: HTMLElement | null
  private readonly countElement: HTMLSpanElement | null
  private readonly challengePill: HTMLElement | null
  private readonly drawer = id("gameSocialDrawer")
  private readonly drawerUsers = id("gameSocialUsers")
  private readonly drawerCount = id("gameSocialCount")
  private readonly drawerSelf = id("gameSocialSelf")
  private readonly socialDock = id("gameSocialDock") as HTMLButtonElement | null
  private socket: WebSocket | null = null
  private count = 0
  private users: PresenceUser[] = []
  private challengerName: string | null = null
  private currentTableId: string | null = null

  constructor(
    _botMode: boolean,
    private readonly replayMode: boolean,
    _rules: Rules,
    _onChatMessage?: (msg: string) => void,
    _messagingUrl?: string,
    _onShowOverlay?: (url: string) => void
  ) {
    this.element = id("lobbyOverlay")
    this.countElement = this.element?.querySelector(
      ".lobby-count"
    ) as HTMLSpanElement | null
    this.challengePill = id("challengePill")
    this.setupElement()
    this.setupDrawer()
  }

  private setupElement() {
    if (this.element instanceof HTMLAnchorElement) {
      this.element.href = "/lobby"
      this.element.target = "_self"
      this.element.rel = "noopener"
    }
    id("challengeDecline")?.addEventListener(
      "click",
      (event) => {
        event.stopPropagation()
        this.challengerName = null
        this.updateDisplay()
      },
      { signal: this.listenerAbort.signal }
    )
    id("challengeAccept")?.addEventListener(
      "click",
      () => {
        globalThis.location.assign("/lobby")
      },
      { signal: this.listenerAbort.signal }
    )
  }

  private setupDrawer() {
    let open = false
    const compactTouchLayout =
      globalThis.matchMedia?.("(pointer: coarse)").matches ?? false
    try {
      const saved = globalThis.localStorage?.getItem(
        "break-builder.social-drawer"
      )
      if (!compactTouchLayout && (saved === "open" || saved === "closed")) {
        open = saved === "open"
      }
    } catch {
      // The drawer remains collapsed when storage is unavailable.
    }
    this.setDrawerOpen(open)
    id("gameSocialToggle")?.addEventListener(
      "click",
      () => this.setDrawerOpen(this.drawer?.hasAttribute("hidden") ?? true),
      { signal: this.listenerAbort.signal }
    )
    id("gameSocialClose")?.addEventListener(
      "click",
      () => this.setDrawerOpen(false),
      { signal: this.listenerAbort.signal }
    )
    this.socialDock?.addEventListener("click", () => this.setDrawerOpen(true), {
      signal: this.listenerAbort.signal,
    })
  }

  private setDrawerOpen(open: boolean) {
    this.drawer?.toggleAttribute("hidden", !open)
    this.drawer?.setAttribute("aria-hidden", String(!open))
    const toggle = id("gameSocialToggle")
    toggle?.setAttribute("aria-expanded", String(open))
    toggle?.setAttribute("aria-label", open ? "收起局内社交" : "展开局内社交")
    const icon = toggle?.querySelector("i")
    icon?.classList.toggle("ph-caret-right", open)
    icon?.classList.toggle("ph-caret-left", !open)
    document.body.classList.toggle("social-drawer-open", open)
    if (this.socialDock) {
      this.socialDock.hidden = open
      this.socialDock.setAttribute("aria-expanded", String(open))
    }
    try {
      globalThis.localStorage?.setItem(
        "break-builder.social-drawer",
        open ? "open" : "closed"
      )
    } catch {
      // The live drawer interaction does not depend on persistence.
    }
  }

  async init(): Promise<void> {
    const platform = (
      globalThis as typeof globalThis & {
        __BREAK_BUILDER_SESSION__?: {
          capabilities: { social: boolean }
        }
      }
    ).__BREAK_BUILDER_SESSION__
    if (!this.element || !platform?.capabilities.social || this.replayMode) {
      this.updateDisplay()
      return
    }
    const protocol = globalThis.location.protocol === "https:" ? "wss:" : "ws:"
    this.socket = new WebSocket(
      `${protocol}//${globalThis.location.host}/ws/social`
    )
    this.socket.addEventListener(
      "message",
      (event) => this.receive(event.data),
      { signal: this.listenerAbort.signal }
    )
    this.socket.addEventListener(
      "close",
      () => {
        this.count = 0
        this.updateDisplay()
      },
      { signal: this.listenerAbort.signal }
    )
    this.updateDisplay()
  }

  setTableId(tableId: string | null | undefined): void {
    this.currentTableId = tableId ?? null
    this.updateDisplay()
  }

  async stop(): Promise<void> {
    this.setDrawerOpen(false)
    this.listenerAbort.abort()
    this.socket?.close(1000, "game closed")
    this.socket = null
    document.body.classList.remove("social-drawer-open")
    this.drawer?.setAttribute("hidden", "true")
    this.drawer?.setAttribute("aria-hidden", "true")
    const toggle = id("gameSocialToggle")
    toggle?.setAttribute("aria-expanded", "false")
    this.socialDock?.setAttribute("aria-expanded", "false")
    if (this.socialDock) this.socialDock.hidden = false
  }

  private receive(raw: unknown) {
    if (typeof raw !== "string") return
    let message: SocialMessage
    try {
      message = JSON.parse(raw) as SocialMessage
    } catch {
      return
    }
    if (message.type === "presence.snapshot" && "visibleCount" in message) {
      this.count = message.visibleCount
      this.users = message.users
    } else if (message.type === "invite.created" && "invite" in message) {
      this.challengerName = message.invite.challengerName
    } else if (
      message.type === "moderation.session_revoked" &&
      "reason" in message
    ) {
      this.count = 0
      this.socket?.close(4403, message.reason)
    }
    this.updateDisplay()
  }

  private updateDisplay() {
    if (this.countElement) {
      const suffix = this.currentTableId ? " · 对局中" : ""
      this.countElement.textContent = `${this.count} 在线${suffix}`
    }
    if (this.element) {
      this.element.setAttribute("aria-label", `社交大厅，${this.count} 人在线`)
    }
    const dockCount = this.socialDock?.querySelector("strong")
    if (dockCount) dockCount.textContent = `${this.count} 在线`
    if (this.challengePill) {
      this.challengePill.hidden = !this.challengerName
      const label =
        this.challengePill.querySelector<HTMLElement>(".challenge-label")
      if (label)
        label.textContent = this.challengerName
          ? `${this.challengerName} 邀请你比赛`
          : ""
    }
    this.renderDrawer()
  }

  private renderDrawer() {
    if (this.drawerCount) this.drawerCount.textContent = String(this.count)
    if (this.drawerSelf) {
      const platform = (
        globalThis as typeof globalThis & {
          __BREAK_BUILDER_SESSION__?: {
            user: { displayName: string; visibility: string }
          }
        }
      ).__BREAK_BUILDER_SESSION__
      this.drawerSelf.replaceChildren()
      if (platform) {
        this.drawerSelf.append(
          this.userRow(
            platform.user.displayName,
            platform.user.visibility,
            true
          )
        )
        const visibility = document.createElement("button")
        visibility.className = "game-social-visibility"
        visibility.type = "button"
        visibility.textContent = `在线可见：${this.visibilityLabel(
          platform.user.visibility
        )}`
        visibility.addEventListener(
          "click",
          () => globalThis.location.assign("/lobby"),
          { signal: this.listenerAbort.signal }
        )
        this.drawerSelf.append(visibility)
      }
    }
    if (!this.drawerUsers) return
    this.drawerUsers.replaceChildren()
    const ownId = (
      globalThis as typeof globalThis & {
        __BREAK_BUILDER_SESSION__?: { user: { id?: string } }
      }
    ).__BREAK_BUILDER_SESSION__?.user.id
    const visible = this.users.filter(
      (user) => user.userId !== ownId && user.visibility !== "invisible"
    )
    if (!visible.length) {
      const empty = document.createElement("li")
      empty.className = "game-social-empty"
      empty.textContent = "好友上线后会实时出现在这里"
      this.drawerUsers.append(empty)
      return
    }
    for (const user of visible.slice(0, 10)) {
      this.drawerUsers.append(this.userRow(user.displayName, user.visibility))
    }
  }

  private userRow(name: string, visibility: string, self = false) {
    const row = document.createElement(self ? "div" : "button")
    row.className = "game-social-user"
    if (row instanceof HTMLButtonElement) {
      row.type = "button"
      row.title = "前往社交大厅联系球友"
      row.addEventListener(
        "click",
        () => globalThis.location.assign("/lobby"),
        { signal: this.listenerAbort.signal }
      )
    }
    const avatar = document.createElement("span")
    avatar.className = "game-social-avatar"
    avatar.textContent = name.trim().slice(0, 1).toUpperCase() || "B"
    const copy = document.createElement("span")
    const strong = document.createElement("strong")
    strong.textContent = self ? `${name}（我）` : name
    const small = document.createElement("small")
    small.textContent = this.visibilityLabel(visibility)
    copy.append(strong, small)
    const dot = document.createElement("i")
    dot.className = "game-social-dot"
    dot.dataset.state = visibility
    row.append(avatar, copy, dot)
    return row
  }

  private visibilityLabel(visibility: string) {
    return (
      (
        {
          online: "在线",
          away: "暂离",
          dnd: "勿扰",
          invisible: "隐身",
        } as Record<string, string>
      )[visibility] ?? "离线"
    )
  }
}
