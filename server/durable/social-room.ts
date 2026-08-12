import { DurableObject } from "cloudflare:workers"
import type { PlatformEnv } from "../env"

type Visibility = "online" | "away" | "dnd" | "invisible"
type SocialAttachment = {
  userId: string
  displayName: string
  avatarUrl: string | null
  visibility: Visibility
  role: "user" | "moderator" | "admin"
  connectedAt: number
}

type ClientMessage =
  | { type: "presence.set"; visibility: Visibility }
  | {
      type: "chat.send"
      conversationId: string
      clientMessageId: string
      text: string
    }
  | { type: "chat.read"; conversationId: string; messageId: string }
  | { type: "chat.typing"; conversationId: string; active: boolean }
  | { type: "ping"; sentAt?: number }

const VISIBILITIES = new Set<Visibility>(["online", "away", "dnd", "invisible"])

export class SocialRoom extends DurableObject<PlatformEnv> {
  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 })
    }
    const userId = request.headers.get("X-Platform-User-Id")
    const encodedDisplayName = request.headers.get("X-Platform-Display-Name")
    const role = request.headers.get("X-Platform-Role") as
      SocialAttachment["role"] | null
    const visibility = request.headers.get(
      "X-Platform-Visibility"
    ) as Visibility | null
    if (!userId || !encodedDisplayName || !role || !visibility) {
      return new Response("Unauthorized", { status: 401 })
    }
    const displayName = decodeURIComponent(encodedDisplayName)
    const pair = new WebSocketPair()
    const server = pair[1]
    const attachment: SocialAttachment = {
      userId,
      displayName,
      avatarUrl: request.headers.get("X-Platform-Avatar"),
      role,
      visibility,
      connectedAt: Date.now(),
    }
    server.serializeAttachment(attachment)
    this.ctx.acceptWebSocket(server, [`user:${userId}`])
    server.send(
      JSON.stringify({
        type: "session.ready",
        userId,
        visibility,
        serverTime: Date.now(),
      })
    )
    this.sendPresenceSnapshots()
    return new Response(null, { status: 101, webSocket: pair[0] })
  }

  override async webSocketMessage(
    socket: WebSocket,
    raw: string | ArrayBuffer
  ) {
    if (typeof raw !== "string" || raw.length > 8_192) {
      this.sendError(socket, "invalid_message", "消息格式不正确")
      return
    }
    const attachment = socket.deserializeAttachment() as SocialAttachment
    let message: ClientMessage
    try {
      message = JSON.parse(raw) as ClientMessage
    } catch {
      this.sendError(socket, "invalid_json", "消息格式不正确")
      return
    }
    switch (message.type) {
      case "presence.set":
        await this.setPresence(attachment.userId, message.visibility, socket)
        break
      case "chat.send":
        await this.sendChat(attachment, message, socket)
        break
      case "chat.read":
        await this.readChat(attachment, message, socket)
        break
      case "chat.typing":
        await this.typing(attachment, message, socket)
        break
      case "ping":
        socket.send(
          JSON.stringify({
            type: "pong",
            sentAt: message.sentAt,
            at: Date.now(),
          })
        )
        break
      default:
        this.sendError(socket, "unknown_message", "不支持这个实时操作")
    }
  }

  override async webSocketClose(socket: WebSocket) {
    try {
      socket.close(1000, "closed")
    } finally {
      this.sendPresenceSnapshots()
    }
  }

  override async webSocketError() {
    this.sendPresenceSnapshots()
  }

  async notifyUser(userId: string, event: unknown): Promise<number> {
    let delivered = 0
    for (const socket of this.ctx.getWebSockets(`user:${userId}`)) {
      try {
        socket.send(JSON.stringify(event))
        delivered += 1
      } catch {
        // The hibernation runtime removes closed sockets after the callback.
      }
    }
    return delivered
  }

  async revokeUser(userId: string, reason: string): Promise<number> {
    let closed = 0
    for (const socket of this.ctx.getWebSockets(`user:${userId}`)) {
      socket.send(
        JSON.stringify({ type: "moderation.session_revoked", reason })
      )
      socket.close(4403, reason.slice(0, 120))
      closed += 1
    }
    this.sendPresenceSnapshots()
    return closed
  }

  private async setPresence(
    userId: string,
    visibility: Visibility,
    source: WebSocket
  ) {
    if (!VISIBILITIES.has(visibility)) {
      this.sendError(source, "invalid_visibility", "在线状态无效")
      return
    }
    await this.env.DB.prepare(
      "UPDATE profiles SET visibility = ?, updated_at = ? WHERE user_id = ?"
    )
      .bind(visibility, Date.now(), userId)
      .run()
    for (const socket of this.ctx.getWebSockets(`user:${userId}`)) {
      const attachment = socket.deserializeAttachment() as SocialAttachment
      socket.serializeAttachment({ ...attachment, visibility })
    }
    source.send(JSON.stringify({ type: "ack", action: "presence.set" }))
    this.sendPresenceSnapshots()
  }

  private async sendChat(
    sender: SocialAttachment,
    message: Extract<ClientMessage, { type: "chat.send" }>,
    source: WebSocket
  ) {
    const text = message.text.trim()
    if (
      !text ||
      text.length > 1000 ||
      !/^[0-9a-f-]{36}$/i.test(message.conversationId) ||
      !/^[a-zA-Z0-9_-]{8,80}$/.test(message.clientMessageId)
    ) {
      this.sendError(source, "invalid_chat", "聊天内容无效")
      return
    }
    const now = Date.now()
    const profile = await this.env.DB.prepare(
      "SELECT muted_until, banned_until, approval_status FROM profiles WHERE user_id = ?"
    )
      .bind(sender.userId)
      .first<{
        muted_until: number | null
        banned_until: number | null
        approval_status: string
      }>()
    if (
      !profile ||
      profile.approval_status !== "approved" ||
      (profile.banned_until ?? 0) > now ||
      (profile.muted_until ?? 0) > now
    ) {
      this.sendError(source, "chat_forbidden", "当前不能发送消息")
      return
    }
    const membership = await this.env.DB.prepare(
      `SELECT c.kind
       FROM conversation_members cm
       JOIN conversations c ON c.id = cm.conversation_id
       WHERE cm.conversation_id = ? AND cm.user_id = ?`
    )
      .bind(message.conversationId, sender.userId)
      .first<{ kind: "direct" | "room" }>()
    if (!membership) {
      this.sendError(source, "not_a_member", "你不在这个会话中")
      return
    }
    if (membership.kind === "direct") {
      const relationship = await this.env.DB.prepare(
        `SELECT other.user_id AS other_id,
                EXISTS(
                  SELECT 1 FROM friendships f
                  WHERE f.user_low_id = min(?, other.user_id)
                    AND f.user_high_id = max(?, other.user_id)
                ) AS friends,
                EXISTS(
                  SELECT 1 FROM blocks b
                  WHERE (b.blocker_id = other.user_id AND b.blocked_id = ?)
                     OR (b.blocker_id = ? AND b.blocked_id = other.user_id)
                ) AS blocked
         FROM conversation_members other
         WHERE other.conversation_id = ? AND other.user_id <> ? LIMIT 1`
      )
        .bind(
          sender.userId,
          sender.userId,
          sender.userId,
          sender.userId,
          message.conversationId,
          sender.userId
        )
        .first<{ other_id: string; friends: number; blocked: number }>()
      if (!relationship?.friends || relationship.blocked) {
        this.sendError(source, "friends_only", "只能向好友发送私聊")
        return
      }
    }
    const id = crypto.randomUUID()
    const insert = await this.env.DB.prepare(
      "INSERT OR IGNORE INTO messages(id, conversation_id, sender_id, client_nonce, body, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    )
      .bind(
        id,
        message.conversationId,
        sender.userId,
        message.clientMessageId,
        text,
        now
      )
      .run()
    if (!insert.meta.changes) {
      source.send(
        JSON.stringify({
          type: "ack",
          action: "chat.send",
          clientMessageId: message.clientMessageId,
          duplicate: true,
        })
      )
      return
    }
    const members = await this.env.DB.prepare(
      "SELECT user_id FROM conversation_members WHERE conversation_id = ?"
    )
      .bind(message.conversationId)
      .all<{ user_id: string }>()
    const event = {
      type: "chat.message",
      message: {
        id,
        conversationId: message.conversationId,
        senderId: sender.userId,
        senderName: sender.displayName,
        body: text,
        createdAt: now,
        clientMessageId: message.clientMessageId,
      },
    }
    for (const member of members.results) {
      await this.notifyUser(member.user_id, event)
    }
  }

  private async readChat(
    reader: SocialAttachment,
    message: Extract<ClientMessage, { type: "chat.read" }>,
    source: WebSocket
  ) {
    const result = await this.env.DB.prepare(
      `UPDATE conversation_members
       SET last_read_message_id = ?
       WHERE conversation_id = ? AND user_id = ?`
    )
      .bind(message.messageId, message.conversationId, reader.userId)
      .run()
    if (!result.meta.changes) {
      this.sendError(source, "not_a_member", "你不在这个会话中")
      return
    }
    const members = await this.env.DB.prepare(
      "SELECT user_id FROM conversation_members WHERE conversation_id = ? AND user_id <> ?"
    )
      .bind(message.conversationId, reader.userId)
      .all<{ user_id: string }>()
    for (const member of members.results) {
      await this.notifyUser(member.user_id, {
        type: "chat.read",
        conversationId: message.conversationId,
        messageId: message.messageId,
        userId: reader.userId,
      })
    }
  }

  private async typing(
    sender: SocialAttachment,
    message: Extract<ClientMessage, { type: "chat.typing" }>,
    source: WebSocket
  ) {
    const membership = await this.env.DB.prepare(
      "SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?"
    )
      .bind(message.conversationId, sender.userId)
      .first()
    if (!membership) {
      this.sendError(source, "not_a_member", "你不在这个会话中")
      return
    }
    const members = await this.env.DB.prepare(
      "SELECT user_id FROM conversation_members WHERE conversation_id = ? AND user_id <> ?"
    )
      .bind(message.conversationId, sender.userId)
      .all<{ user_id: string }>()
    for (const member of members.results) {
      await this.notifyUser(member.user_id, {
        type: "chat.typing",
        conversationId: message.conversationId,
        userId: sender.userId,
        active: !!message.active,
      })
    }
  }

  private sendPresenceSnapshots() {
    const byUser = new Map<string, SocialAttachment>()
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = socket.deserializeAttachment() as
        SocialAttachment | undefined
      if (!attachment) continue
      const current = byUser.get(attachment.userId)
      if (!current || attachment.connectedAt > current.connectedAt) {
        byUser.set(attachment.userId, attachment)
      }
    }
    for (const socket of this.ctx.getWebSockets()) {
      const recipient = socket.deserializeAttachment() as SocialAttachment
      const users = [...byUser.values()]
        .filter(
          (user) =>
            user.visibility !== "invisible" ||
            user.userId === recipient.userId ||
            recipient.role === "admin"
        )
        .map((user) => ({
          userId: user.userId,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
          visibility: user.visibility,
          invisible: user.visibility === "invisible",
        }))
      try {
        socket.send(
          JSON.stringify({
            type: "presence.snapshot",
            users,
            visibleCount: users.filter((user) => !user.invisible).length,
          })
        )
      } catch {
        // Closed sockets are removed by the runtime.
      }
    }
  }

  private sendError(socket: WebSocket, code: string, message: string) {
    socket.send(JSON.stringify({ type: "error", code, message }))
  }
}
