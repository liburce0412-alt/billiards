export const adminDemoPreferenceKeys = [
  "adminDemoOfflineEnabled",
  "adminDemoOnlineEnabled",
  "adminDemoLevel",
] as const

export function hasAdminDemoAssistCapability(profile: {
  admin_demo_assist: number
}): boolean {
  return profile.admin_demo_assist === 1
}

export function containsAdminDemoPreference(
  preferences?: Record<string, unknown>
): boolean {
  return adminDemoPreferenceKeys.some((key) => preferences?.[key] !== undefined)
}
