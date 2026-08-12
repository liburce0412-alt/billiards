import { z } from "zod"
import { requireProfile } from "../auth"
import type { PlatformEnv } from "../env"
import { HttpError, json, readJson } from "../http"

const approvalSchema = z.object({
  status: z.enum(["approved", "rejected", "revoked"]),
  note: z.string().trim().max(500).default(""),
})

const sanctionSchema = z.object({
  type: z.enum(["mute", "ban"]),
  reason: z.string().trim().min(3).max(500),
  durationMinutes: z.number().int().min(1).max(525_600).nullable(),
})

const roleSchema = z.object({ role: z.enum(["user", "moderator", "admin"]) })

const announcementSchema = z.object({
  title: z.string().trim().min(2).max(80),
  body: z.string().trim().min(2).max(2000),
  activeFrom: z.number().int().positive().optional(),
  activeUntil: z.number().int().positive().nullable().optional(),
})

const reportActionSchema = z.object({
  status: z.enum(["reviewing", "resolved", "dismissed"]),
})

export async function adminOverview(request: Request, env: PlatformEnv) {
  await requireProfile(request, env, { roles: ["moderator", "admin"] })
  const [counts, pending, reports, announcements] = await Promise.all([
    env.DB.prepare(
      `SELECT
        (SELECT COUNT(*) FROM profiles) AS users,
        (SELECT COUNT(*) FROM profiles WHERE approval_status = 'pending') AS pending,
        (SELECT COUNT(*) FROM reports WHERE status IN ('open', 'reviewing')) AS reports,
        (SELECT COUNT(*) FROM game_rooms WHERE status = 'active') AS active_rooms`
    ).first(),
    env.DB.prepare(
      `SELECT u.id, u.username, u.email, p.display_name, p.created_at
       FROM profiles p JOIN "user" u ON u.id = p.user_id
       WHERE p.approval_status = 'pending'
       ORDER BY p.created_at ASC LIMIT 100`
    ).all(),
    env.DB.prepare(
      `SELECT r.*, reporter.display_name AS reporter_name,
              target.display_name AS target_name
       FROM reports r
       JOIN profiles reporter ON reporter.user_id = r.reporter_id
       LEFT JOIN profiles target ON target.user_id = r.target_user_id
       WHERE r.status IN ('open', 'reviewing')
       ORDER BY r.created_at ASC LIMIT 100`
    ).all(),
    env.DB.prepare(
      "SELECT * FROM announcements ORDER BY created_at DESC LIMIT 50"
    ).all(),
  ])
  return json({
    counts,
    pending: pending.results,
    reports: reports.results,
    announcements: announcements.results,
  })
}

export async function adminUsers(request: Request, env: PlatformEnv) {
  await requireProfile(request, env, { roles: ["moderator", "admin"] })
  const url = new URL(request.url)
  const query = url.searchParams.get("q")?.trim() ?? ""
  const status = url.searchParams.get("status")?.trim() ?? ""
  const conditions = ["1 = 1"]
  const values: unknown[] = []
  if (query) {
    conditions.push(
      "(u.username LIKE ? OR u.email LIKE ? OR p.display_name LIKE ?)"
    )
    const like = `%${query.replaceAll("%", "").replaceAll("_", "")}%`
    values.push(like, like, like)
  }
  if (["pending", "approved", "rejected", "revoked"].includes(status)) {
    conditions.push("p.approval_status = ?")
    values.push(status)
  }
  const result = await env.DB.prepare(
    `SELECT u.id, u.username, u.email, u.createdAt,
            p.display_name, p.role, p.approval_status, p.visibility,
            p.avatar_key, p.muted_until, p.banned_until, p.approval_note
     FROM profiles p JOIN "user" u ON u.id = p.user_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY u.createdAt DESC LIMIT 100`
  )
    .bind(...values)
    .all()
  return json({ users: result.results })
}

export async function setApproval(
  request: Request,
  env: PlatformEnv,
  targetId: string
) {
  const { session } = await requireProfile(request, env, {
    roles: ["moderator", "admin"],
  })
  const input = approvalSchema.parse(await readJson(request))
  const target = await env.DB.prepare(
    "SELECT role, approval_status FROM profiles WHERE user_id = ?"
  )
    .bind(targetId)
    .first<{ role: string; approval_status: string }>()
  if (!target) throw new HttpError(404, "user_not_found", "未找到该用户")
  if (target.role === "admin" && targetId !== session.user.id) {
    const actor = await env.DB.prepare(
      "SELECT role FROM profiles WHERE user_id = ?"
    )
      .bind(session.user.id)
      .first<{ role: string }>()
    if (actor?.role !== "admin") {
      throw new HttpError(403, "admin_required", "只有管理员能处理管理员账号")
    }
  }
  const now = Date.now()
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE profiles SET approval_status = ?, approval_note = ?, approved_by = ?, approved_at = ?, sanction_version = sanction_version + 1, updated_at = ? WHERE user_id = ?"
    ).bind(
      input.status,
      input.note,
      session.user.id,
      input.status === "approved" ? now : null,
      now,
      targetId
    ),
    auditStatement(env, session.user.id, `approval.${input.status}`, targetId, {
      previous: target.approval_status,
      note: input.note,
    }),
  ])
  await env.SOCIAL.getByName("social-v1").notifyUser(targetId, {
    type: "approval.changed",
    status: input.status,
    note: input.note,
  })
  if (input.status === "revoked") {
    await env.SOCIAL.getByName("social-v1").revokeUser(
      targetId,
      "在线权限已被管理员撤销"
    )
  }
  return json({ userId: targetId, approvalStatus: input.status })
}

export async function setSanction(
  request: Request,
  env: PlatformEnv,
  targetId: string
) {
  const { session, profile: actor } = await requireProfile(request, env, {
    roles: ["moderator", "admin"],
  })
  const input = sanctionSchema.parse(await readJson(request))
  const target = await env.DB.prepare(
    "SELECT role FROM profiles WHERE user_id = ?"
  )
    .bind(targetId)
    .first<{ role: string }>()
  if (!target) throw new HttpError(404, "user_not_found", "未找到该用户")
  if (
    targetId === session.user.id ||
    target.role === "admin" ||
    (target.role === "moderator" && actor.role !== "admin")
  ) {
    throw new HttpError(403, "sanction_forbidden", "不能处理该账号")
  }
  const now = Date.now()
  const expiresAt = input.durationMinutes
    ? now + input.durationMinutes * 60_000
    : null
  const column = input.type === "ban" ? "banned_until" : "muted_until"
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE profiles SET ${column} = ?, sanction_version = sanction_version + 1, updated_at = ? WHERE user_id = ?`
    ).bind(expiresAt ?? 9_007_199_254_740_991, now, targetId),
    env.DB.prepare(
      "INSERT INTO sanctions(id, actor_id, target_id, type, reason, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).bind(
      crypto.randomUUID(),
      session.user.id,
      targetId,
      input.type,
      input.reason,
      expiresAt,
      now
    ),
    auditStatement(env, session.user.id, `sanction.${input.type}`, targetId, {
      reason: input.reason,
      expiresAt,
    }),
  ])
  if (input.type === "ban") {
    await env.DB.prepare("DELETE FROM session WHERE userId = ?")
      .bind(targetId)
      .run()
    await env.SOCIAL.getByName("social-v1").revokeUser(
      targetId,
      "账号已被管理员封禁"
    )
  } else {
    await env.SOCIAL.getByName("social-v1").notifyUser(targetId, {
      type: "moderation.muted",
      expiresAt,
      reason: input.reason,
    })
  }
  return json({ success: true, type: input.type, expiresAt })
}

export async function clearSanctions(
  request: Request,
  env: PlatformEnv,
  targetId: string
) {
  const { session } = await requireProfile(request, env, {
    roles: ["moderator", "admin"],
  })
  const now = Date.now()
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE profiles SET muted_until = NULL, banned_until = NULL, sanction_version = sanction_version + 1, updated_at = ? WHERE user_id = ?"
    ).bind(now, targetId),
    env.DB.prepare(
      "UPDATE sanctions SET revoked_at = ? WHERE target_id = ? AND revoked_at IS NULL"
    ).bind(now, targetId),
    auditStatement(env, session.user.id, "sanction.cleared", targetId, {}),
  ])
  await env.SOCIAL.getByName("social-v1").notifyUser(targetId, {
    type: "moderation.cleared",
  })
  return json({ success: true })
}

export async function setRole(
  request: Request,
  env: PlatformEnv,
  targetId: string
) {
  const { session } = await requireProfile(request, env, { roles: ["admin"] })
  const { role } = roleSchema.parse(await readJson(request))
  if (targetId === session.user.id && role !== "admin") {
    throw new HttpError(409, "self_demotion", "不能降低自己的管理员权限")
  }
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE profiles SET role = ?, sanction_version = sanction_version + 1, updated_at = ? WHERE user_id = ?"
    ).bind(role, Date.now(), targetId),
    auditStatement(env, session.user.id, "role.changed", targetId, { role }),
  ])
  return json({ userId: targetId, role })
}

export async function createAnnouncement(request: Request, env: PlatformEnv) {
  const { session } = await requireProfile(request, env, {
    roles: ["moderator", "admin"],
  })
  const input = announcementSchema.parse(await readJson(request))
  const now = Date.now()
  const id = crypto.randomUUID()
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO announcements(id, author_id, title, body, active_from, active_until, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).bind(
      id,
      session.user.id,
      input.title,
      input.body,
      input.activeFrom ?? now,
      input.activeUntil ?? null,
      now
    ),
    auditStatement(
      env,
      session.user.id,
      "announcement.created",
      id,
      {
        title: input.title,
      },
      "announcement"
    ),
  ])
  return json({ id }, 201)
}

export async function takeDownAvatar(
  request: Request,
  env: PlatformEnv,
  targetId: string
) {
  const { session } = await requireProfile(request, env, {
    roles: ["moderator", "admin"],
  })
  const row = await env.DB.prepare(
    "SELECT avatar_key FROM profiles WHERE user_id = ?"
  )
    .bind(targetId)
    .first<{ avatar_key: string | null }>()
  if (!row) throw new HttpError(404, "user_not_found", "未找到该用户")
  if (row.avatar_key) await env.AVATARS.delete(row.avatar_key)
  const now = Date.now()
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE profiles SET avatar_key = NULL, updated_at = ? WHERE user_id = ?"
    ).bind(now, targetId),
    env.DB.prepare(
      "INSERT INTO sanctions(id, actor_id, target_id, type, reason, created_at) VALUES (?, ?, ?, 'avatar_takedown', '管理员移除不合规头像', ?)"
    ).bind(crypto.randomUUID(), session.user.id, targetId, now),
    auditStatement(env, session.user.id, "avatar.removed", targetId, {}),
  ])
  return json({ success: true })
}

export async function updateReport(
  request: Request,
  env: PlatformEnv,
  reportId: string
) {
  const { session } = await requireProfile(request, env, {
    roles: ["moderator", "admin"],
  })
  const { status } = reportActionSchema.parse(await readJson(request))
  const result = await env.DB.prepare(
    "UPDATE reports SET status = ?, assigned_to = ?, updated_at = ? WHERE id = ?"
  )
    .bind(status, session.user.id, Date.now(), reportId)
    .run()
  if (!result.meta.changes) {
    throw new HttpError(404, "report_not_found", "未找到该举报")
  }
  await auditStatement(
    env,
    session.user.id,
    "report.updated",
    reportId,
    {
      status,
    },
    "report"
  ).run()
  return json({ id: reportId, status })
}

export async function auditLogs(request: Request, env: PlatformEnv) {
  await requireProfile(request, env, { roles: ["admin"] })
  const before = Number(
    new URL(request.url).searchParams.get("before") ?? Date.now() + 1
  )
  const result = await env.DB.prepare(
    `SELECT a.*, p.display_name AS actor_name
     FROM audit_logs a LEFT JOIN profiles p ON p.user_id = a.actor_id
     WHERE a.created_at < ? ORDER BY a.created_at DESC LIMIT 100`
  )
    .bind(before)
    .all()
  return json({ logs: result.results })
}

function auditStatement(
  env: PlatformEnv,
  actorId: string,
  action: string,
  targetId: string,
  metadata: Record<string, unknown>,
  targetType = "user"
) {
  return env.DB.prepare(
    "INSERT INTO audit_logs(id, actor_id, action, target_type, target_id, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).bind(
    crypto.randomUUID(),
    actorId,
    action,
    targetType,
    targetId,
    JSON.stringify(metadata),
    Date.now()
  )
}
