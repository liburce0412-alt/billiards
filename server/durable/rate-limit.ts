import { DurableObject } from "cloudflare:workers"
import type { PlatformEnv } from "../env"

type RateLimitResult = {
  allowed: boolean
  remaining: number
  retryAfterMs: number
}

export class RateLimitBucket extends DurableObject<PlatformEnv> {
  constructor(ctx: DurableObjectState, env: PlatformEnv) {
    super(ctx, env)
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS windows (
          key TEXT PRIMARY KEY,
          count INTEGER NOT NULL,
          reset_at INTEGER NOT NULL
        )
      `)
    })
  }

  async consume(
    key: string,
    limit: number,
    windowMs: number
  ): Promise<RateLimitResult> {
    const now = Date.now()
    const row = this.ctx.storage.sql
      .exec<{ count: number; reset_at: number }>(
        "SELECT count, reset_at FROM windows WHERE key = ?",
        key
      )
      .toArray()[0]
    if (!row || row.reset_at <= now) {
      const resetAt = now + windowMs
      this.ctx.storage.sql.exec(
        "INSERT INTO windows(key, count, reset_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = 1, reset_at = excluded.reset_at",
        key,
        resetAt
      )
      return { allowed: true, remaining: limit - 1, retryAfterMs: windowMs }
    }
    if (row.count >= limit) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterMs: Math.max(1, row.reset_at - now),
      }
    }
    this.ctx.storage.sql.exec(
      "UPDATE windows SET count = count + 1 WHERE key = ?",
      key
    )
    return {
      allowed: true,
      remaining: limit - row.count - 1,
      retryAfterMs: Math.max(1, row.reset_at - now),
    }
  }

  async status(key: string): Promise<RateLimitResult> {
    const now = Date.now()
    const row = this.ctx.storage.sql
      .exec<{ count: number; reset_at: number }>(
        "SELECT count, reset_at FROM windows WHERE key = ?",
        key
      )
      .toArray()[0]
    if (!row || row.reset_at <= now) {
      return { allowed: true, remaining: 10, retryAfterMs: 0 }
    }
    return {
      allowed: row.count < 10,
      remaining: Math.max(0, 10 - row.count),
      retryAfterMs: Math.max(1, row.reset_at - now),
    }
  }

  async clear(key: string): Promise<void> {
    this.ctx.storage.sql.exec("DELETE FROM windows WHERE key = ?", key)
  }

  override async alarm(): Promise<void> {
    this.ctx.storage.sql.exec(
      "DELETE FROM windows WHERE reset_at <= ?",
      Date.now()
    )
  }
}
