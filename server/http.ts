import { ZodError } from "zod"

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
} as const

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message)
  }
}

export function json(data: unknown, status = 200, headers?: HeadersInit) {
  const output = new Headers(JSON_HEADERS)
  if (headers) {
    new Headers(headers).forEach((value, key) => output.set(key, value))
  }
  return Response.json(data, { status, headers: output })
}

export function errorResponse(error: unknown, requestId: string): Response {
  if (error instanceof HttpError) {
    return json(
      { error: { code: error.code, message: error.message }, requestId },
      error.status
    )
  }
  if (error instanceof ZodError) {
    return json(
      {
        error: { code: "invalid_request", message: "提交内容不符合要求" },
        fields: error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
        requestId,
      },
      400
    )
  }
  console.error(
    JSON.stringify({
      level: "error",
      event: "request_failed",
      requestId,
      error: error instanceof Error ? error.message : String(error),
    })
  )
  return json(
    {
      error: { code: "internal_error", message: "服务暂时不可用，请稍后重试" },
      requestId,
    },
    500
  )
}

export async function readJson<T>(request: Request, maxBytes = 24_576) {
  const length = Number(request.headers.get("content-length") ?? "0")
  if (length > maxBytes) {
    throw new HttpError(413, "payload_too_large", "提交内容过大")
  }
  const text = await request.text()
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new HttpError(413, "payload_too_large", "提交内容过大")
  }
  try {
    return JSON.parse(text) as T
  } catch {
    throw new HttpError(400, "invalid_json", "无法读取提交内容")
  }
}

export function assertMethod(request: Request, ...methods: string[]) {
  if (!methods.includes(request.method)) {
    throw new HttpError(405, "method_not_allowed", "不支持这个请求方式")
  }
}

export function securityHeaders(response: Response): Response {
  const headers = new Headers(response.headers)
  headers.set("referrer-policy", "strict-origin-when-cross-origin")
  headers.set("x-frame-options", "SAMEORIGIN")
  headers.set("x-content-type-options", "nosniff")
  headers.set("permissions-policy", "camera=(), microphone=(), geolocation=()")
  headers.set(
    "content-security-policy",
    "default-src 'self'; script-src 'self' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self' https://challenges.cloudflare.com; frame-src 'self' https://challenges.cloudflare.com; object-src 'none'; base-uri 'self'; frame-ancestors 'self'"
  )
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}
