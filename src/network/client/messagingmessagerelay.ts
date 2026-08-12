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
  | { type: "room.joined"; lastSeq: number }
  | { type: "room.revoked"; reason: string }
  | { type: string }

export class MessagingMessageRelay implements MessageRelay {
  private socket: WebSocket | null = null
  private callback: ((message: string) => void) | null = null
  private readonly queue: string[] = []
  private stopped = false
  private reconnectAttempt = 0
  private reconnectTimer: ReturnType<typeof globalThis.setTimeout> | null = null
  private lastSeq = 0
  private clientSeq = 0

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
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(envelope)
    } else {
      this.queue.push(envelope)
      this.connect()
    }
  }

  stop(): void {
    this.stopped = true
    if (this.reconnectTimer !== null) clearTimeout(this.reconnectTimer)
    this.socket?.close(1000, "client closed")
    this.socket = null
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
    let message: GameSocketMessage
    try {
      message = JSON.parse(raw) as GameSocketMessage
    } catch {
      return
    }
    if (message.type === "game.event" && "event" in message) {
      this.lastSeq = Math.max(this.lastSeq, message.seq)
      this.callback?.(JSON.stringify(message.event))
    } else if (message.type === "game.resync" && "events" in message) {
      for (const event of message.events) {
        if (event.seq <= this.lastSeq) continue
        this.lastSeq = event.seq
        this.callback?.(JSON.stringify(event.event))
      }
    } else if (message.type === "room.revoked") {
      this.stopped = true
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
