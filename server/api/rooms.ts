import { z } from "zod"
import { requireProfile } from "../auth"
import type { PlatformEnv } from "../env"
import { HttpError, json, readJson } from "../http"
import { sanitiseRoomOptions } from "../roomoptions"

const billiardsRoomSchema = z.object({
  gameType: z.literal("billiards").default("billiards"),
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

const tableTennisRoomSchema = z.object({
  gameType: z.literal("table-tennis"),
  ruleType: z.literal("singles-11").default("singles-11"),
  code: z.string().trim().min(3).max(24).optional(),
  options: z.object({ bestOf: z.literal(3).default(3) }).default({ bestOf: 3 }),
  tableStyle: z.literal("standard").default("standard"),
  environmentStyle: z.enum(["cyber-arena", "sports-hall"]),
})

export const roomSchema = z.union([billiardsRoomSchema, tableTennisRoomSchema])

const inviteSchema = z.object({
  challengeeId: z.uuid(),
  roomId: z.uuid(),
  expiresInSeconds: z.number().int().min(30).max(600).default(120),
})

const inviteActionSchema = z.object({
  action: z.enum(["accept", "decline", "cancel"]),
})

type RoomRow = {
  id: string
  game_type: "billiards" | "table-tennis"
  code: string
  status: string
  rule_type: string
  options_json: string
  host_id: string
  guest_id: string | null
  host_table_style: string
  host_environment_style: string
  created_at: number
}

type InviteRow = {
  challenger_id: string
  challengee_id: string
  room_id: string
  status: string
  expires_at: number
}

export async function createRoom(request: Request, env: PlatformEnv) {
  const { session, profile } = await requireProfile(request, env, {
    online: true,
  })
  const input = roomSchema.parse(await readJson(request))
  const id = crypto.randomUUID()
  const code = (input.code || shortRoomCode()).toUpperCase()
  const now = Date.now()
  const options = sanitiseRoomOptions(
    input.options,
    profile.role,
    session.user.id
  )
  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO game_rooms(
          id, code, status, rule_type, options_json, host_id, game_type,
          host_table_style, host_environment_style, created_at
        ) VALUES (?, ?, 'waiting', ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        id,
        code,
        input.ruleType,
        JSON.stringify(options),
        session.user.id,
        input.gameType,
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
  return json({ room: await roomDescriptor(env, id, session.user.id) }, 201)
}

export async function roomByCode(
  request: Request,
  env: PlatformEnv,
  code: string
) {
  const { session } = await requireProfile(request, env, { online: true })
  const room = await loadRoom(env, "upper(code) = upper(?)", code)
  if (!room) throw new HttpError(404, "room_not_found", "房间不存在或已结束")
  return json({ room: presentRoom(room, session.user.id) })
}

export async function roomById(
  request: Request,
  env: PlatformEnv,
  roomId: string
) {
  const { session } = await requireProfile(request, env, { online: true })
  return json({ room: await roomDescriptor(env, roomId, session.user.id) })
}

export async function joinRoom(
  request: Request,
  env: PlatformEnv,
  roomId: string
) {
  const { session } = await requireProfile(request, env, { online: true })
  const room = await loadRoom(env, "id = ?", roomId)
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
  const membershipStatements = [
    env.DB.prepare(
      "INSERT OR REPLACE INTO game_room_members(room_id, user_id, member_role, joined_at) VALUES (?, ?, ?, ?)"
    ).bind(roomId, session.user.id, role, now),
    env.DB.prepare(
      `INSERT OR IGNORE INTO conversation_members(conversation_id, user_id, joined_at)
      SELECT id, ?, ? FROM conversations WHERE room_id = ?`
    ).bind(session.user.id, now, roomId),
  ]
  if (role === "player" && room.guest_id !== session.user.id) {
    const [claim] = await env.DB.batch([
      env.DB.prepare(
        "UPDATE game_rooms SET guest_id = ? WHERE id = ? AND status = 'waiting' AND guest_id IS NULL"
      ).bind(session.user.id, roomId),
      env.DB.prepare(
        `INSERT OR REPLACE INTO game_room_members(room_id, user_id, member_role, joined_at)
         SELECT ?, ?, 'player', ? WHERE EXISTS(
           SELECT 1 FROM game_rooms WHERE id = ? AND guest_id = ? AND status = 'waiting'
         )`
      ).bind(roomId, session.user.id, now, roomId, session.user.id),
      env.DB.prepare(
        `INSERT OR IGNORE INTO conversation_members(conversation_id, user_id, joined_at)
         SELECT id, ?, ? FROM conversations WHERE room_id = ? AND EXISTS(
           SELECT 1 FROM game_rooms WHERE id = ? AND guest_id = ? AND status = 'waiting'
         )`
      ).bind(session.user.id, now, roomId, roomId, session.user.id),
    ])
    if (!claim.meta.changes) {
      throw new HttpError(409, "room_full", "房间已有两名玩家")
    }
  } else {
    await env.DB.batch(membershipStatements)
  }
  return json({ room: await roomDescriptor(env, roomId, session.user.id) })
}

export async function createInvite(request: Request, env: PlatformEnv) {
  const { session } = await requireProfile(request, env, { online: true })
  const input = inviteSchema.parse(await readJson(request))
  if (input.challengeeId === session.user.id) {
    throw new HttpError(400, "self_invite", "不能邀请自己")
  }
  const room = await env.DB.prepare(
    "SELECT rule_type, game_type, options_json, host_id, status FROM game_rooms WHERE id = ?"
  )
    .bind(input.roomId)
    .first<{
      rule_type: string
      game_type: string
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
      gameType: room.game_type,
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
            r.code AS room_code, r.game_type
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
  const invite = await loadInvite(env, inviteId)
  if (!invite) {
    throw new HttpError(404, "invite_not_found", "邀请已失效")
  }
  if (
    invite.status === "accepted" &&
    invite.challengee_id === session.user.id &&
    action === "accept"
  ) {
    return json({
      status: "accepted",
      room: await roomDescriptor(env, invite.room_id, session.user.id),
    })
  }
  if (invite.status !== "pending") {
    throw new HttpError(409, "invite_already_handled", "邀请已经被处理")
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
    await cancelInvite(env, invite, inviteId, session.user.id, now)
    return json({ status: "cancelled" })
  }
  if (invite.challengee_id !== session.user.id) {
    throw new HttpError(403, "forbidden", "不能处理他人的邀请")
  }
  const accepted = action === "accept"
  const status = accepted ? "accepted" : "declined"
  if (accepted) await acceptInvite(env, invite, inviteId, session.user.id, now)
  else await declineInvite(env, inviteId, now)
  await notifyInvite(env, invite.challenger_id, inviteId, status)
  const room = accepted
    ? await roomDescriptor(env, invite.room_id, session.user.id)
    : undefined
  return json({ status, room })
}

async function loadInvite(env: PlatformEnv, inviteId: string) {
  return env.DB.prepare("SELECT * FROM match_invites WHERE id = ?")
    .bind(inviteId)
    .first<InviteRow>()
}

async function cancelInvite(
  env: PlatformEnv,
  invite: InviteRow,
  inviteId: string,
  userId: string,
  now: number
) {
  if (invite.challenger_id !== userId) {
    throw new HttpError(403, "forbidden", "不能取消他人的邀请")
  }
  await updateInvite(env, inviteId, "cancelled", now)
  await notifyInvite(env, invite.challengee_id, inviteId, "cancelled")
}

async function acceptInvite(
  env: PlatformEnv,
  invite: InviteRow,
  inviteId: string,
  userId: string,
  now: number
) {
  const [claimed] = await env.DB.batch([
    env.DB.prepare(
      "UPDATE game_rooms SET guest_id = ? WHERE id = ? AND status = 'waiting' AND (guest_id IS NULL OR guest_id = ?)"
    ).bind(userId, invite.room_id, userId),
    env.DB.prepare(
      `INSERT OR REPLACE INTO game_room_members(room_id, user_id, member_role, joined_at)
       SELECT ?, ?, 'player', ? WHERE EXISTS(
         SELECT 1 FROM game_rooms WHERE id = ? AND guest_id = ? AND status = 'waiting'
       )`
    ).bind(invite.room_id, userId, now, invite.room_id, userId),
    env.DB.prepare(
      `INSERT OR IGNORE INTO conversation_members(conversation_id, user_id, joined_at)
       SELECT id, ?, ? FROM conversations WHERE room_id = ? AND EXISTS(
         SELECT 1 FROM game_rooms WHERE id = ? AND guest_id = ? AND status = 'waiting'
       )`
    ).bind(userId, now, invite.room_id, invite.room_id, userId),
    env.DB.prepare(
      `UPDATE match_invites SET status = 'accepted', responded_at = ?
       WHERE id = ? AND status = 'pending' AND EXISTS(
         SELECT 1 FROM game_rooms WHERE id = ? AND guest_id = ? AND status = 'waiting'
       )`
    ).bind(now, inviteId, invite.room_id, userId),
  ])
  if (!claimed.meta.changes) {
    throw new HttpError(409, "room_full", "房间已满或比赛已经开始")
  }
}

async function declineInvite(env: PlatformEnv, inviteId: string, now: number) {
  const updated = await env.DB.prepare(
    "UPDATE match_invites SET status = 'declined', responded_at = ? WHERE id = ? AND status = 'pending'"
  )
    .bind(now, inviteId)
    .run()
  if (!updated.meta.changes) {
    throw new HttpError(409, "invite_already_handled", "邀请已经被处理")
  }
}

async function loadRoom(
  env: PlatformEnv,
  where: string,
  value: string
): Promise<RoomRow | null> {
  return env.DB.prepare(
    `SELECT id, code, status, rule_type, game_type, options_json, host_id, guest_id,
            host_table_style, host_environment_style, created_at
     FROM game_rooms WHERE ${where} AND status IN ('waiting', 'active')`
  )
    .bind(value)
    .first<RoomRow>()
}

async function roomDescriptor(
  env: PlatformEnv,
  roomId: string,
  userId: string
) {
  const room = await loadRoom(env, "id = ?", roomId)
  if (!room) throw new HttpError(404, "room_not_found", "房间不存在或已结束")
  return presentRoom(room, userId)
}

function presentRoom(room: RoomRow, userId: string) {
  let memberRole: "host" | "player" | null = null
  if (room.host_id === userId) memberRole = "host"
  else if (room.guest_id === userId) memberRole = "player"
  return {
    id: room.id,
    code: room.code,
    status: room.status,
    ruleType: room.rule_type,
    gameType: room.game_type || "billiards",
    options: JSON.parse(room.options_json || "{}"),
    tableStyle: room.host_table_style,
    environmentStyle: room.host_environment_style,
    memberRole,
    createdAt: room.created_at,
  }
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
