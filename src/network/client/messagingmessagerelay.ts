import { MessageRelay } from "./messagerelay"

type GameSocketMessage =
  | {
      type: "game.event"
      seq: number
      event: unknown
    }
  | {
      type: "game.resync"
      events: Array<{ seq: number; event: unknown }>
    }
  | {
      type: "room.joined"
      role: GameRoomMember["role"]
      lastSeq: number
      members?: GameRoomMember[]
      roomState?: RoomStateSnapshot
    }
  | { type: "room.member_changed"; members?: GameRoomMember[] }
  | { type: "room.state"; roomState: RoomStateSnapshot }
  | {
      type: "room.started"
      breakerUserId: string
      roomState: RoomStateSnapshot
    }
  | { type: "room.error"; code: string; message: string }
  | { type: "room.revoked"; reason: string }
  | { type: string }

export interface GameRoomMember {
  userId: string
  username: string
  displayName: string
  avatarUrl?: string | null
  cueStyle: string
  role: "host" | "player" | "spectator"
}

export interface RoomStateSnapshot {
  version: 1
  revision: number
  phase: "waiting" | "active" | "cancelled"
  ready: { host: boolean; player: boolean }
  startedAt: number | null
  members: Array<GameRoomMember & { connected: boolean; ready: boolean }>
}

export class MessagingMessageRelay implements MessageRelay {
  private socket: WebSocket | null = null
  private callback: ((message: string) => void) | null = null
  private readonly queue: string[] = []
  private stopped = false
  private reconnectAttempt = 0
  private reconnectTimer: ReturnType<typeof globalThis.setTimeout> | null = null
  private lastSeq = 0
  private clientSeq = 0
  onMembersChanged?: (members: GameRoomMember[]) => void
  onRoomJoined?: (role: GameRoomMember["role"]) => void
  onRoomState?: (state: RoomStateSnapshot) => void
  onRoomStarted?: (breakerUserId: string, state: RoomStateSnapshot) => void
  onRoomError?: (code: string, message: string) => void

  constructor(private readonly roomId?: string) {}

  subscribe(
    _channel: string,
    callback: (message: string) => void,
    _prefix?: string
  ): void {
    this.callback = callback
    this.connect()
  }

  publish(_channel: string, message: string, _prefix?: string): void {
    if (!this.roomId) return
    const envelope = JSON.stringify({
      type: "game.event",
      clientSeq: ++this.clientSeq,
      event: JSON.parse(message),
    })
    this.sendOrQueue(envelope)
  }

  setReady(ready: boolean): void {
    this.sendOrQueue(JSON.stringify({ type: "room.ready.set", ready }))
  }

  stop(): void {
    this.stopped = true
    if (this.reconnectTimer !== null) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
    this.socket?.close(1000, "client closed")
    this.socket = null
    this.callback = null
    this.queue.length = 0
    this.onMembersChanged = undefined
    this.onRoomJoined = undefined
    this.onRoomState = undefined
    this.onRoomStarted = undefined
    this.onRoomError = undefined
  }

  private connect() {
    if (
      !this.roomId ||
      this.stopped ||
      this.socket?.readyState === WebSocket.OPEN ||
      this.socket?.readyState === WebSocket.CONNECTING
    ) {
      return
    }
    const protocol = globalThis.location.protocol === "https:" ? "wss:" : "ws:"
    const url = `${protocol}//${globalThis.location.host}/ws/game/${encodeURIComponent(this.roomId)}`
    const socket = new WebSocket(url)
    this.socket = socket
    socket.addEventListener("open", () => {
      this.reconnectAttempt = 0
      while (this.queue.length && socket.readyState === WebSocket.OPEN) {
        socket.send(this.queue.shift()!)
      }
      if (this.lastSeq > 0) {
        socket.send(
          JSON.stringify({ type: "game.resync", sinceSeq: this.lastSeq })
        )
      }
    })
    socket.addEventListener("message", (event) => this.receive(event.data))
    socket.addEventListener("close", (event) => {
      if (this.socket === socket) this.socket = null
      if (!this.stopped && event.code !== 4403) this.scheduleReconnect()
    })
    socket.addEventListener("error", () => socket.close())
  }

  private receive(raw: unknown) {
    if (typeof raw !== "string") return
    const message = this.parseMessage(raw)
    if (!message) return
    if (this.receiveGameMessage(message)) return
    this.receiveRoomMessage(message)
  }

  private parseMessage(raw: string): GameSocketMessage | undefined {
    try {
      return JSON.parse(raw) as GameSocketMessage
    } catch {
      return undefined
    }
  }

  private receiveGameMessage(message: GameSocketMessage): boolean {
    if (message.type === "game.event" && "event" in message) {
      this.lastSeq = Math.max(this.lastSeq, message.seq)
      this.callback?.(JSON.stringify(message.event))
      return true
    }
    if (message.type !== "game.resync" || !("events" in message)) return false
    for (const event of message.events) {
      if (event.seq <= this.lastSeq) continue
      this.lastSeq = event.seq
      this.callback?.(JSON.stringify(event.event))
    }
    return true
  }

  private receiveRoomMessage(message: GameSocketMessage) {
    if (message.type === "room.revoked") {
      this.stopped = true
      return
    }
    if (message.type === "room.state" && "roomState" in message) {
      this.onRoomState?.(message.roomState)
      this.onMembersChanged?.(message.roomState.members)
      return
    }
    if (message.type === "room.started" && "roomState" in message) {
      this.onRoomStarted?.(message.breakerUserId, message.roomState)
      return
    }
    if (message.type === "room.error" && "code" in message) {
      this.onRoomError?.(message.code, message.message)
      return
    }
    this.receiveMemberMessage(message)
  }

  private receiveMemberMessage(message: GameSocketMessage) {
    if ("members" in message) {
      this.onMembersChanged?.(message.members ?? [])
    }
    if (message.type !== "room.joined" || !("role" in message)) return
    this.onRoomJoined?.(message.role)
    if (message.roomState) this.onRoomState?.(message.roomState)
  }

  private sendOrQueue(message: string) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(message)
    } else {
      this.queue.push(message)
      this.connect()
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer !== null) return
    const delay = Math.min(12_000, 500 * 2 ** this.reconnectAttempt)
    this.reconnectAttempt = Math.min(this.reconnectAttempt + 1, 6)
    this.reconnectTimer = globalThis.setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, delay)
  }
}
