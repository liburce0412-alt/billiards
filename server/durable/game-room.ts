import { DurableObject } from "cloudflare:workers"
import type { PlatformEnv } from "../env"

type MemberRole = "host" | "player" | "spectator"
type GameAttachment = {
  roomId: string
  userId: string
  username: string
  displayName: string
  avatarUrl: string | null
  cueStyle: string
  memberRole: MemberRole
  connectedAt: number
}

type RuntimeState = {
  room_id: string
  revision: number
  phase: "waiting" | "active" | "cancelled"
  host_ready: number
  player_ready: number
  host_grace_until: number
  player_grace_until: number
  started_at: number | null
  empty_expires_at: number
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
        CREATE TABLE IF NOT EXISTS room_runtime (
          id INTEGER PRIMARY KEY CHECK(id = 1),
          room_id TEXT NOT NULL DEFAULT '',
          revision INTEGER NOT NULL DEFAULT 0,
          phase TEXT NOT NULL DEFAULT 'waiting',
          host_ready INTEGER NOT NULL DEFAULT 0,
          player_ready INTEGER NOT NULL DEFAULT 0,
          host_grace_until INTEGER NOT NULL DEFAULT 0,
          player_grace_until INTEGER NOT NULL DEFAULT 0,
          started_at INTEGER,
          empty_expires_at INTEGER NOT NULL DEFAULT 0
        );
        INSERT OR IGNORE INTO room_runtime(id) VALUES (1);
      `)
    })
  }

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 })
    }
    const userId = request.headers.get("X-Platform-User-Id")
    const encodedUsername = request.headers.get("X-Platform-Username")
    const encodedDisplayName = request.headers.get("X-Platform-Display-Name")
    const cueStyle = request.headers.get("X-Platform-Cue-Style")
    const memberRole = request.headers.get(
      "X-Platform-Member-Role"
    ) as MemberRole | null
    if (
      !userId ||
      !encodedUsername ||
      !encodedDisplayName ||
      !cueStyle ||
      !memberRole
    ) {
      return new Response("Unauthorized", { status: 401 })
    }
    const username = decodeURIComponent(encodedUsername)
    const displayName = decodeURIComponent(encodedDisplayName)
    const roomId = request.headers.get("X-Platform-Room-Id")
    if (!roomId) return new Response("Missing room identity", { status: 400 })
    const pair = new WebSocketPair()
    const server = pair[1]
    const attachment: GameAttachment = {
      roomId,
      userId,
      username,
      displayName,
      avatarUrl: request.headers.get("X-Platform-Avatar"),
      cueStyle,
      memberRole,
      connectedAt: Date.now(),
    }
    server.serializeAttachment(attachment)
    this.ctx.acceptWebSocket(server, [`user:${userId}`, `role:${memberRole}`])
    this.ctx.storage.sql.exec(
      `UPDATE room_runtime
       SET room_id = CASE WHEN room_id = '' THEN ? ELSE room_id END,
           host_grace_until = CASE WHEN ? = 'host' THEN 0 ELSE host_grace_until END,
           player_grace_until = CASE WHEN ? = 'player' THEN 0 ELSE player_grace_until END,
           empty_expires_at = 0
       WHERE id = 1`,
      roomId,
      memberRole,
      memberRole
    )
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
        roomState: this.roomStateSnapshot(),
      })
    )
    this.broadcastRoomState()
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
      ready?: boolean
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
    if (message.type === "room.ready.set") {
      if (member.memberRole === "spectator") {
        this.sendError(socket, "spectator_read_only", "观众不能准备")
        return
      }
      await this.setReady(member.memberRole, message.ready === true)
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
    const stampedEvent: Record<string, unknown> = {
      ...message.event,
      clientId: member.userId,
      playername: member.displayName,
    }
    if (eventType === "CHAT") {
      const text = String(message.event.message ?? "").trim()
      if (!text || text.length > 240) {
        this.sendError(socket, "invalid_chat", "消息需为 1–240 个字符")
        return
      }
      stampedEvent.message = text
      stampedEvent.sender = member.userId
      stampedEvent.senderName = member.displayName
      stampedEvent.createdAt = now
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
    const member = socket.deserializeAttachment() as GameAttachment | undefined
    try {
      socket.close(1000, "closed")
    } finally {
      if (member && member.memberRole !== "spectator") {
        const stillConnected = this.ctx
          .getWebSockets(`role:${member.memberRole}`)
          .some((candidate) => candidate !== socket)
        if (!stillConnected) {
          const graceUntil = Date.now() + 30_000
          const graceColumn =
            member.memberRole === "host"
              ? "host_grace_until"
              : "player_grace_until"
          this.ctx.storage.sql.exec(
            `UPDATE room_runtime SET ${graceColumn} = ?, revision = revision + 1 WHERE id = 1`,
            graceUntil
          )
        }
      }
      const remaining = this.ctx
        .getWebSockets()
        .filter((item) => item !== socket)
      if (remaining.length === 0) {
        const emptyExpiresAt = Date.now() + 5 * 60_000
        this.ctx.storage.sql.exec(
          "UPDATE room_runtime SET empty_expires_at = ? WHERE id = 1 AND phase = 'waiting'",
          emptyExpiresAt
        )
      }
      this.broadcastRoomState()
      await this.scheduleNextAlarm()
    }
  }

  override async alarm(): Promise<void> {
    const now = Date.now()
    const state = this.runtimeState()
    let changed = false
    if (
      state.host_grace_until > 0 &&
      state.host_grace_until <= now &&
      this.ctx.getWebSockets("role:host").length === 0
    ) {
      this.ctx.storage.sql.exec(
        "UPDATE room_runtime SET host_ready = 0, host_grace_until = 0, revision = revision + 1 WHERE id = 1"
      )
      changed = true
    }
    if (
      state.player_grace_until > 0 &&
      state.player_grace_until <= now &&
      this.ctx.getWebSockets("role:player").length === 0
    ) {
      this.ctx.storage.sql.exec(
        "UPDATE room_runtime SET player_ready = 0, player_grace_until = 0, revision = revision + 1 WHERE id = 1"
      )
      changed = true
    }
    const latest = this.runtimeState()
    if (
      latest.phase === "waiting" &&
      latest.empty_expires_at > 0 &&
      latest.empty_expires_at <= now &&
      this.ctx.getWebSockets().length === 0
    ) {
      this.ctx.storage.sql.exec(
        "UPDATE room_runtime SET phase = 'cancelled', revision = revision + 1 WHERE id = 1"
      )
      await this.env.DB.batch([
        this.env.DB.prepare(
          "UPDATE game_rooms SET status = 'cancelled', ended_at = ? WHERE id = ? AND status = 'waiting'"
        ).bind(now, latest.room_id),
        this.env.DB.prepare(
          "UPDATE match_invites SET status = 'expired', responded_at = ? WHERE room_id = ? AND status = 'pending'"
        ).bind(now, latest.room_id),
      ])
      return
    }
    if (changed) this.broadcastRoomState()
    await this.scheduleNextAlarm()
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
      username: member.username || member.displayName,
      displayName: member.displayName,
      avatarUrl: member.avatarUrl,
      cueStyle: member.cueStyle || "heritage",
      role: member.memberRole,
    }))
  }

  private runtimeState(): RuntimeState {
    return this.ctx.storage.sql
      .exec<RuntimeState>("SELECT * FROM room_runtime WHERE id = 1")
      .one()
  }

  private roomStateSnapshot() {
    const state = this.runtimeState()
    const ready = {
      host: state.host_ready === 1,
      player: state.player_ready === 1,
    }
    return {
      version: 1,
      revision: state.revision,
      phase: state.phase,
      ready,
      startedAt: state.started_at,
      members: this.memberSnapshot().map((member) => ({
        ...member,
        connected: true,
        ready: this.readyForRole(member.role, ready),
      })),
    }
  }

  private readyForRole(
    role: MemberRole,
    ready: { host: boolean; player: boolean }
  ) {
    if (role === "host") return ready.host
    if (role === "player") return ready.player
    return false
  }

  private async setReady(role: "host" | "player", ready: boolean) {
    const state = this.runtimeState()
    if (state.phase !== "waiting") return
    const column = role === "host" ? "host_ready" : "player_ready"
    this.ctx.storage.sql.exec(
      `UPDATE room_runtime SET ${column} = ?, revision = revision + 1 WHERE id = 1 AND phase = 'waiting'`,
      ready ? 1 : 0
    )
    this.broadcastRoomState()
    await this.startWhenReady()
  }

  private async startWhenReady() {
    const state = this.runtimeState()
    const hostSockets = this.ctx.getWebSockets("role:host")
    const playerSockets = this.ctx.getWebSockets("role:player")
    if (
      state.phase !== "waiting" ||
      state.host_ready !== 1 ||
      state.player_ready !== 1 ||
      hostSockets.length === 0 ||
      playerSockets.length === 0
    ) {
      return
    }
    const now = Date.now()
    this.ctx.storage.sql.exec(
      "UPDATE room_runtime SET phase = 'active', started_at = ?, revision = revision + 1, empty_expires_at = 0 WHERE id = 1 AND phase = 'waiting'",
      now
    )
    const next = this.runtimeState()
    if (next.phase !== "active" || next.started_at !== now) return
    const host = hostSockets[0].deserializeAttachment() as GameAttachment
    await this.env.DB.prepare(
      "UPDATE game_rooms SET status = 'active', started_at = COALESCE(started_at, ?) WHERE id = ? AND status = 'waiting'"
    )
      .bind(now, next.room_id)
      .run()
    this.broadcast({
      type: "room.started",
      revision: next.revision,
      startedAt: now,
      breakerUserId: host.userId,
      roomState: this.roomStateSnapshot(),
    })
    await this.scheduleNextAlarm()
  }

  private broadcastRoomState() {
    this.broadcast({ type: "room.state", roomState: this.roomStateSnapshot() })
  }

  private async scheduleNextAlarm() {
    const state = this.runtimeState()
    const candidates = [
      state.host_grace_until,
      state.player_grace_until,
      state.empty_expires_at,
    ].filter((value) => value > Date.now())
    if (candidates.length) {
      await this.ctx.storage.setAlarm(Math.min(...candidates))
    } else {
      await this.ctx.storage.deleteAlarm()
    }
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
    socket.send(JSON.stringify({ type: "room.error", code, message }))
  }
}
