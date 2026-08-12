import type { PlatformEnv } from "./env"
import { HttpError } from "./http"

type TurnstileResult = {
  success?: boolean
  action?: string
  hostname?: string
}

export async function verifyTurnstile(
  request: Request,
  env: PlatformEnv,
  token: string,
  expectedAction: string
): Promise<void> {
  if (!env.TURNSTILE_SECRET) return
  if (!token || token.length > 2048) {
    throw new HttpError(403, "turnstile_required", "请完成人机验证")
  }
  const ip = request.headers.get("CF-Connecting-IP") ?? ""
  let result: TurnstileResult
  try {
    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        signal: AbortSignal.timeout(10_000),
        body: new URLSearchParams({
          secret: env.TURNSTILE_SECRET,
          response: token,
          remoteip: ip,
          idempotency_key: crypto.randomUUID(),
        }),
      }
    )
    if (!response.ok) throw new Error(`siteverify ${response.status}`)
    result = (await response.json()) as TurnstileResult
  } catch {
    throw new HttpError(
      403,
      "turnstile_unavailable",
      "暂时无法完成人机验证，请稍后重试"
    )
  }
  const hosts = new Set(
    env.TURNSTILE_HOSTNAMES.split(",")
      .map((host) => host.trim())
      .filter(Boolean)
  )
  if (
    !result.success ||
    result.action !== expectedAction ||
    !result.hostname ||
    !hosts.has(result.hostname)
  ) {
    throw new HttpError(403, "turnstile_failed", "人机验证未通过")
  }
}
