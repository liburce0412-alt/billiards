import { LobbyIndicator } from "../../src/view/lobbyindicator"
import { initDom } from "./dom"
import { Session } from "../../src/network/client/session"

type SocketListener = (event: any) => void

class FakeWebSocket {
  static instances: FakeWebSocket[] = []
  readonly listeners = new Map<string, SocketListener[]>()
  closed = false

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this)
  }

  addEventListener(type: string, listener: SocketListener) {
    const listeners = this.listeners.get(type) ?? []
    listeners.push(listener)
    this.listeners.set(type, listeners)
  }

  close() {
    this.closed = true
  }

  message(payload: unknown) {
    for (const listener of this.listeners.get("message") ?? []) {
      listener({ data: JSON.stringify(payload) })
    }
  }
}

describe("LobbyIndicator", () => {
  const originalWebSocket = globalThis.WebSocket

  beforeEach(() => {
    initDom()
    FakeWebSocket.instances = []
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket
    ;(
      globalThis as typeof globalThis & {
        __BREAK_BUILDER_SESSION__?: unknown
      }
    ).__BREAK_BUILDER_SESSION__ = {
      capabilities: { social: true },
      user: {
        id: "self",
        displayName: "未来玩家",
        visibility: "online",
      },
    }
    Session.init("self", "未来玩家", "table-1", false)
  })

  afterEach(() => {
    globalThis.WebSocket = originalWebSocket
    delete (
      globalThis as typeof globalThis & {
        __BREAK_BUILDER_SESSION__?: unknown
      }
    ).__BREAK_BUILDER_SESSION__
    Session.reset()
  })

  it("uses the same-origin social socket and renders safe presence rows", async () => {
    const indicator = new LobbyIndicator(false, false, {} as any)
    await indicator.init()
    expect(FakeWebSocket.instances[0].url).toBe("ws://localhost/ws/social")

    FakeWebSocket.instances[0].message({
      type: "presence.snapshot",
      visibleCount: 3,
      users: [
        { userId: "self", displayName: "未来玩家", visibility: "online" },
        { userId: "alice", displayName: "<img onerror=1>", visibility: "away" },
        { userId: "hidden", displayName: "隐身者", visibility: "invisible" },
      ],
    })

    expect(document.querySelector(".lobby-count")?.textContent).toBe("3 在线")
    expect(document.getElementById("gameSocialUsers")?.textContent).toContain(
      "<img onerror=1>"
    )
    expect(document.getElementById("gameSocialUsers")?.innerHTML).not.toContain(
      "<img onerror=1>"
    )
    expect(
      document.getElementById("gameSocialUsers")?.textContent
    ).not.toContain("隐身者")
    expect(document.querySelector(".game-social-visibility")?.textContent).toBe(
      "在线可见：在线"
    )
    expect(
      document.querySelector("#gameSocialUsers button.game-social-user")
    ).not.toBeNull()
  })

  it("keeps the desktop social panel in the lower-left opt-in state", () => {
    new LobbyIndicator(false, false, {} as any)
    expect(document.getElementById("gameSocialDrawer")?.hidden).toBe(true)
    document.getElementById("gameSocialToggle")?.click()
    expect(document.getElementById("gameSocialDrawer")?.hidden).toBe(false)
  })

  it("shows a live invite without accepting an injected destination", async () => {
    const indicator = new LobbyIndicator(false, false, {} as any)
    await indicator.init()
    FakeWebSocket.instances[0].message({
      type: "invite.created",
      invite: { challengerName: "Alice", url: "javascript:alert(1)" },
    })

    const pill = document.getElementById("challengePill")!
    expect(pill.hidden).toBe(false)
    expect(pill.textContent).toContain("Alice 邀请你比赛")
    expect(document.getElementById("lobbyOverlay")?.getAttribute("href")).toBe(
      "/lobby"
    )
  })

  it("adds the active-game suffix and closes cleanly", async () => {
    const indicator = new LobbyIndicator(false, false, {} as any)
    await indicator.init()
    FakeWebSocket.instances[0].message({
      type: "presence.snapshot",
      visibleCount: 1,
      users: [],
    })
    indicator.setTableId("table-1")
    expect(document.querySelector(".lobby-count")?.textContent).toBe(
      "1 在线 · 对局中"
    )

    await indicator.stop()
    expect(FakeWebSocket.instances[0].closed).toBe(true)
  })

  it("keeps presence live during local and AI matches", async () => {
    const indicator = new LobbyIndicator(true, false, {} as any)
    await indicator.init()
    expect(FakeWebSocket.instances).toHaveLength(1)
    expect(document.querySelector(".lobby-count")?.textContent).toBe("0 在线")
  })
})
