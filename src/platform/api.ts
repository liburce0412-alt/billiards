export type ApprovalStatus = "pending" | "approved" | "rejected" | "revoked"
export type Visibility = "online" | "away" | "dnd" | "invisible"
export type Accent = "ocean" | "violet" | "ember" | "jade" | "chrome"

export interface PlatformUser {
  id: string
  email: string
  username: string
  displayName: string
  role: "user" | "moderator" | "admin"
  approvalStatus: ApprovalStatus
  visibility: Visibility
  avatarUrl: string | null
  bio: string
  accent: Accent
  cueStyle: string
  tableStyle: string
  environmentStyle: string
  language: "zh-CN" | "en"
  mutedUntil: number | null
  bannedUntil: number | null
}

export interface PlatformMe {
  session: { expiresAt: string | Date }
  user: PlatformUser
  preferences: {
    reduced_motion: number
    quality: "low" | "balanced" | "high"
    desktop_shot_dock: "expanded" | "collapsed"
    touch_shot_dock: "expanded" | "collapsed"
    camera_mode: "aim" | "top" | "free"
    master_volume: number
    social_drawer_open: number
  }
  capabilities: {
    offline: boolean
    online: boolean
    social: boolean
    admin: boolean
  }
  turnstileSiteKey: string | null
  announcements: Array<{
    id: string
    title: string
    body: string
    active_from: number
    active_until: number | null
  }>
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields: unknown[] = []
  ) {
    super(message)
  }
}

export async function apiJson<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const headers = new Headers(init.headers)
  if (
    init.body &&
    !(init.body instanceof FormData) &&
    !headers.has("content-type")
  ) {
    headers.set("content-type", "application/json")
  }
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers,
  })
  const payload = await response.json().catch(() => ({
    error: { code: "invalid_response", message: "服务响应无效" },
  }))
  if (!response.ok) {
    throw new ApiError(
      response.status,
      payload?.error?.code ?? "request_failed",
      payload?.error?.message ?? "请求失败",
      payload?.fields ?? []
    )
  }
  return payload as T
}

export function isLocalDemo(): boolean {
  const host = globalThis.location.hostname
  return (
    (host === "localhost" || host === "127.0.0.1") &&
    new URLSearchParams(globalThis.location.search).get("platformDemo") === "1"
  )
}

export function demoSession(): PlatformMe {
  return {
    session: { expiresAt: new Date(Date.now() + 86_400_000).toISOString() },
    user: {
      id: "00000000-0000-4000-8000-000000000001",
      email: "demo@local.invalid",
      username: "future_player",
      displayName: "未来玩家",
      role: "admin",
      approvalStatus: "approved",
      visibility: "online",
      avatarUrl: null,
      bio: "",
      accent: "ocean",
      cueStyle: "heritage",
      tableStyle: "american-ivory",
      environmentStyle: "spectra",
      language: "zh-CN",
      mutedUntil: null,
      bannedUntil: null,
    },
    preferences: {
      reduced_motion: 0,
      quality: "high",
      desktop_shot_dock: "expanded",
      touch_shot_dock: "expanded",
      camera_mode: "top",
      master_volume: 0.8,
      social_drawer_open: 1,
    },
    capabilities: { offline: true, online: true, social: true, admin: true },
    turnstileSiteKey: null,
    announcements: [],
  }
}

export function isPlatformPreview(): boolean {
  return new URLSearchParams(globalThis.location.search).has("platformPreview")
}

export async function loadSession(): Promise<PlatformMe | null> {
  if (isLocalDemo()) return demoSession()
  try {
    return await apiJson<PlatformMe>("/api/me")
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null
    throw error
  }
}
