import type { PlatformEnv } from "./env"
import { HttpError } from "./http"

/**
 * Hand the original pathname to Cloudflare Assets. The assets binding owns
 * extensionless HTML canonicalisation; rewriting `/account` to
 * `/account.html` here creates a redirect loop with `html_handling`.
 */
export async function staticAsset(
  request: Request,
  env: Pick<PlatformEnv, "ASSETS">
): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    throw new HttpError(404, "not_found", "页面不存在")
  }
  return env.ASSETS.fetch(request)
}
