import type { GameRoom } from "./durable/game-room"
import type { TableTennisRoom } from "./durable/table-tennis-room"
import type { PasswordKdf } from "./durable/password-kdf"
import type { RateLimitBucket } from "./durable/rate-limit"
import type { SocialRoom } from "./durable/social-room"

export interface PlatformEnv extends Omit<
  Env,
  | "SOCIAL"
  | "GAME_ROOMS"
  | "TABLE_TENNIS_ROOMS"
  | "PASSWORD_KDF"
  | "RATE_LIMITS"
> {
  SOCIAL: DurableObjectNamespace<SocialRoom>
  GAME_ROOMS: DurableObjectNamespace<GameRoom>
  TABLE_TENNIS_ROOMS: DurableObjectNamespace<TableTennisRoom>
  PASSWORD_KDF: DurableObjectNamespace<PasswordKdf>
  RATE_LIMITS: DurableObjectNamespace<RateLimitBucket>
  BETTER_AUTH_SECRET: string
  RECOVERY_CODE_PEPPER: string
  ADMIN_BOOTSTRAP_CODE: string
  TURNSTILE_SECRET: string
}

export interface SessionUser {
  id: string
  name: string
  email: string
  username?: string | null
  displayUsername?: string | null
  image?: string | null
}

export interface AuthSession {
  session: {
    id: string
    userId: string
    expiresAt: Date
    token: string
  }
  user: SessionUser
}
