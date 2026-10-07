import {
  avatar,
  me,
  recover,
  regenerateRecoveryCodes,
  register,
  updateMe,
  uploadAvatar,
} from "./api/account"
import {
  adminOverview,
  adminUsers,
  auditLogs,
  clearSanctions,
  createAnnouncement,
  setApproval,
  setRole,
  setSanction,
  takeDownAvatar,
  updateReport,
} from "./api/admin"
import {
  actOnInvite,
  createInvite,
  createRoom,
  joinRoom,
  listInvites,
  roomByCode,
  roomById,
} from "./api/rooms"
import {
  actOnFriendRequest,
  blockUser,
  conversationMessages,
  conversations,
  createDirectConversation,
  createReport,
  friends,
  removeFriend,
  requestFriend,
  searchUsers,
  unblockUser,
} from "./api/social"
import { createAuth, requireProfile } from "./auth"
import { sha256 } from "./crypto"
import { GameRoom } from "./durable/game-room"
import { TableTennisRoom } from "./durable/table-tennis-room"
import { PasswordKdf } from "./durable/password-kdf"
import { RateLimitBucket } from "./durable/rate-limit"
import { SocialRoom } from "./durable/social-room"
import type { PlatformEnv } from "./env"
import { HttpError, errorResponse, json, securityHeaders } from "./http"
import { verifyTurnstile } from "./turnstile"
import { staticAsset } from "./assets"

export { GameRoom, PasswordKdf, RateLimitBucket, SocialRoom }
export { TableTennisRoom }

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"])
const AUTH_PREFIX = "/api/auth/"

type RouteMatch = RegExpMatchArray
type RouteHandler = (
  request: Request,
  env: PlatformEnv,
  match: RouteMatch
) => Promise<Response> | Response

type Route = {
  pattern: RegExp
  handler: RouteHandler
}

function methodHandler(
  handlers: Partial<Record<string, RouteHandler>>
): RouteHandler {
  return (request, env, match) => {
    const handler = handlers[request.method]
    if (!handler) {
      throw new HttpError(405, "method_not_allowed", "不支持这个请求方式")
    }
    return handler(request, env, match)
  }
}

function oneMethod(method: string, handler: RouteHandler): RouteHandler {
  return methodHandler({ [method]: handler })
}

const requestRoutes: readonly Route[] = [
  {
    pattern: /^\/api\/table-tennis\/results$/,
    handler: oneMethod("GET", async (request, env) => {
      const { session } = await requireProfile(request, env)
      const result = await env.DB.prepare(
        "SELECT id, winner_id, reason, score_json, started_at, ended_at FROM table_tennis_results WHERE host_id = ? OR guest_id = ? ORDER BY ended_at DESC LIMIT 20"
      )
        .bind(session.user.id, session.user.id)
        .all()
      return json({ results: result.results })
    }),
  },
  {
    pattern: /^\/api\/config$/,
    handler: oneMethod("GET", (_request, env) => configResponse(env)),
  },
  {
    pattern: /^\/api\/register$/,
    handler: oneMethod("POST", register),
  },
  {
    pattern: /^\/api\/recover$/,
    handler: oneMethod("POST", recover),
  },
  {
    pattern: /^\/api\/me$/,
    handler: methodHandler({ GET: me, PATCH: updateMe }),
  },
  {
    pattern: /^\/api\/me\/avatar$/,
    handler: oneMethod("PUT", uploadAvatar),
  },
  {
    pattern: /^\/api\/me\/recovery-codes$/,
    handler: oneMethod("POST", regenerateRecoveryCodes),
  },
  {
    pattern: /^\/media\/avatar\/([^/]+)$/,
    handler: methodHandler({
      GET: (request, env, match) => avatar(request, env, decoded(match[1])),
      HEAD: (request, env, match) => avatar(request, env, decoded(match[1])),
    }),
  },
  {
    pattern: /^\/api\/users\/search$/,
    handler: oneMethod("GET", searchUsers),
  },
  {
    pattern: /^\/api\/social\/friends$/,
    handler: methodHandler({ GET: friends, POST: requestFriend }),
  },
  {
    pattern: /^\/api\/social\/friend-requests\/([^/]+)$/,
    handler: oneMethod("PATCH", (request, env, match) =>
      actOnFriendRequest(request, env, decoded(match[1]))
    ),
  },
  {
    pattern: /^\/api\/social\/friends\/([^/]+)$/,
    handler: oneMethod("DELETE", (request, env, match) =>
      removeFriend(request, env, decoded(match[1]))
    ),
  },
  {
    pattern: /^\/api\/social\/blocks$/,
    handler: oneMethod("POST", blockUser),
  },
  {
    pattern: /^\/api\/social\/blocks\/([^/]+)$/,
    handler: oneMethod("DELETE", (request, env, match) =>
      unblockUser(request, env, decoded(match[1]))
    ),
  },
  {
    pattern: /^\/api\/social\/conversations$/,
    handler: methodHandler({
      GET: conversations,
      POST: createDirectConversation,
    }),
  },
  {
    pattern: /^\/api\/social\/conversations\/([^/]+)\/messages$/,
    handler: oneMethod("GET", (request, env, match) =>
      conversationMessages(request, env, decoded(match[1]))
    ),
  },
  {
    pattern: /^\/api\/social\/reports$/,
    handler: oneMethod("POST", createReport),
  },
  {
    pattern: /^\/api\/rooms$/,
    handler: oneMethod("POST", createRoom),
  },
  {
    pattern: /^\/api\/rooms\/code\/([^/]+)$/,
    handler: oneMethod("GET", (request, env, match) =>
      roomByCode(request, env, decoded(match[1]))
    ),
  },
  {
    pattern: /^\/api\/rooms\/([^/]+)$/,
    handler: oneMethod("GET", (request, env, match) =>
      roomById(request, env, decoded(match[1]))
    ),
  },
  {
    pattern: /^\/api\/rooms\/([^/]+)\/join$/,
    handler: oneMethod("POST", (request, env, match) =>
      joinRoom(request, env, decoded(match[1]))
    ),
  },
  {
    pattern: /^\/api\/invites$/,
    handler: methodHandler({ GET: listInvites, POST: createInvite }),
  },
  {
    pattern: /^\/api\/invites\/([^/]+)$/,
    handler: oneMethod("PATCH", (request, env, match) =>
      actOnInvite(request, env, decoded(match[1]))
    ),
  },
  {
    pattern: /^\/api\/admin\/overview$/,
    handler: oneMethod("GET", adminOverview),
  },
  {
    pattern: /^\/api\/admin\/users$/,
    handler: oneMethod("GET", adminUsers),
  },
  {
    pattern: /^\/api\/admin\/users\/([^/]+)\/approval$/,
    handler: oneMethod("PATCH", (request, env, match) =>
      setApproval(request, env, decoded(match[1]))
    ),
  },
  {
    pattern: /^\/api\/admin\/users\/([^/]+)\/sanctions$/,
    handler: methodHandler({
      POST: (request, env, match) =>
        setSanction(request, env, decoded(match[1])),
      DELETE: (request, env, match) =>
        clearSanctions(request, env, decoded(match[1])),
    }),
  },
  {
    pattern: /^\/api\/admin\/users\/([^/]+)\/role$/,
    handler: oneMethod("PATCH", (request, env, match) =>
      setRole(request, env, decoded(match[1]))
    ),
  },
  {
    pattern: /^\/api\/admin\/users\/([^/]+)\/avatar$/,
    handler: oneMethod("DELETE", (request, env, match) =>
      takeDownAvatar(request, env, decoded(match[1]))
    ),
  },
  {
    pattern: /^\/api\/admin\/announcements$/,
    handler: oneMethod("POST", createAnnouncement),
  },
  {
    pattern: /^\/api\/admin\/reports\/([^/]+)$/,
    handler: oneMethod("PATCH", (request, env, match) =>
      updateReport(request, env, decoded(match[1]))
    ),
  },
  {
    pattern: /^\/api\/admin\/audit$/,
    handler: oneMethod("GET", auditLogs),
  },
  {
    pattern: /^\/ws\/social$/,
    handler: oneMethod("GET", socialSocket),
  },
  {
    pattern: /^\/ws\/game\/([^/]+)$/,
    handler: oneMethod("GET", (request, env, match) =>
      gameSocket(request, env, decoded(match[1]))
    ),
  },
]

export default {
  async fetch(request, env): Promise<Response> {
    const requestId = request.headers.get("cf-ray") ?? crypto.randomUUID()
    try {
      if (request.method === "OPTIONS") {
        return securityHeaders(new Response(null, { status: 204 }))
      }
      enforceOrigin(request, env)
      const response = await dispatchRequest(request, env, new URL(request.url))
      if (isWebSocketResponse(response)) return response
      const secured = securityHeaders(response)
      secured.headers.set("x-request-id", requestId)
      return secured
    } catch (error) {
      const response = securityHeaders(errorResponse(error, requestId))
      response.headers.set("x-request-id", requestId)
      return response
    }
  },

  async scheduled(_controller, env, ctx): Promise<void> {
    ctx.waitUntil(runRetention(env))
  },
} satisfies ExportedHandler<PlatformEnv>

async function dispatchRequest(
  request: Request,
  env: PlatformEnv,
  url: URL
): Promise<Response> {
  for (const route of requestRoutes) {
    const match = url.pathname.match(route.pattern)
    if (match) return route.handler(request, env, match)
  }
  if (url.pathname.startsWith(AUTH_PREFIX)) {
    return authRequest(request, env, url.pathname)
  }
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/ws/")) {
    throw new HttpError(404, "not_found", "接口不存在")
  }
  return staticAsset(request, env)
}

function configResponse(env: PlatformEnv) {
  return json({
    productName: "Break Builder",
    turnstileSiteKey: env.TURNSTILE_SITE_KEY || null,
    account: {
      minimumPasswordLength: 10,
      onlineApprovalRequired: true,
      recoveryUsesOneTimeCodes: true,
    },
  })
}

async function authRequest(
  request: Request,
  env: PlatformEnv,
  pathname: string
): Promise<Response> {
  if (pathname !== "/api/auth/sign-in/username") {
    return createAuth(env).handler(request)
  }
  const body = await request
    .clone()
    .json<{ username?: string }>()
    .catch((): { username?: string } => ({}))
  const username = body.username?.trim().toLowerCase() ?? ""
  const ip = request.headers.get("CF-Connecting-IP") ?? "local"
  const key = await sha256(`login:${ip}:${username}`)
  const limiter = env.RATE_LIMITS.getByName(key.slice(0, 4))
  const state = await limiter.status(key)
  if (!state.allowed) {
    throw new HttpError(429, "rate_limited", "登录尝试过多，请稍后再试")
  }
  if (state.remaining <= 7) {
    await verifyTurnstile(
      request,
      env,
      request.headers.get("X-Turnstile-Token") ?? "",
      "login"
    )
  }
  const response = await createAuth(env).handler(request)
  if (response.ok) await limiter.clear(key)
  else await limiter.consume(key, 10, 15 * 60 * 1000)
  return response
}

async function socialSocket(request: Request, env: PlatformEnv) {
  assertWebSocket(request)
  const { session, profile } = await requireProfile(request, env, {
    online: true,
  })
  const headers = platformHeaders(
    request,
    session.user.id,
    profile.display_name
  )
  headers.set("X-Platform-Role", profile.role)
  headers.set("X-Platform-Visibility", profile.visibility)
  if (profile.avatar_key) {
    headers.set("X-Platform-Avatar", `/media/avatar/${session.user.id}`)
  }
  return env.SOCIAL.getByName("social-v1").fetch(
    new Request(request, { headers })
  )
}

async function gameSocket(request: Request, env: PlatformEnv, roomId: string) {
  assertWebSocket(request)
  const { session, profile } = await requireProfile(request, env, {
    online: true,
  })
  const member = await env.DB.prepare(
    `SELECT grm.member_role, gr.status, gr.game_type
     FROM game_room_members grm JOIN game_rooms gr ON gr.id = grm.room_id
     WHERE grm.room_id = ? AND grm.user_id = ?`
  )
    .bind(roomId, session.user.id)
    .first<{ member_role: string; status: string; game_type?: string }>()
  if (!member || !["waiting", "active"].includes(member.status)) {
    throw new HttpError(403, "room_membership_required", "你不是这个房间的成员")
  }
  const headers = platformHeaders(
    request,
    session.user.id,
    profile.display_name
  )
  headers.set(
    "X-Platform-Username",
    encodeURIComponent(session.user.username ?? session.user.name)
  )
  headers.set("X-Platform-Cue-Style", profile.cue_style)
  headers.set("X-Platform-Member-Role", member.member_role)
  headers.set("X-Platform-Room-Id", roomId)
  if (profile.avatar_key) {
    headers.set("X-Platform-Avatar", `/media/avatar/${session.user.id}`)
  }
  const rooms =
    member.game_type === "table-tennis"
      ? env.TABLE_TENNIS_ROOMS
      : env.GAME_ROOMS
  return rooms.getByName(roomId).fetch(new Request(request, { headers }))
}

function platformHeaders(
  request: Request,
  userId: string,
  displayName: string
) {
  const headers = new Headers(request.headers)
  headers.set("X-Platform-User-Id", userId)
  headers.set("X-Platform-Display-Name", encodeURIComponent(displayName))
  return headers
}

function decoded(value: string) {
  try {
    return decodeURIComponent(value)
  } catch {
    throw new HttpError(400, "invalid_path", "资源地址无效")
  }
}

function enforceOrigin(request: Request, env: PlatformEnv) {
  const isWebSocket =
    request.headers.get("Upgrade")?.toLowerCase() === "websocket"
  if (SAFE_METHODS.has(request.method) && !isWebSocket) return
  const origin = request.headers.get("Origin")
  if (origin !== env.APP_ORIGIN) {
    throw new HttpError(403, "origin_rejected", "请求来源不受信任")
  }
}

function assertWebSocket(request: Request) {
  if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
    throw new HttpError(426, "websocket_required", "需要 WebSocket 连接")
  }
}

function isWebSocketResponse(response: Response) {
  return response.status === 101 || "webSocket" in response
}

async function runRetention(env: PlatformEnv) {
  const now = Date.now()
  const dmCutoff = now - Number(env.CHAT_DM_RETENTION_DAYS) * 86_400_000
  const roomCutoff = now - Number(env.CHAT_ROOM_RETENTION_DAYS) * 86_400_000
  await env.DB.batch([
    env.DB.prepare(
      "DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE kind = 'direct') AND created_at < ?"
    ).bind(dmCutoff),
    env.DB.prepare(
      "DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE kind = 'room') AND created_at < ?"
    ).bind(roomCutoff),
    env.DB.prepare(
      "UPDATE match_invites SET status = 'expired', responded_at = ? WHERE status = 'pending' AND expires_at <= ?"
    ).bind(now, now),
  ])
}
