import { verifiedGameIdentity } from "./gameidentity"
import type { PlatformMe } from "./api"

export interface AdminAssistSettings {
  offlineEnabled: boolean
  onlineEnabled: boolean
  level: number
}

const storageKey = "break-builder.admin-demo-assist.v2"
const legacyStorageKey = "break-builder.admin-demo-assist.v1"
const disabledSettings: AdminAssistSettings = {
  offlineEnabled: false,
  onlineEnabled: false,
  level: 11,
}

declare global {
  var __BREAK_BUILDER_SESSION__: PlatformMe | undefined
}

function clampLevel(level: number): number {
  return Math.max(1, Math.min(11, Math.round(level) || 11))
}

function isLocalDemoSession(): boolean {
  return (
    ["localhost", "127.0.0.1"].includes(globalThis.location?.hostname ?? "") &&
    new URLSearchParams(globalThis.location?.search ?? "").get(
      "platformDemo"
    ) === "1"
  )
}

export function canUseAdminAssist(): boolean {
  const identity = verifiedGameIdentity() as
    | (ReturnType<typeof verifiedGameIdentity> & {
        adminDemoAssist?: boolean
      })
    | undefined
  return (
    identity?.adminDemoAssist === true ||
    globalThis.__BREAK_BUILDER_SESSION__?.capabilities.adminDemoAssist === true
  )
}

export function adminAssistErrorScale(level: number): number {
  return clampLevel(level) === 11 ? 0 : 1
}

export function loadAdminAssistSettings(): AdminAssistSettings {
  if (!canUseAdminAssist() || typeof localStorage === "undefined") {
    return { ...disabledSettings }
  }
  try {
    const preferences = globalThis.__BREAK_BUILDER_SESSION__?.preferences
    if (
      !isLocalDemoSession() &&
      preferences &&
      Number.isFinite(preferences.admin_demo_level) &&
      preferences.admin_demo_offline_enabled !== undefined &&
      preferences.admin_demo_online_enabled !== undefined
    ) {
      return {
        offlineEnabled: preferences.admin_demo_offline_enabled === 1,
        onlineEnabled: preferences.admin_demo_online_enabled === 1,
        level: clampLevel(preferences.admin_demo_level),
      }
    }
    const current = localStorage.getItem(storageKey)
    const stored = JSON.parse(
      current ?? localStorage.getItem(legacyStorageKey) ?? "{}"
    )
    return {
      offlineEnabled:
        stored.offlineEnabled === true ||
        (current === null && stored.enabled === true),
      onlineEnabled: stored.onlineEnabled === true,
      level: clampLevel(Number(stored.level)),
    }
  } catch {
    return { ...disabledSettings }
  }
}

export function saveAdminAssistSettings(
  settings: AdminAssistSettings
): AdminAssistSettings {
  if (!canUseAdminAssist() || typeof localStorage === "undefined") {
    return { ...disabledSettings }
  }
  const next = {
    offlineEnabled: settings.offlineEnabled === true,
    onlineEnabled: settings.onlineEnabled === true,
    level: clampLevel(settings.level),
  }
  localStorage.setItem(storageKey, JSON.stringify(next))
  const preferences = globalThis.__BREAK_BUILDER_SESSION__?.preferences
  if (preferences) {
    preferences.admin_demo_offline_enabled = Number(next.offlineEnabled)
    preferences.admin_demo_online_enabled = Number(next.onlineEnabled)
    preferences.admin_demo_level = next.level
  }
  return next
}
