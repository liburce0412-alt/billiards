import { DurableObject } from "cloudflare:workers"
import type { PlatformEnv } from "../env"

type MemberRole = "host" | "player" | "spectator"
type GameAttachment = {
  userId: string
  displayName: string
  memberRole: MemberRole
  connectedAt: number
}

type StoredEvent = {
  seq: number
  sender_id: string
  event_type: string
  payload: string
  created_at: number
}

const PLAYER_EVENTS = new Set([
  "BEGIN",
  "BREAK",
  "WATCHAIM",
  "AIM",
  "HIT",
  "STATIONARY",
  "CHAT",
  "ABORT",
  "PLACEBALL",
  "REJOIN",
  "RERACK",
  "STARTAIM",
  "NOTIFICATION",
  "SCORE",
  "CONCEDE",
  "ROOM_CONTROL",
  "RULE_DECISION",
])

export class GameRoom extends DurableObject<PlatformEnv> {
  constructor(ctx: DurableObjectState, env: PlatformEnv) {
    super(ctx, env)
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS events (
          seq INTEGER PRIMARY KEY AUTOINCREMENT,
          sender_id TEXT NOT NULL,
          event_type TEXT NOT NULL,
          payload TEXT NOT NULL,
          created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS snapshots (
          id INTEGER PRIMARY KEY CHECK(id = 1),
          seq INTEGER NOT NULL,
          payload TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        );
      `)
    })
  }

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 })
    }
    const userId = request.headers.get("X-Platform-User-Id")
    const encodedDisplayName = request.headers.get("X-Platform-Display-Name")
    const memberRole = request.headers.get(
      "X-Platform-Member-Role"
    ) as MemberRole | null
    if (!userId || !encodedDisplayName || !memberRole) {
      return new Response("Unauthorized", { status: 401 })
    }
    const displayName = decodeURIComponent(encodedDisplayName)
    const pair = new WebSocketPair()
    const server = pair[1]
    const attachment: GameAttachment = {
      userId,
      displayName,
      memberRole,
      connectedAt: Date.now(),
    }
    server.serializeAttachment(attachment)
    this.ctx.acceptWebSocket(server, [`user:${userId}`, `role:${memberRole}`])
    const latest = this.ctx.storage.sql
      .exec<StoredEvent>(
        "SELECT seq, sender_id, event_type, payload, created_at FROM events ORDER BY seq DESC LIMIT 1"
      )
      .toArray()[0]
    const snapshot = this.ctx.storage.sql
      .exec<{ seq: number; payload: string }>(
        "SELECT seq, payload FROM snapshots WHERE id = 1"
      )
      .toArray()[0]
    server.send(
      JSON.stringify({
        type: "room.joined",
        role: memberRole,
        lastSeq: latest?.seq ?? 0,
        snapshot: snapshot
          ? { seq: snapshot.seq, data: JSON.parse(snapshot.payload) }
          : null,
        members: this.memberSnapshot(),
      })
    )
    this.broadcast({
      type: "room.member_changed",
      members: this.memberSnapshot(),
    })
    return new Response(null, { status: 101, webSocket: pair[0] })
  }

  override async webSocketMessage(
    socket: WebSocket,
    raw: string | ArrayBuffer
  ) {
    const member = socket.deserializeAttachment() as GameAttachment
    if (typeof raw !== "string" || raw.length > 196_608) {
      this.sendError(socket, "invalid_event", "对局事件过大")
      return
    }
    let message: {
      type?: string
      clientSeq?: number
      event?: { type?: string; [key: string]: unknown }
      sinceSeq?: number
    }
    try {
      message = JSON.parse(raw)
    } catch {
      this.sendError(socket, "invalid_json", "对局事件格式不正确")
      return
    }
    if (message.type === "game.resync") {
      this.sendHistory(socket, Math.max(0, Number(message.sinceSeq) || 0))
      return
    }
    if (message.type !== "game.event" || !message.event?.type) {
      this.sendError(socket, "invalid_event", "不支持这个对局操作")
      return
    }
    if (member.memberRole === "spectator") {
      this.sendError(socket, "spectator_read_only", "观众只能查看比赛")
      return
    }
    const eventType = String(message.event.type).toUpperCase()
    if (!PLAYER_EVENTS.has(eventType)) {
      this.sendError(socket, "event_not_allowed", "不支持这个对局事件")
      return
    }
    const now = Date.now()
    const stampedEvent = {
      ...message.event,
      clientId: member.userId,
      playername: member.displayName,
    }
    const payload = JSON.stringify(stampedEvent)
    const result = this.ctx.storage.sql
      .exec<{ seq: number }>(
        "INSERT INTO events(sender_id, event_type, payload, created_at) VALUES (?, ?, ?, ?) RETURNING seq",
        member.userId,
        eventType,
        payload,
        now
      )
      .one()
    if (["BREAK", "STATIONARY", "REJOIN", "RERACK"].includes(eventType)) {
      this.ctx.storage.sql.exec(
        "INSERT INTO snapshots(id, seq, payload, updated_at) VALUES (1, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET seq = excluded.seq, payload = excluded.payload, updated_at = excluded.updated_at",
        result.seq,
        payload,
        now
      )
    }
    this.broadcast({
      type: "game.event",
      seq: result.seq,
      senderId: member.userId,
      senderName: member.displayName,
      clientSeq: message.clientSeq,
      event: stampedEvent,
      createdAt: now,
    })
    if (result.seq % 500 === 0) {
      this.ctx.storage.sql.exec(
        "DELETE FROM events WHERE seq < ? AND seq < COALESCE((SELECT seq FROM snapshots WHERE id = 1), ?)",
        result.seq - 2000,
        result.seq - 2000
      )
    }
  }

  override async webSocketClose(socket: WebSocket) {
    try {
      socket.close(1000, "closed")
    } finally {
      this.broadcast({
        type: "room.member_changed",
        members: this.memberSnapshot(),
      })
    }
  }

  async revokeUser(userId: string, reason: string): Promise<number> {
    let count = 0
    for (const socket of this.ctx.getWebSockets(`user:${userId}`)) {
      socket.send(JSON.stringify({ type: "room.revoked", reason }))
      socket.close(4403, reason.slice(0, 120))
      count += 1
    }
    return count
  }

  private sendHistory(socket: WebSocket, sinceSeq: number) {
    const events = this.ctx.storage.sql
      .exec<StoredEvent>(
        "SELECT seq, sender_id, event_type, payload, created_at FROM events WHERE seq > ? ORDER BY seq ASC LIMIT 500",
        sinceSeq
      )
      .toArray()
      .map((event) => ({
        seq: event.seq,
        senderId: event.sender_id,
        event: JSON.parse(event.payload),
        createdAt: event.created_at,
      }))
    socket.send(JSON.stringify({ type: "game.resync", events }))
  }

  private memberSnapshot() {
    const users = new Map<string, GameAttachment>()
    for (const socket of this.ctx.getWebSockets()) {
      const member = socket.deserializeAttachment() as
        GameAttachment | undefined
      if (member && !users.has(member.userId)) users.set(member.userId, member)
    }
    return [...users.values()].map((member) => ({
      userId: member.userId,
      displayName: member.displayName,
      role: member.memberRole,
    }))
  }

  private broadcast(event: unknown) {
    const payload = JSON.stringify(event)
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(payload)
      } catch {
        // Closed sockets are removed by the runtime.
      }
    }
  }

  private sendError(socket: WebSocket, code: string, message: string) {
    socket.send(JSON.stringify({ type: "error", code, message }))
  }
}
