import type { PlatformMe } from "./api"

export interface VerifiedGameIdentity {
  userId: string
  username: string
  displayName: string
  avatarUrl: string | null
  cueStyle: string
  role: PlatformMe["user"]["role"]
  visibility: PlatformMe["user"]["visibility"]
  onlineEnabled: boolean
  adminDemoAssist: boolean
}

declare global {
  // Launcher and game are separate webpack entries. The verified identity is
  // intentionally carried through a page-scoped global instead of URL data so
  // the game HUD never treats client supplied query fields as trusted profile
  // information.
  var __BREAK_BUILDER_GAME_IDENTITY__: VerifiedGameIdentity | undefined
}

export function publishVerifiedGameIdentity(session: PlatformMe): void {
  globalThis.__BREAK_BUILDER_GAME_IDENTITY__ = {
    userId: session.user.id,
    username: session.user.username,
    displayName: session.user.displayName,
    avatarUrl: session.user.avatarUrl,
    cueStyle: session.user.cueStyle,
    role: session.user.role,
    visibility: session.user.visibility,
    onlineEnabled: session.capabilities.online,
    adminDemoAssist: session.capabilities.adminDemoAssist,
  }
}

export function verifiedGameIdentity(): VerifiedGameIdentity | undefined {
  return globalThis.__BREAK_BUILDER_GAME_IDENTITY__
}
