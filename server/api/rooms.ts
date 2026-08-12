import { z } from "zod"
import { requireProfile } from "../auth"
import type { PlatformEnv } from "../env"
import { HttpError, json, readJson } from "../http"

const roomSchema = z.object({
  ruleType: z.enum([
    "eightball",
    "nineball",
    "fourball",
    "snooker",
    "threecushion",
  ]),
  code: z.string().trim().min(3).max(24).optional(),
  options: z.record(z.string(), z.unknown()).default({}),
  tableStyle: z.string().trim().min(1).max(48),
  environmentStyle: z.string().trim().min(1).max(48),
})

const inviteSchema = z.object({
  challengeeId: z.uuid(),
  roomId: z.uuid(),
  expiresInSeconds: z.number().int().min(30).max(600).default(120),
})

const inviteActionSchema = z.object({
  action: z.enum(["accept", "decline", "cancel"]),
})

export async function createRoom(request: Request, env: PlatformEnv) {
  const { session, profile } = await requireProfile(request, env, {
    online: true,
  })
  const input = roomSchema.parse(await readJson(request))
  const id = crypto.randomUUID()
  const code = (input.code || shortRoomCode()).toUpperCase()
  const now = Date.now()
  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO game_rooms(
          id, code, status, rule_type, options_json, host_id,
          host_table_style, host_environment_style, created_at
        ) VALUES (?, ?, 'waiting', ?, ?, ?, ?, ?, ?)`
      ).bind(
        id,
        code,
        input.ruleType,
        JSON.stringify(input.options),
        session.user.id,
        input.tableStyle || profile.table_style,
        input.environmentStyle || profile.environment_style,
        now
      ),
      env.DB.prepare(
        "INSERT INTO game_room_members(room_id, user_id, member_role, joined_at) VALUES (?, ?, 'host', ?)"
      ).bind(id, session.user.id, now),
      env.DB.prepare(
        "INSERT INTO conversations(id, kind, room_id, created_at) VALUES (?, 'room', ?, ?)"
      ).bind(crypto.randomUUID(), id, now),
    ])
    await env.DB.prepare(
      `INSERT INTO conversation_members(conversation_id, user_id, joined_at)
       SELECT id, ?, ? FROM conversations WHERE room_id = ?`
    )
      .bind(session.user.id, now, id)
      .run()
  } catch {
    throw new HttpError(409, "room_code_in_use", "房间码正在使用，请更换")
  }
  return json(
    {
      room: {
        id,
        code,
        status: "waiting",
        ruleType: input.ruleType,
        tableStyle: input.tableStyle,
        environmentStyle: input.environmentStyle,
      },
    },
    201
  )
}

export async function roomByCode(
  request: Request,
  env: PlatformEnv,
  code: string
) {
  await requireProfile(request, env, { online: true })
  const room = await env.DB.prepare(
    `SELECT id, code, status, rule_type, options_json, host_id, guest_id,
            host_table_style, host_environment_style, created_at
     FROM game_rooms WHERE upper(code) = upper(?) AND status IN ('waiting', 'active')`
  )
    .bind(code)
    .first()
  if (!room) throw new HttpError(404, "room_not_found", "房间不存在或已结束")
  return json({ room })
}

export async function joinRoom(
  request: Request,
  env: PlatformEnv,
  roomId: string
) {
  const { session } = await requireProfile(request, env, { online: true })
  const room = await env.DB.prepare(
    "SELECT host_id, guest_id, status FROM game_rooms WHERE id = ?"
  )
    .bind(roomId)
    .first<{ host_id: string; guest_id: string | null; status: string }>()
  if (!room || !["waiting", "active"].includes(room.status)) {
    throw new HttpError(404, "room_not_found", "房间不存在或已结束")
  }
  if (
    room.host_id !== session.user.id &&
    room.guest_id &&
    room.guest_id !== session.user.id
  ) {
    throw new HttpError(409, "room_full", "房间已有两名玩家")
  }
  const now = Date.now()
  const role = room.host_id === session.user.id ? "host" : "player"
  const statements = [
    env.DB.prepare(
      "INSERT OR REPLACE INTO game_room_members(room_id, user_id, member_role, joined_at) VALUES (?, ?, ?, ?)"
    ).bind(roomId, session.user.id, role, now),
    env.DB.prepare(
      `INSERT OR IGNORE INTO conversation_members(conversation_id, user_id, joined_at)
       SELECT id, ?, ? FROM conversations WHERE room_id = ?`
    ).bind(session.user.id, now, roomId),
  ]
  if (role === "player") {
    statements.push(
      env.DB.prepare(
        "UPDATE game_rooms SET guest_id = COALESCE(guest_id, ?) WHERE id = ? AND status = 'waiting'"
      ).bind(session.user.id, roomId)
    )
  }
  await env.DB.batch(statements)
  return json({ roomId, memberRole: role })
}

export async function createInvite(request: Request, env: PlatformEnv) {
  const { session } = await requireProfile(request, env, { online: true })
  const input = inviteSchema.parse(await readJson(request))
  if (input.challengeeId === session.user.id) {
    throw new HttpError(400, "self_invite", "不能邀请自己")
  }
  const room = await env.DB.prepare(
    "SELECT rule_type, options_json, host_id, status FROM game_rooms WHERE id = ?"
  )
    .bind(input.roomId)
    .first<{
      rule_type: string
      options_json: string
      host_id: string
      status: string
    }>()
  if (!room || room.host_id !== session.user.id || room.status !== "waiting") {
    throw new HttpError(
      403,
      "invite_forbidden",
      "只能邀请好友加入自己的等待房间"
    )
  }
  const [low, high] = orderedPair(session.user.id, input.challengeeId)
  const friend = await env.DB.prepare(
    "SELECT 1 FROM friendships WHERE user_low_id = ? AND user_high_id = ?"
  )
    .bind(low, high)
    .first()
  if (!friend) {
    throw new HttpError(403, "friends_only", "只能邀请好友")
  }
  const id = crypto.randomUUID()
  const now = Date.now()
  const expiresAt = now + input.expiresInSeconds * 1000
  await env.DB.prepare(
    `INSERT INTO match_invites(
      id, challenger_id, challengee_id, room_id, rule_type,
      options_json, status, expires_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
  )
    .bind(
      id,
      session.user.id,
      input.challengeeId,
      input.roomId,
      room.rule_type,
      room.options_json,
      expiresAt,
      now
    )
    .run()
  await env.SOCIAL.getByName("social-v1").notifyUser(input.challengeeId, {
    type: "invite.created",
    invite: {
      id,
      challengerId: session.user.id,
      challengerName: session.user.name,
      roomId: input.roomId,
      ruleType: room.rule_type,
      expiresAt,
    },
  })
  return json({ id, expiresAt, status: "pending" }, 201)
}

export async function listInvites(request: Request, env: PlatformEnv) {
  const { session } = await requireProfile(request, env, { online: true })
  const result = await env.DB.prepare(
    `SELECT i.id, i.challenger_id, i.challengee_id, i.room_id,
            i.rule_type, i.status, i.expires_at, i.created_at,
            challenger.display_name AS challenger_name,
            challengee.display_name AS challengee_name,
            r.code AS room_code
     FROM match_invites i
     JOIN profiles challenger ON challenger.user_id = i.challenger_id
     JOIN profiles challengee ON challengee.user_id = i.challengee_id
     JOIN game_rooms r ON r.id = i.room_id
     WHERE (i.challenger_id = ? OR i.challengee_id = ?)
       AND i.status = 'pending' AND i.expires_at > ?
     ORDER BY i.created_at DESC LIMIT 50`
  )
    .bind(session.user.id, session.user.id, Date.now())
    .all()
  return json({ invites: result.results })
}

export async function actOnInvite(
  request: Request,
  env: PlatformEnv,
  inviteId: string
) {
  const { session } = await requireProfile(request, env, { online: true })
  const { action } = inviteActionSchema.parse(await readJson(request))
  const invite = await env.DB.prepare(
    "SELECT * FROM match_invites WHERE id = ?"
  )
    .bind(inviteId)
    .first<{
      challenger_id: string
      challengee_id: string
      room_id: string
      status: string
      expires_at: number
    }>()
  if (!invite || invite.status !== "pending") {
    throw new HttpError(404, "invite_not_found", "邀请已失效")
  }
  const now = Date.now()
  if (invite.expires_at <= now) {
    await env.DB.prepare(
      "UPDATE match_invites SET status = 'expired', responded_at = ? WHERE id = ? AND status = 'pending'"
    )
      .bind(now, inviteId)
      .run()
    throw new HttpError(410, "invite_expired", "邀请已过期")
  }
  if (action === "cancel") {
    if (invite.challenger_id !== session.user.id) {
      throw new HttpError(403, "forbidden", "不能取消他人的邀请")
    }
    await updateInvite(env, inviteId, "cancelled", now)
    await notifyInvite(env, invite.challengee_id, inviteId, "cancelled")
    return json({ status: "cancelled" })
  }
  if (invite.challengee_id !== session.user.id) {
    throw new HttpError(403, "forbidden", "不能处理他人的邀请")
  }
  const status = action === "accept" ? "accepted" : "declined"
  const updated = await env.DB.prepare(
    "UPDATE match_invites SET status = ?, responded_at = ? WHERE id = ? AND status = 'pending'"
  )
    .bind(status, now, inviteId)
    .run()
  if (!updated.meta.changes) {
    throw new HttpError(409, "invite_already_handled", "邀请已经被处理")
  }
  if (status === "accepted") {
    await joinRoom(
      new Request(`${env.APP_ORIGIN}/api/rooms/${invite.room_id}/join`, {
        method: "POST",
        headers: request.headers,
      }),
      env,
      invite.room_id
    )
  }
  await notifyInvite(env, invite.challenger_id, inviteId, status)
  return json({ status, roomId: invite.room_id })
}

function shortRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  return [...bytes].map((byte) => alphabet[byte % alphabet.length]).join("")
}

function orderedPair(left: string, right: string): [string, string] {
  return left < right ? [left, right] : [right, left]
}

async function updateInvite(
  env: PlatformEnv,
  inviteId: string,
  status: string,
  now: number
) {
  await env.DB.prepare(
    "UPDATE match_invites SET status = ?, responded_at = ? WHERE id = ? AND status = 'pending'"
  )
    .bind(status, now, inviteId)
    .run()
}

async function notifyInvite(
  env: PlatformEnv,
  userId: string,
  inviteId: string,
  status: string
) {
  await env.SOCIAL.getByName("social-v1").notifyUser(userId, {
    type: "invite.updated",
    inviteId,
    status,
  })
}
