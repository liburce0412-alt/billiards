import { DurableObject } from "cloudflare:workers"
import {
  applyInput,
  awardForfeit,
  createMatch,
  createSnapshot,
  restoreSnapshot,
  stepMatch,
} from "../../packages/table-tennis/src/core"
import type {
  MatchState,
  PlayerId,
} from "../../packages/table-tennis/src/core/types"
import type { PlatformEnv } from "../env"
import {
  TABLE_TENNIS_PROTOCOL,
  TABLE_TENNIS_RECONNECT_MS,
  validTableTennisInput,
} from "../table-tennis-protocol"

type Member = { id: string; displayName: string }
type Attachment = Member & {
  player: PlayerId | null
  connection: string
  seq: number
  count: number
  windowAt: number
}
type RecordState = {
  roomId: string
  state: MatchState
  players: [Member | null, Member | null]
  connections: [string | null, string | null]
  ready: [boolean, boolean]
  phase: "waiting" | "active" | "paused" | "ended"
  disconnected: [number | null, number | null]
  startedAt: number
  endedAt: number | null
  reason: string | null
  resultSaved: boolean
}

/** One authoritative simulation per room. No high-frequency input is written to D1. */
export class TableTennisRoom extends DurableObject<PlatformEnv> {
  private room?: RecordState
  private timer?: ReturnType<typeof setInterval>
  private lastTickAt = 0
  private accumulated = 0
  private snapshotSteps = 0
  private acks: [number, number] = [-1, -1]

  constructor(ctx: DurableObjectState, env: PlatformEnv) {
    super(ctx, env)
    ctx.blockConcurrencyWhile(async () => {
      ctx.storage.sql.exec(
        "CREATE TABLE IF NOT EXISTS match_state (id INTEGER PRIMARY KEY CHECK(id = 1), payload TEXT NOT NULL)"
      )
      const saved = ctx.storage.sql
        .exec<{ payload: string }>(
          "SELECT payload FROM match_state WHERE id = 1"
        )
        .toArray()[0]
      if (saved) {
        this.room = JSON.parse(saved.payload) as RecordState
        this.room.state = restoreSnapshot(this.room.state)
        // A process restart resumes from the last point checkpoint, never silently
        // simulates a large elapsed interval or awards an unseen point.
        if (this.room.phase === "active") {
          this.room.phase = "paused"
          this.room.ready = [false, false]
          this.room.disconnected = [
            Date.now() + TABLE_TENNIS_RECONNECT_MS,
            Date.now() + TABLE_TENNIS_RECONNECT_MS,
          ]
          this.save()
        }
        await this.scheduleAlarm()
      }
    })
  }

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket")
      return new Response("Expected WebSocket", { status: 426 })
    if (
      new URL(request.url).searchParams.get("v") !==
      String(TABLE_TENNIS_PROTOCOL)
    )
      return new Response("Please reload: incompatible table tennis version", {
        status: 409,
      })
    const id = request.headers.get("X-Platform-User-Id")
    const roomId = request.headers.get("X-Platform-Room-Id")
    const role = request.headers.get("X-Platform-Member-Role")
    if (!id || !roomId || !["host", "player", "spectator"].includes(role ?? ""))
      return new Response("Unauthorized", { status: 401 })
    const seats: Record<string, PlayerId | null> = {
      host: 0,
      player: 1,
      spectator: null,
    }
    const player = seats[role!]
    const displayName = decodeURIComponent(
      request.headers.get("X-Platform-Display-Name") ?? "玩家"
    )
    if (!this.room) {
      const seed = crypto.getRandomValues(new Uint32Array(1))[0]
      this.room = {
        roomId,
        state: createMatch({
          mode: "friend",
          seed,
          firstServer: (seed % 2) as PlayerId,
        }),
        players: [null, null],
        connections: [null, null],
        ready: [false, false],
        phase: "waiting",
        disconnected: [null, null],
        startedAt: 0,
        endedAt: null,
        reason: null,
        resultSaved: false,
      }
    }
    if (this.room.roomId !== roomId || this.room.phase === "ended")
      return new Response("Room ended", { status: 410 })
    if (
      this.room.disconnected.some(
        (deadline) => deadline !== null && deadline <= Date.now()
      )
    ) {
      await this.alarm()
      return new Response("Reconnect grace expired", { status: 410 })
    }
    if (
      player !== null &&
      this.room.players[player]?.id &&
      this.room.players[player]?.id !== id
    )
      return new Response("Seat belongs to another player", { status: 403 })
    const pair = new WebSocketPair()
    const socket = pair[1]
    // One active input stream per player. Closing a replaced socket must not pause
    // the match because the new connection is already accepted before it closes.
    const previous =
      player === null ? [] : this.ctx.getWebSockets(`player:${player}`)
    const member: Attachment = {
      id,
      displayName,
      player,
      connection: crypto.randomUUID(),
      seq: -1,
      count: 0,
      windowAt: Date.now(),
    }
    socket.serializeAttachment(member)
    this.ctx.acceptWebSocket(
      socket,
      player === null ? ["spectator"] : [`player:${player}`]
    )
    for (const old of previous) {
      try {
        old.close(4001, "Reconnected in another tab")
      } catch {
        /* already closed */
      }
    }
    if (player !== null) {
      this.room.players[player] = { id, displayName }
      this.room.connections[player] = member.connection
      this.room.disconnected[player] = null
      this.acks[player] = -1
    }
    this.save()
    socket.send(
      JSON.stringify({
        type: "tt.joined",
        version: TABLE_TENNIS_PROTOCOL,
        player,
        roomId,
        state: createSnapshot(this.room.state),
        ready: this.room.ready,
        players: this.room.players,
      })
    )
    this.broadcastRoom()
    await this.scheduleAlarm()
    return new Response(null, { status: 101, webSocket: pair[0] })
  }

  override async webSocketMessage(
    socket: WebSocket,
    raw: string | ArrayBuffer
  ): Promise<void> {
    if (!this.room || typeof raw !== "string" || raw.length > 2048) {
      this.error(socket, "invalid_message", "消息格式不正确")
      return
    }
    const member = socket.deserializeAttachment() as Attachment
    if (!member) return
    const now = Date.now()
    if (now - member.windowAt >= 1000) {
      member.windowAt = now
      member.count = 0
    }
    if (++member.count > 90) {
      this.error(socket, "rate_limit", "输入过于频繁")
      return
    }
    socket.serializeAttachment(member)
    let message: Record<string, unknown>
    try {
      message = JSON.parse(raw)
    } catch {
      this.error(socket, "invalid_message", "消息格式不正确")
      return
    }
    if (!message || typeof message !== "object") return
    if (message.type === "tt.ping") {
      socket.send(
        JSON.stringify({
          type: "tt.pong",
          sentAt: message.sentAt,
          serverTime: now,
        })
      )
      return
    }
    if (message.type === "tt.hello") {
      if (message.version !== TABLE_TENNIS_PROTOCOL)
        this.error(socket, "version_mismatch", "游戏已更新，请刷新页面")
      return
    }
    await this.playerAction(socket, member, message)
  }

  private async playerAction(
    socket: WebSocket,
    member: Attachment,
    message: Record<string, unknown>
  ): Promise<void> {
    if (!this.room) return
    const player = member.player
    if (player === null) {
      this.error(socket, "spectator_read_only", "观众不能操作比赛")
      return
    }
    if (this.room.phase === "ended") return
    // Ignore messages from a superseded connection even during its close handshake.
    if (this.room.connections[player] !== member.connection) return
    if (message.type === "tt.ready") {
      if (this.room.phase === "active") return
      this.room.ready[player] = message.ready === true
      this.room.disconnected[player] = null
      this.save()
      if (
        this.room.ready.every(Boolean) &&
        this.connected(0) &&
        this.connected(1)
      )
        await this.start()
      this.broadcastRoom()
      return
    }
    if (message.type === "tt.concede") {
      if (!this.room.startedAt) {
        this.error(socket, "not_started", "比赛尚未开始")
        return
      }
      awardForfeit(this.room.state, player)
      await this.finish("forfeit")
      return
    }
    this.playerInput(socket, member, message, player)
  }

  private playerInput(
    socket: WebSocket,
    member: Attachment,
    message: Record<string, unknown>,
    player: PlayerId
  ): void {
    if (!this.room) return
    if (
      message.type !== "tt.input" ||
      message.version !== TABLE_TENNIS_PROTOCOL ||
      !validTableTennisInput(message.input) ||
      !Number.isSafeInteger(message.seq) ||
      message.seq !== message.input.seq
    ) {
      this.error(socket, "invalid_input", "不支持这个对局输入")
      return
    }
    if (this.room.phase !== "active") return
    const seq = message.seq as number
    if (seq <= member.seq) return
    member.seq = seq
    socket.serializeAttachment(member)
    this.acks[player] = seq
    const input = {
      ...message.input,
      seq: this.room.state.players[player].lastInputSeq + 1,
    }
    applyInput(this.room.state, player, input)
  }

  override async webSocketClose(socket: WebSocket): Promise<void> {
    const member = socket.deserializeAttachment() as Attachment | undefined
    try {
      socket.close(1000, "closed")
    } catch {
      /* already closed */
    }
    if (
      !this.room ||
      member?.player == null ||
      this.room.phase === "ended" ||
      this.connected(member.player, socket)
    )
      return
    const player = member.player
    this.room.ready[player] = false
    this.room.disconnected[player] = Date.now() + TABLE_TENNIS_RECONNECT_MS
    if (this.room.startedAt) this.room.phase = "paused"
    this.stopTimer()
    this.save()
    this.broadcastSnapshot()
    this.broadcastRoom()
    await this.scheduleAlarm()
  }

  override async webSocketError(socket: WebSocket): Promise<void> {
    await this.webSocketClose(socket)
  }

  override async alarm(): Promise<void> {
    if (!this.room) return
    if (this.room.phase === "ended") {
      await this.persistResult()
      return
    }
    const now = Date.now()
    const expired = this.room.disconnected.map(
      (deadline) => deadline !== null && deadline <= now
    )
    if (expired.some(Boolean)) {
      if (this.room.startedAt && expired.filter(Boolean).length === 1) {
        awardForfeit(this.room.state, expired[0] ? 0 : 1)
        await this.finish("forfeit")
      } else {
        this.room.state.phase = "finished"
        await this.finish("abandoned")
      }
    } else await this.scheduleAlarm()
  }

  private connected(player: PlayerId, excluding?: WebSocket): boolean {
    return this.ctx
      .getWebSockets(`player:${player}`)
      .some(
        (socket) =>
          socket !== excluding &&
          socket.readyState === 1 &&
          (socket.deserializeAttachment() as Attachment).connection ===
            this.room?.connections[player]
      )
  }

  private async start(): Promise<void> {
    if (!this.room) return
    if (!this.room.startedAt) {
      this.room.startedAt = Date.now()
      await this.env.DB.prepare(
        "UPDATE game_rooms SET status = 'active', started_at = ? WHERE id = ? AND status = 'waiting'"
      )
        .bind(this.room.startedAt, this.room.roomId)
        .run()
    }
    this.room.phase = "active"
    this.room.disconnected = [null, null]
    this.save()
    this.lastTickAt = Date.now()
    this.accumulated = 0
    if (!this.timer) this.timer = setInterval(() => this.tick(), 1000 / 60)
    await this.scheduleAlarm()
  }

  private tick(): void {
    if (!this.room || this.room.phase !== "active") return
    const now = Date.now()
    const elapsed = now - this.lastTickAt
    this.lastTickAt = now
    if (elapsed > 500) {
      // A stalled server must never fast-forward a rally while players see nothing.
      this.room.phase = "paused"
      this.room.ready = [false, false]
      this.stopTimer()
      this.save()
      this.broadcastRoom()
      return
    }
    this.accumulated += elapsed / 1000
    let rounds = 0
    while (this.accumulated >= 1 / 60 && rounds++ < 6) {
      this.accumulated -= 1 / 60
      for (let substep = 0; substep < 2; substep++) {
        stepMatch(this.room.state)
        if (
          this.room.state.events.some(
            (event) => event.type === "point" || event.type === "game"
          )
        )
          this.save()
      }
      if (++this.snapshotSteps % 2 === 0) this.broadcastSnapshot()
      if (this.room.state.phase === "finished") {
        this.stopTimer()
        this.ctx.waitUntil(this.finish("completed"))
        break
      }
    }
  }

  private async finish(reason: string): Promise<void> {
    if (!this.room || this.room.phase === "ended") return
    this.stopTimer()
    this.room.phase = "ended"
    this.room.endedAt = Date.now()
    this.room.reason = reason
    this.save()
    this.broadcastSnapshot()
    this.broadcastRoom()
    await this.persistResult()
  }

  private async persistResult(): Promise<void> {
    const room = this.room
    if (!room || room.resultSaved || !room.endedAt) return
    try {
      const statements = [
        this.env.DB.prepare(
          "UPDATE game_rooms SET status = ?, ended_at = ? WHERE id = ?"
        ).bind(
          room.startedAt ? "ended" : "cancelled",
          room.endedAt,
          room.roomId
        ),
      ]
      if (room.startedAt && room.players[0] && room.players[1])
        statements.push(
          this.env.DB.prepare(
            "INSERT OR IGNORE INTO table_tennis_results(id, room_id, host_id, guest_id, winner_id, reason, score_json, started_at, ended_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
          ).bind(
            room.roomId,
            room.roomId,
            room.players[0].id,
            room.players[1].id,
            room.state.winner === undefined
              ? null
              : (room.players[room.state.winner]?.id ?? null),
            room.reason,
            JSON.stringify({
              games: room.state.games,
              scores: room.state.scores,
              bestRally: room.state.bestRally,
            }),
            room.startedAt,
            room.endedAt
          )
        )
      await this.env.DB.batch(statements)
      room.resultSaved = true
      this.save()
      await this.ctx.storage.deleteAlarm()
    } catch (error) {
      console.error(
        "table-tennis-result-persist",
        room.roomId,
        error instanceof Error ? error.message : String(error)
      )
      await this.ctx.storage.setAlarm(Date.now() + 5000)
    }
  }

  private save(): void {
    if (this.room)
      this.ctx.storage.sql.exec(
        "INSERT INTO match_state(id, payload) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload",
        JSON.stringify(this.room)
      )
  }

  private stopTimer(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = undefined
  }

  private async scheduleAlarm(): Promise<void> {
    if (!this.room) return
    if (this.room.phase === "ended" && !this.room.resultSaved) {
      await this.ctx.storage.setAlarm(Date.now() + 5000)
      return
    }
    const deadlines = this.room.disconnected.filter(
      (value): value is number => value !== null
    )
    if (deadlines.length)
      await this.ctx.storage.setAlarm(
        Math.max(Date.now() + 1, Math.min(...deadlines))
      )
    else await this.ctx.storage.deleteAlarm()
  }

  private broadcastRoom(): void {
    if (this.room)
      this.broadcast({
        type: "tt.room",
        version: TABLE_TENNIS_PROTOCOL,
        ready: this.room.ready,
        players: this.room.players,
        phase: this.room.phase,
      })
  }
  private broadcastSnapshot(): void {
    if (!this.room) return
    const deadlines = this.room.disconnected.filter(
      (value): value is number => value !== null
    )
    this.broadcast({
      type: "tt.snapshot",
      version: TABLE_TENNIS_PROTOCOL,
      tick: this.room.state.tick,
      serverTime: Date.now(),
      state: createSnapshot(this.room.state),
      acks: this.acks,
      paused: this.room.phase !== "active",
      disconnectUntil: deadlines.length ? Math.min(...deadlines) : null,
    })
  }
  private broadcast(message: unknown): void {
    const payload = JSON.stringify(message)
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(payload)
      } catch {
        /* close handler owns grace period */
      }
    }
  }
  private error(socket: WebSocket, code: string, message: string): void {
    socket.send(JSON.stringify({ type: "tt.error", code, message }))
  }
}
