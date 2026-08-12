import { betterAuth } from "better-auth"
import { username } from "better-auth/plugins"
import type { AuthSession, PlatformEnv } from "./env"
import { HttpError } from "./http"

export function createAuth(env: PlatformEnv) {
  return betterAuth({
    appName: "Break Builder",
    baseURL: env.APP_ORIGIN,
    basePath: "/api/auth",
    secret: env.BETTER_AUTH_SECRET,
    database: env.DB,
    trustedOrigins: [env.APP_ORIGIN],
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      autoSignIn: true,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      password: {
        hash: async (password) => {
          const shard = crypto.getRandomValues(new Uint8Array(1))[0] % 32
          return env.PASSWORD_KDF.getByName(`kdf-${shard}`).hashPassword(
            password,
            shard
          )
        },
        verify: async ({ hash, password }) => {
          const shard = Number(hash.split("$")[2])
          if (!Number.isInteger(shard) || shard < 0 || shard > 31) return false
          return env.PASSWORD_KDF.getByName(`kdf-${shard}`).verifyPassword(
            password,
            hash
          )
        },
      },
    },
    disabledPaths: ["/is-username-available", "/request-password-reset"],
    plugins: [
      username({
        minUsernameLength: 3,
        maxUsernameLength: 24,
        usernameValidator: (value) =>
          /^(?!admin$)[a-z0-9_.\u4e00-\u9fff]+$/i.test(value),
        displayUsernameValidator: (value) =>
          value.trim().length >= 2 && value.trim().length <= 24,
      }),
    ],
    advanced: {
      database: { generateId: "uuid" },
      useSecureCookies: env.APP_ORIGIN.startsWith("https://"),
      defaultCookieAttributes: {
        httpOnly: true,
        secure: env.APP_ORIGIN.startsWith("https://"),
        sameSite: "lax",
        path: "/",
      },
    },
    rateLimit: { enabled: false },
  })
}

export async function sessionForRequest(
  request: Request,
  env: PlatformEnv
): Promise<AuthSession | null> {
  const result = await createAuth(env).api.getSession({
    headers: request.headers,
  })
  return (result as AuthSession | null) ?? null
}

export async function requireSession(request: Request, env: PlatformEnv) {
  const session = await sessionForRequest(request, env)
  if (!session) {
    throw new HttpError(401, "authentication_required", "请先登录")
  }
  return session
}

export type ProfileRow = {
  user_id: string
  display_name: string
  role: "user" | "moderator" | "admin"
  approval_status: "pending" | "approved" | "rejected" | "revoked"
  visibility: "online" | "away" | "dnd" | "invisible"
  avatar_key: string | null
  bio: string
  accent: string
  cue_style: string
  table_style: string
  environment_style: string
  language: string
  sanction_version: number
  muted_until: number | null
  banned_until: number | null
}

export async function profileForUser(env: PlatformEnv, userId: string) {
  return env.DB.prepare("SELECT * FROM profiles WHERE user_id = ?")
    .bind(userId)
    .first<ProfileRow>()
}

export async function requireProfile(
  request: Request,
  env: PlatformEnv,
  options: { online?: boolean; roles?: ProfileRow["role"][] } = {}
) {
  const session = await requireSession(request, env)
  const profile = await profileForUser(env, session.user.id)
  if (!profile) {
    throw new HttpError(403, "profile_missing", "账号资料尚未初始化")
  }
  const now = Date.now()
  if (profile.banned_until && profile.banned_until > now) {
    throw new HttpError(403, "account_banned", "账号当前已被封禁")
  }
  if (options.online && profile.approval_status !== "approved") {
    throw new HttpError(
      403,
      "online_approval_required",
      "在线模式需要管理员审核通过"
    )
  }
  if (options.roles && !options.roles.includes(profile.role)) {
    throw new HttpError(403, "forbidden", "没有执行此操作的权限")
  }
  return { session, profile }
}
