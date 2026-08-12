import { describe, expect, it } from "vitest"
import { constantTimeEqual, randomToken, sha256 } from "../../server/crypto"
import {
  HttpError,
  errorResponse,
  readJson,
  securityHeaders,
} from "../../server/http"

describe("worker platform primitives", () => {
  it("uses stable cryptographic digests and constant-time comparisons", async () => {
    expect(await sha256("Break Builder")).toBe(await sha256("Break Builder"))
    expect(await constantTimeEqual("same-secret", "same-secret")).toBe(true)
    expect(await constantTimeEqual("same-secret", "other-secret")).toBe(false)
    expect(randomToken(24)).toMatch(/^[A-Za-z0-9_-]{32}$/)
  })

  it("rejects oversized JSON before parsing", async () => {
    const request = new Request("https://play.campus3ai.xyz/api/test", {
      method: "POST",
      headers: { "content-length": "99" },
      body: "{}",
    })
    await expect(readJson(request, 8)).rejects.toMatchObject({
      status: 413,
      code: "payload_too_large",
    })
  })

  it("returns non-leaking errors with first-party security headers", async () => {
    const response = securityHeaders(
      errorResponse(
        new HttpError(403, "online_approval_required", "等待管理员审核"),
        "request-1"
      )
    )
    const payload = await response.json<{
      error: { code: string; message: string }
      requestId: string
    }>()

    expect(response.status).toBe(403)
    expect(payload).toEqual({
      error: {
        code: "online_approval_required",
        message: "等待管理员审核",
      },
      requestId: "request-1",
    })
    expect(response.headers.get("x-frame-options")).toBe("SAMEORIGIN")
    expect(response.headers.get("content-security-policy")).toContain(
      "frame-ancestors 'self'"
    )
    expect(response.headers.get("content-security-policy")).not.toContain(
      "connect-src 'self' wss:"
    )
  })
})
