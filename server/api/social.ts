import { z } from "zod"
import { requireProfile } from "../auth"
import type { PlatformEnv } from "../env"
import { HttpError, json, readJson } from "../http"

const userIdSchema = z.object({ userId: z.uuid() })
const requestActionSchema = z.object({
  action: z.enum(["accept", "decline", "cancel"]),
})
const reportSchema = z.object({
  targetUserId: z.uuid().optional(),
  targetMessageId: z.uuid().optional(),
  reason: z.string().trim().min(3).max(80),
  details: z.string().trim().max(1000).default(""),
})

export async function searchUsers(request: Request, env: PlatformEnv) {
  const { session } = await requireProfile(request, env, { online: true })
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? ""
  if (query.length < 2 || query.length > 40) {
    return json({ users: [] })
  }
  const like = `%${query.replaceAll("%", "").replaceAll("_", "")}%`
  const result = await env.DB.prepare(
    `SELECT u.id, u.username, p.display_name, p.avatar_key, p.accent
     FROM "user" u
     JOIN profiles p ON p.user_id = u.id
     WHERE p.approval_status = 'approved' AND u.id <> ?
       AND (u.username LIKE ? ESCAPE '\\' OR p.display_name LIKE ? ESCAPE '\\')
       AND NOT EXISTS (
         SELECT 1 FROM blocks b
         WHERE (b.blocker_id = ? AND b.blocked_id = u.id)
            OR (b.blocker_id = u.id AND b.blocked_id = ?)
       )
     ORDER BY CASE WHEN lower(u.username) = lower(?) THEN 0 ELSE 1 END,
              p.display_name
     LIMIT 20`
  )
    .bind(session.user.id, like, like, session.user.id, session.user.id, query)
    .all<{
      id: string
      username: string
      display_name: string
      avatar_key: string | null
      accent: string
    }>()
  return json({
    users: result.results.map((user) => ({
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      avatarUrl: user.avatar_key ? `/media/avatar/${user.id}` : null,
      accent: user.accent,
    })),
  })
}

export async function friends(request: Request, env: PlatformEnv) {
  const { session } = await requireProfile(request, env, { online: true })
  const [friendsResult, requestsResult, blockedResult] = await Promise.all([
    env.DB.prepare(
      `SELECT u.id, u.username, p.display_name, p.avatar_key, p.accent
       FROM friendships f
       JOIN "user" u ON u.id = CASE WHEN f.user_low_id = ? THEN f.user_high_id ELSE f.user_low_id END
       JOIN profiles p ON p.user_id = u.id
       WHERE f.user_low_id = ? OR f.user_high_id = ?
       ORDER BY p.display_name`
    )
      .bind(session.user.id, session.user.id, session.user.id)
      .all<{
        id: string
        username: string
        display_name: string
        avatar_key: string | null
        accent: string
      }>(),
    env.DB.prepare(
      `SELECT fr.id, fr.sender_id, fr.receiver_id, fr.status, fr.created_at,
              u.username, p.display_name, p.avatar_key
       FROM friend_requests fr
       JOIN "user" u ON u.id = CASE WHEN fr.sender_id = ? THEN fr.receiver_id ELSE fr.sender_id END
       JOIN profiles p ON p.user_id = u.id
       WHERE (fr.sender_id = ? OR fr.receiver_id = ?) AND fr.status = 'pending'
       ORDER BY fr.created_at DESC`
    )
      .bind(session.user.id, session.user.id, session.user.id)
      .all(),
    env.DB.prepare(
      `SELECT b.blocked_id AS id, u.username, p.display_name, p.avatar_key
       FROM blocks b
       JOIN "user" u ON u.id = b.blocked_id
       JOIN profiles p ON p.user_id = u.id
       WHERE b.blocker_id = ? ORDER BY b.created_at DESC`
    )
      .bind(session.user.id)
      .all(),
  ])
  return json({
    friends: friendsResult.results.map((friend) => ({
      id: friend.id,
      username: friend.username,
      displayName: friend.display_name,
      avatarUrl: friend.avatar_key ? `/media/avatar/${friend.id}` : null,
      accent: friend.accent,
    })),
    requests: requestsResult.results,
    blocked: blockedResult.results,
  })
}

export async function requestFriend(request: Request, env: PlatformEnv) {
  const { session } = await requireProfile(request, env, { online: true })
  const { userId } = userIdSchema.parse(await readJson(request))
  if (userId === session.user.id) {
    throw new HttpError(400, "self_friend", "不能添加自己为好友")
  }
  const target = await env.DB.prepare(
    "SELECT approval_status FROM profiles WHERE user_id = ?"
  )
    .bind(userId)
    .first<{ approval_status: string }>()
  if (target?.approval_status !== "approved") {
    throw new HttpError(404, "user_not_found", "未找到该用户")
  }
  const [low, high] = orderedPair(session.user.id, userId)
  const blocked = await env.DB.prepare(
    "SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?) LIMIT 1"
  )
    .bind(session.user.id, userId, userId, session.user.id)
    .first()
  if (blocked) throw new HttpError(403, "friend_blocked", "无法添加该用户")
  const existing = await env.DB.prepare(
    "SELECT 1 FROM friendships WHERE user_low_id = ? AND user_high_id = ?"
  )
    .bind(low, high)
    .first()
  if (existing) return json({ status: "accepted", alreadyFriends: true })
  const reverse = await env.DB.prepare(
    "SELECT id FROM friend_requests WHERE sender_id = ? AND receiver_id = ? AND status = 'pending'"
  )
    .bind(userId, session.user.id)
    .first<{ id: string }>()
  if (reverse) {
    await acceptFriendRequest(env, reverse.id, session.user.id)
    await notify(env, userId, {
      type: "friend.accepted",
      userId: session.user.id,
    })
    return json({ status: "accepted", requestId: reverse.id })
  }
  const id = crypto.randomUUID()
  try {
    await env.DB.prepare(
      "INSERT INTO friend_requests(id, sender_id, receiver_id, status, created_at) VALUES (?, ?, ?, 'pending', ?)"
    )
      .bind(id, session.user.id, userId, Date.now())
      .run()
  } catch {
    throw new HttpError(409, "friend_request_exists", "好友申请已经发送")
  }
  await notify(env, userId, {
    type: "friend.requested",
    requestId: id,
    senderId: session.user.id,
  })
  return json({ id, status: "pending" }, 201)
}

export async function actOnFriendRequest(
  request: Request,
  env: PlatformEnv,
  requestId: string
) {
  const { session } = await requireProfile(request, env, { online: true })
  const { action } = requestActionSchema.parse(await readJson(request))
  const row = await env.DB.prepare(
    "SELECT sender_id, receiver_id, status FROM friend_requests WHERE id = ?"
  )
    .bind(requestId)
    .first<{ sender_id: string; receiver_id: string; status: string }>()
  if (!row || row.status !== "pending") {
    throw new HttpError(404, "request_not_found", "好友申请已失效")
  }
  if (action === "cancel") {
    if (row.sender_id !== session.user.id) {
      throw new HttpError(403, "forbidden", "不能取消他人的好友申请")
    }
    await env.DB.prepare(
      "UPDATE friend_requests SET status = 'cancelled', responded_at = ? WHERE id = ? AND status = 'pending'"
    )
      .bind(Date.now(), requestId)
      .run()
    await notify(env, row.receiver_id, {
      type: "friend.request_updated",
      requestId,
      status: "cancelled",
    })
    return json({ status: "cancelled" })
  }
  if (row.receiver_id !== session.user.id) {
    throw new HttpError(403, "forbidden", "不能处理他人的好友申请")
  }
  if (action === "accept") {
    await acceptFriendRequest(env, requestId, session.user.id)
  } else {
    await env.DB.prepare(
      "UPDATE friend_requests SET status = 'declined', responded_at = ? WHERE id = ? AND status = 'pending'"
    )
      .bind(Date.now(), requestId)
      .run()
  }
  const status = action === "accept" ? "accepted" : "declined"
  await notify(env, row.sender_id, {
    type: `friend.${status}`,
    requestId,
    userId: session.user.id,
  })
  return json({ status })
}

export async function removeFriend(
  request: Request,
  env: PlatformEnv,
  friendId: string
) {
  const { session } = await requireProfile(request, env, { online: true })
  const [low, high] = orderedPair(session.user.id, friendId)
  await env.DB.prepare(
    "DELETE FROM friendships WHERE user_low_id = ? AND user_high_id = ?"
  )
    .bind(low, high)
    .run()
  await notify(env, friendId, {
    type: "friend.removed",
    userId: session.user.id,
  })
  return json({ success: true })
}

export async function blockUser(request: Request, env: PlatformEnv) {
  const { session } = await requireProfile(request, env, { online: true })
  const { userId } = userIdSchema.parse(await readJson(request))
  if (userId === session.user.id) {
    throw new HttpError(400, "self_block", "不能屏蔽自己")
  }
  const [low, high] = orderedPair(session.user.id, userId)
  const now = Date.now()
  await env.DB.batch([
    env.DB.prepare(
      "INSERT OR IGNORE INTO blocks(blocker_id, blocked_id, created_at) VALUES (?, ?, ?)"
    ).bind(session.user.id, userId, now),
    env.DB.prepare(
      "DELETE FROM friendships WHERE user_low_id = ? AND user_high_id = ?"
    ).bind(low, high),
    env.DB.prepare(
      "UPDATE friend_requests SET status = 'cancelled', responded_at = ? WHERE status = 'pending' AND ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?))"
    ).bind(now, session.user.id, userId, userId, session.user.id),
  ])
  await notify(env, userId, {
    type: "friend.removed",
    userId: session.user.id,
  })
  return json({ success: true })
}

export async function unblockUser(
  request: Request,
  env: PlatformEnv,
  userId: string
) {
  const { session } = await requireProfile(request, env, { online: true })
  await env.DB.prepare(
    "DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?"
  )
    .bind(session.user.id, userId)
    .run()
  return json({ success: true })
}

export async function conversations(request: Request, env: PlatformEnv) {
  const { session } = await requireProfile(request, env, { online: true })
  const result = await env.DB.prepare(
    `SELECT c.id, c.kind, c.room_id, c.created_at,
            m.id AS last_message_id, m.body AS last_message_body,
            m.sender_id AS last_sender_id, m.created_at AS last_message_at,
            other.user_id AS other_user_id, p.display_name AS other_name,
            p.avatar_key AS other_avatar
     FROM conversation_members mine
     JOIN conversations c ON c.id = mine.conversation_id
     LEFT JOIN messages m ON m.id = (
       SELECT id FROM messages
       WHERE conversation_id = c.id AND deleted_at IS NULL
       ORDER BY created_at DESC LIMIT 1
     )
     LEFT JOIN conversation_members other ON c.kind = 'direct'
       AND other.conversation_id = c.id AND other.user_id <> mine.user_id
     LEFT JOIN profiles p ON p.user_id = other.user_id
     WHERE mine.user_id = ?
     ORDER BY COALESCE(m.created_at, c.created_at) DESC
     LIMIT 100`
  )
    .bind(session.user.id)
    .all()
  return json({ conversations: result.results })
}

export async function createDirectConversation(
  request: Request,
  env: PlatformEnv
) {
  const { session } = await requireProfile(request, env, { online: true })
  const { userId } = userIdSchema.parse(await readJson(request))
  const [low, high] = orderedPair(session.user.id, userId)
  const friendship = await env.DB.prepare(
    "SELECT 1 FROM friendships WHERE user_low_id = ? AND user_high_id = ?"
  )
    .bind(low, high)
    .first()
  if (!friendship) {
    throw new HttpError(403, "friends_only", "只能向好友发起私聊")
  }
  const directKey = `${low}:${high}`
  let conversation = await env.DB.prepare(
    "SELECT id FROM conversations WHERE direct_key = ?"
  )
    .bind(directKey)
    .first<{ id: string }>()
  if (!conversation) {
    const id = crypto.randomUUID()
    const now = Date.now()
    await env.DB.batch([
      env.DB.prepare(
        "INSERT OR IGNORE INTO conversations(id, kind, direct_key, created_at) VALUES (?, 'direct', ?, ?)"
      ).bind(id, directKey, now),
      env.DB.prepare(
        "INSERT OR IGNORE INTO conversation_members(conversation_id, user_id, joined_at) VALUES ((SELECT id FROM conversations WHERE direct_key = ?), ?, ?)"
      ).bind(directKey, low, now),
      env.DB.prepare(
        "INSERT OR IGNORE INTO conversation_members(conversation_id, user_id, joined_at) VALUES ((SELECT id FROM conversations WHERE direct_key = ?), ?, ?)"
      ).bind(directKey, high, now),
    ])
    conversation = await env.DB.prepare(
      "SELECT id FROM conversations WHERE direct_key = ?"
    )
      .bind(directKey)
      .first<{ id: string }>()
  }
  return json({ conversationId: conversation!.id }, 201)
}

export async function conversationMessages(
  request: Request,
  env: PlatformEnv,
  conversationId: string
) {
  const { session } = await requireProfile(request, env, { online: true })
  const membership = await env.DB.prepare(
    "SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?"
  )
    .bind(conversationId, session.user.id)
    .first()
  if (!membership) {
    throw new HttpError(404, "conversation_not_found", "未找到该会话")
  }
  const cursor = Number(new URL(request.url).searchParams.get("before") ?? "0")
  const before = Number.isFinite(cursor) && cursor > 0 ? cursor : Date.now() + 1
  const result = await env.DB.prepare(
    `SELECT m.id, m.sender_id, p.display_name AS sender_name,
            m.body, m.created_at, m.edited_at, m.deleted_at
     FROM messages m
     JOIN profiles p ON p.user_id = m.sender_id
     WHERE m.conversation_id = ? AND m.created_at < ?
     ORDER BY m.created_at DESC LIMIT 50`
  )
    .bind(conversationId, before)
    .all()
  return json({ messages: result.results.reverse() })
}

export async function createReport(request: Request, env: PlatformEnv) {
  const { session } = await requireProfile(request, env, { online: true })
  const input = reportSchema.parse(await readJson(request))
  if (!input.targetUserId && !input.targetMessageId) {
    throw new HttpError(400, "report_target_required", "请选择举报对象")
  }
  const id = crypto.randomUUID()
  const now = Date.now()
  await env.DB.prepare(
    "INSERT INTO reports(id, reporter_id, target_user_id, target_message_id, reason, details, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?)"
  )
    .bind(
      id,
      session.user.id,
      input.targetUserId ?? null,
      input.targetMessageId ?? null,
      input.reason,
      input.details,
      now,
      now
    )
    .run()
  return json({ id, status: "open" }, 201)
}

async function acceptFriendRequest(
  env: PlatformEnv,
  requestId: string,
  receiverId: string
) {
  const row = await env.DB.prepare(
    "SELECT sender_id, receiver_id FROM friend_requests WHERE id = ? AND status = 'pending'"
  )
    .bind(requestId)
    .first<{ sender_id: string; receiver_id: string }>()
  if (!row || row.receiver_id !== receiverId) {
    throw new HttpError(404, "request_not_found", "好友申请已失效")
  }
  const [low, high] = orderedPair(row.sender_id, row.receiver_id)
  const now = Date.now()
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE friend_requests SET status = 'accepted', responded_at = ? WHERE id = ? AND status = 'pending'"
    ).bind(now, requestId),
    env.DB.prepare(
      "INSERT OR IGNORE INTO friendships(user_low_id, user_high_id, created_at) VALUES (?, ?, ?)"
    ).bind(low, high, now),
  ])
}

function orderedPair(left: string, right: string): [string, string] {
  return left < right ? [left, right] : [right, left]
}

async function notify(env: PlatformEnv, userId: string, event: unknown) {
  await env.SOCIAL.getByName("social-v1").notifyUser(userId, event)
}
