import { z } from "zod"
import {
  createAuth,
  profileForUser,
  requireProfile,
  requireSession,
} from "../auth"
import { constantTimeEqual, randomToken, sha256 } from "../crypto"
import type { PlatformEnv } from "../env"
import { HttpError, json, readJson } from "../http"
import { verifyTurnstile } from "../turnstile"

const registerSchema = z.object({
  username: z.string().trim().min(3).max(24),
  displayName: z.string().trim().min(2).max(24),
  email: z.email().max(254),
  password: z.string().min(10).max(128),
  adminInvite: z.string().trim().max(128).optional(),
  turnstileToken: z.string().max(2048).default(""),
})

const recoverySchema = z.object({
  email: z.email().max(254),
  username: z.string().trim().min(3).max(24),
  recoveryCode: z.string().trim().min(8).max(64),
  newPassword: z.string().min(10).max(128),
  turnstileToken: z.string().max(2048).default(""),
})

const profileSchema = z.object({
  displayName: z.string().trim().min(2).max(24).optional(),
  bio: z.string().trim().max(180).optional(),
  visibility: z.enum(["online", "away", "dnd", "invisible"]).optional(),
  accent: z.enum(["ocean", "violet", "ember", "jade", "chrome"]).optional(),
  cueStyle: z.string().trim().min(1).max(48).optional(),
  tableStyle: z.string().trim().min(1).max(48).optional(),
  environmentStyle: z.string().trim().min(1).max(48).optional(),
  language: z.enum(["zh-CN", "en"]).optional(),
  preferences: z
    .object({
      reducedMotion: z.boolean().optional(),
      quality: z.enum(["low", "balanced", "high"]).optional(),
      desktopShotDock: z.enum(["expanded", "collapsed"]).optional(),
      touchShotDock: z.enum(["expanded", "collapsed"]).optional(),
      cameraMode: z.enum(["aim", "top", "free"]).optional(),
      masterVolume: z.number().min(0).max(1).optional(),
      socialDrawerOpen: z.boolean().optional(),
    })
    .optional(),
})

const avatarTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
])

async function reserveAdminInvite(
  adminInvite: string | undefined,
  env: PlatformEnv
): Promise<string | null> {
  if (!adminInvite) return null
  const valid = await constantTimeEqual(adminInvite, env.ADMIN_BOOTSTRAP_CODE)
  if (!valid) {
    throw new HttpError(403, "admin_invite_invalid", "管理员邀请码无效")
  }
  const token = randomToken()
  const now = Date.now()
  const reservation = await env.DB.prepare(
    `UPDATE bootstrap_state
     SET reserved_token = ?, reserved_at = ?
     WHERE key = 'admin-invite' AND consumed_at IS NULL
       AND (reserved_at IS NULL OR reserved_at < ?)`
  )
    .bind(token, now, now - 10 * 60 * 1000)
    .run()
  if (!reservation.meta.changes) {
    throw new HttpError(
      409,
      "admin_invite_consumed",
      "管理员邀请码已被使用或正在使用"
    )
  }
  return token
}

async function releaseAdminInvite(
  bootstrapToken: string | null,
  env: PlatformEnv
) {
  if (!bootstrapToken) return
  await env.DB.prepare(
    "UPDATE bootstrap_state SET reserved_token = NULL, reserved_at = NULL WHERE key = 'admin-invite' AND reserved_token = ?"
  )
    .bind(bootstrapToken)
    .run()
}

async function persistRegisteredAccount(
  env: PlatformEnv,
  userId: string,
  displayName: string,
  bootstrapToken: string | null,
  recoveryCodes: string[]
) {
  const now = Date.now()
  const isAdmin = bootstrapToken !== null
  const statements: D1PreparedStatement[] = [
    env.DB.prepare(
      `INSERT INTO profiles(
        user_id, display_name, role, approval_status, visibility,
        created_at, updated_at, approved_by, approved_at
      ) VALUES (?, ?, ?, ?, 'online', ?, ?, ?, ?)`
    ).bind(
      userId,
      displayName,
      isAdmin ? "admin" : "user",
      isAdmin ? "approved" : "pending",
      now,
      now,
      isAdmin ? userId : null,
      isAdmin ? now : null
    ),
    env.DB.prepare(
      "INSERT INTO user_preferences(user_id, updated_at) VALUES (?, ?)"
    ).bind(userId, now),
  ]
  for (const code of recoveryCodes) {
    const codeHash = await recoveryCodeHash(code, env.RECOVERY_CODE_PEPPER)
    statements.push(
      env.DB.prepare(
        "INSERT INTO recovery_codes(id, user_id, code_hash, created_at) VALUES (?, ?, ?, ?)"
      ).bind(crypto.randomUUID(), userId, codeHash, now)
    )
  }
  if (bootstrapToken) {
    statements.push(
      env.DB.prepare(
        `UPDATE bootstrap_state
         SET consumed_at = ?, consumed_by = ?, reserved_token = NULL,
             reserved_at = NULL
         WHERE key = 'admin-invite' AND reserved_token = ?`
      ).bind(now, userId, bootstrapToken),
      env.DB.prepare(
        "INSERT INTO audit_logs(id, actor_id, action, target_type, target_id, metadata_json, created_at) VALUES (?, ?, 'admin.bootstrap', 'user', ?, '{}', ?)"
      ).bind(crypto.randomUUID(), userId, userId, now)
    )
  }
  await env.DB.batch(statements)
}

export async function register(request: Request, env: PlatformEnv) {
  const input = registerSchema.parse(await readJson(request))
  await verifyTurnstile(request, env, input.turnstileToken, "signup")
  await consumeLimit(request, env, "register", 5, 60 * 60 * 1000)

  const bootstrapToken = await reserveAdminInvite(input.adminInvite, env)

  const auth = createAuth(env)
  try {
    const result = await auth.api.signUpEmail({
      body: {
        name: input.displayName,
        displayUsername: input.displayName,
        username: input.username,
        email: input.email.toLowerCase(),
        password: input.password,
      },
      headers: request.headers,
      returnHeaders: true,
    })
    const userId = result.response.user.id
    const isAdmin = bootstrapToken !== null
    const recoveryCodes = generateRecoveryCodes()
    await persistRegisteredAccount(
      env,
      userId,
      input.displayName,
      bootstrapToken,
      recoveryCodes
    )
    return json(
      {
        user: result.response.user,
        approvalStatus: isAdmin ? "approved" : "pending",
        role: isAdmin ? "admin" : "user",
        recoveryCodes,
        message: isAdmin
          ? "管理员账号已创建，在线模式已开启"
          : "注册成功；管理员审核前可使用全部离线模式",
      },
      201,
      result.headers
    )
  } catch (error) {
    await releaseAdminInvite(bootstrapToken, env)
    throw error
  }
}

export async function me(request: Request, env: PlatformEnv) {
  const session = await requireSession(request, env)
  const [profile, preferences, announcements] = await Promise.all([
    profileForUser(env, session.user.id),
    env.DB.prepare("SELECT * FROM user_preferences WHERE user_id = ?")
      .bind(session.user.id)
      .first(),
    env.DB.prepare(
      "SELECT id, title, body, active_from, active_until FROM announcements WHERE active_from <= ? AND (active_until IS NULL OR active_until > ?) ORDER BY created_at DESC LIMIT 5"
    )
      .bind(Date.now(), Date.now())
      .all(),
  ])
  if (!profile) {
    throw new HttpError(403, "profile_missing", "账号资料尚未初始化")
  }
  return json({
    session: { expiresAt: session.session.expiresAt },
    user: {
      id: session.user.id,
      email: session.user.email,
      username: session.user.username,
      displayName: profile.display_name,
      role: profile.role,
      approvalStatus: profile.approval_status,
      visibility: profile.visibility,
      avatarUrl: profile.avatar_key ? "/media/avatar/me" : null,
      bio: profile.bio,
      accent: profile.accent,
      cueStyle: profile.cue_style,
      tableStyle: profile.table_style,
      environmentStyle: profile.environment_style,
      language: profile.language,
      mutedUntil: profile.muted_until,
      bannedUntil: profile.banned_until,
    },
    preferences,
    capabilities: {
      offline: true,
      online: profile.approval_status === "approved",
      social: profile.approval_status === "approved",
      admin: profile.role === "admin" || profile.role === "moderator",
    },
    turnstileSiteKey: env.TURNSTILE_SITE_KEY || null,
    announcements: announcements.results,
  })
}

export async function updateMe(request: Request, env: PlatformEnv) {
  const { session } = await requireProfile(request, env)
  const input = profileSchema.parse(await readJson(request))
  const now = Date.now()
  const profileUpdates = [
    ["display_name", input.displayName],
    ["bio", input.bio],
    ["visibility", input.visibility],
    ["accent", input.accent],
    ["cue_style", input.cueStyle],
    ["table_style", input.tableStyle],
    ["environment_style", input.environmentStyle],
    ["language", input.language],
  ].filter((entry): entry is [string, string] => entry[1] !== undefined)
  if (profileUpdates.length) {
    await env.DB.prepare(
      `UPDATE profiles SET ${profileUpdates
        .map(([column]) => `${column} = ?`)
        .join(", ")}, updated_at = ? WHERE user_id = ?`
    )
      .bind(...profileUpdates.map(([, value]) => value), now, session.user.id)
      .run()
  }
  if (input.displayName) {
    await env.DB.prepare(
      'UPDATE "user" SET name = ?, displayUsername = ?, updatedAt = ? WHERE id = ?'
    )
      .bind(input.displayName, input.displayName, now, session.user.id)
      .run()
  }
  if (input.preferences) {
    const mapping: Record<string, string> = {
      reducedMotion: "reduced_motion",
      quality: "quality",
      desktopShotDock: "desktop_shot_dock",
      touchShotDock: "touch_shot_dock",
      cameraMode: "camera_mode",
      masterVolume: "master_volume",
      socialDrawerOpen: "social_drawer_open",
    }
    const entries = Object.entries(input.preferences).filter(
      ([, value]) => value !== undefined
    )
    if (entries.length) {
      await env.DB.prepare(
        `UPDATE user_preferences SET ${entries
          .map(([key]) => `${mapping[key]} = ?`)
          .join(", ")}, updated_at = ? WHERE user_id = ?`
      )
        .bind(
          ...entries.map(([, value]) =>
            typeof value === "boolean" ? Number(value) : value
          ),
          now,
          session.user.id
        )
        .run()
    }
  }
  return me(request, env)
}

export async function uploadAvatar(request: Request, env: PlatformEnv) {
  const { session } = await requireProfile(request, env)
  const contentType = request.headers.get("content-type")?.split(";")[0] ?? ""
  const extension = avatarTypes.get(contentType)
  if (!extension) {
    throw new HttpError(
      415,
      "unsupported_avatar",
      "头像只支持 JPG、PNG 或 WebP"
    )
  }
  const declaredLength = Number(request.headers.get("content-length") ?? "0")
  if (declaredLength > 2 * 1024 * 1024) {
    throw new HttpError(413, "avatar_too_large", "头像不能超过 2 MB")
  }
  const bytes = await request.arrayBuffer()
  if (!bytes.byteLength || bytes.byteLength > 2 * 1024 * 1024) {
    throw new HttpError(413, "avatar_too_large", "头像不能超过 2 MB")
  }
  const key = `users/${session.user.id}/${crypto.randomUUID()}.${extension}`
  const current = await env.DB.prepare(
    "SELECT avatar_key FROM profiles WHERE user_id = ?"
  )
    .bind(session.user.id)
    .first<{ avatar_key: string | null }>()
  await env.AVATARS.put(key, bytes, {
    metadata: { contentType, owner: session.user.id },
  })
  await env.DB.prepare(
    "UPDATE profiles SET avatar_key = ?, updated_at = ? WHERE user_id = ?"
  )
    .bind(key, Date.now(), session.user.id)
    .run()
  if (current?.avatar_key) await env.AVATARS.delete(current.avatar_key)
  return json({ avatarUrl: `/media/avatar/${session.user.id}` })
}

export async function avatar(
  request: Request,
  env: PlatformEnv,
  requestedUserId: string
) {
  const session = await requireSession(request, env)
  const userId = requestedUserId === "me" ? session.user.id : requestedUserId
  const row = await env.DB.prepare(
    "SELECT avatar_key FROM profiles WHERE user_id = ?"
  )
    .bind(userId)
    .first<{ avatar_key: string | null }>()
  if (!row?.avatar_key) return new Response(null, { status: 404 })
  const object = await env.AVATARS.getWithMetadata<{ contentType?: string }>(
    row.avatar_key,
    "arrayBuffer"
  )
  if (!object.value) return new Response(null, { status: 404 })
  const headers = new Headers({
    "content-type": object.metadata?.contentType ?? "image/webp",
  })
  headers.set("cache-control", "private, max-age=3600")
  return new Response(object.value, { headers })
}

export async function recover(request: Request, env: PlatformEnv) {
  const input = recoverySchema.parse(await readJson(request))
  await verifyTurnstile(request, env, input.turnstileToken, "recovery")
  await consumeLimit(request, env, "recovery", 5, 60 * 60 * 1000)
  const user = await env.DB.prepare(
    'SELECT id FROM "user" WHERE lower(email) = lower(?) AND lower(username) = lower(?)'
  )
    .bind(input.email, input.username)
    .first<{ id: string }>()
  const codeHash = await recoveryCodeHash(
    input.recoveryCode,
    env.RECOVERY_CODE_PEPPER
  )
  const code = user
    ? await env.DB.prepare(
        "SELECT id FROM recovery_codes WHERE user_id = ? AND code_hash = ? AND used_at IS NULL"
      )
        .bind(user.id, codeHash)
        .first<{ id: string }>()
    : null
  if (!user || !code) {
    throw new HttpError(403, "recovery_invalid", "账号信息或一次性恢复码不正确")
  }
  const shard = crypto.getRandomValues(new Uint8Array(1))[0] % 32
  const passwordHash = await env.PASSWORD_KDF.getByName(
    `kdf-${shard}`
  ).hashPassword(input.newPassword, shard)
  const now = Date.now()
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE recovery_codes SET used_at = ? WHERE id = ? AND used_at IS NULL"
    ).bind(now, code.id),
    env.DB.prepare(
      "UPDATE account SET password = ?, updatedAt = ? WHERE userId = ? AND providerId = 'credential'"
    ).bind(passwordHash, now, user.id),
    env.DB.prepare("DELETE FROM session WHERE userId = ?").bind(user.id),
    env.DB.prepare(
      "INSERT INTO audit_logs(id, actor_id, action, target_type, target_id, metadata_json, created_at) VALUES (?, ?, 'account.recovered', 'user', ?, '{}', ?)"
    ).bind(crypto.randomUUID(), user.id, user.id, now),
  ])
  return json({ success: true, message: "密码已重置，请重新登录" })
}

export async function regenerateRecoveryCodes(
  request: Request,
  env: PlatformEnv
) {
  const { session } = await requireProfile(request, env)
  const codes = generateRecoveryCodes()
  const now = Date.now()
  const statements = [
    env.DB.prepare("DELETE FROM recovery_codes WHERE user_id = ?").bind(
      session.user.id
    ),
  ]
  for (const code of codes) {
    statements.push(
      env.DB.prepare(
        "INSERT INTO recovery_codes(id, user_id, code_hash, created_at) VALUES (?, ?, ?, ?)"
      ).bind(
        crypto.randomUUID(),
        session.user.id,
        await recoveryCodeHash(code, env.RECOVERY_CODE_PEPPER),
        now
      )
    )
  }
  await env.DB.batch(statements)
  return json({ recoveryCodes: codes })
}

function generateRecoveryCodes(): string[] {
  return Array.from({ length: 8 }, () => {
    const value = crypto.getRandomValues(new Uint8Array(8))
    return [...value]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
      .replace(/(.{4})/g, "$1-")
      .replace(/-$/, "")
  })
}

async function recoveryCodeHash(code: string, pepper: string) {
  return sha256(`${pepper}:${code.replaceAll("-", "").toUpperCase()}`)
}

async function consumeLimit(
  request: Request,
  env: PlatformEnv,
  action: string,
  limit: number,
  windowMs: number
) {
  const ip = request.headers.get("CF-Connecting-IP") ?? "local"
  const key = await sha256(`${action}:${ip}`)
  const result = await env.RATE_LIMITS.getByName(key.slice(0, 4)).consume(
    key,
    limit,
    windowMs
  )
  if (!result.allowed) {
    throw new HttpError(429, "rate_limited", "请求过于频繁，请稍后重试")
  }
}
