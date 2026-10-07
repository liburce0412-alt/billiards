import { demoSession } from "../../src/platform/api"
import { publishVerifiedGameIdentity } from "../../src/platform/gameidentity"
import {
  adminAimMotionTimings,
  adminAssistErrorScale,
  canUseAdminAssist,
  hasManualOpeningShot,
  isAdminAssistMatchAllowed,
  loadAdminAssistSettings,
  saveAdminAssistSettings,
  shortestAngleDelta,
} from "../../src/controller/adminassist"
import {
  FULL_POWER_HOLD_MS,
  powerRatioFromHeldMs,
} from "../../src/controller/aim"

describe("admin demo assist settings", () => {
  beforeEach(() => {
    localStorage.clear()
    globalThis.__BREAK_BUILDER_GAME_IDENTITY__ = undefined
    globalThis.__BREAK_BUILDER_SESSION__ = undefined
  })

  it("is unavailable without a verified administrator identity", () => {
    const user = demoSession()
    user.user.role = "user"
    user.capabilities.adminDemoAssist = false
    globalThis.__BREAK_BUILDER_SESSION__ = user
    publishVerifiedGameIdentity(user)

    expect(canUseAdminAssist()).toBe(false)
    expect(
      saveAdminAssistSettings({
        offlineEnabled: true,
        onlineEnabled: true,
        level: 11,
      })
    ).toEqual({
      offlineEnabled: false,
      onlineEnabled: false,
      level: 11,
    })
  })

  it("persists and clamps administrator-only strength", () => {
    const session = demoSession()
    globalThis.__BREAK_BUILDER_SESSION__ = session
    publishVerifiedGameIdentity(session)

    expect(
      saveAdminAssistSettings({
        offlineEnabled: true,
        onlineEnabled: true,
        level: 99,
      })
    ).toEqual({
      offlineEnabled: true,
      onlineEnabled: true,
      level: 11,
    })
    expect(loadAdminAssistSettings()).toEqual({
      offlineEnabled: true,
      onlineEnabled: true,
      level: 11,
    })
  })

  it("loads account-backed settings before the local fallback", () => {
    const session = demoSession()
    session.preferences.admin_demo_offline_enabled = 1
    session.preferences.admin_demo_online_enabled = 1
    session.preferences.admin_demo_level = 7
    globalThis.__BREAK_BUILDER_SESSION__ = session
    publishVerifiedGameIdentity(session)
    localStorage.setItem(
      "break-builder.admin-demo-assist.v2",
      JSON.stringify({
        offlineEnabled: false,
        onlineEnabled: false,
        level: 2,
      })
    )

    expect(loadAdminAssistSettings()).toEqual({
      offlineEnabled: true,
      onlineEnabled: true,
      level: 7,
    })
  })

  it("allows an authorised administrator to opt into ordinary online matches", () => {
    expect(isAdminAssistMatchAllowed(false, false, false)).toBe(true)
    expect(isAdminAssistMatchAllowed(false, false, true)).toBe(true)
    expect(isAdminAssistMatchAllowed(true, false, false)).toBe(true)
    expect(isAdminAssistMatchAllowed(false, true, false)).toBe(true)
  })

  it("waits for a manual opening shot before takeover", () => {
    expect(hasManualOpeningShot(0)).toBe(false)
    expect(hasManualOpeningShot(Number.NaN)).toBe(false)
    expect(hasManualOpeningShot(1)).toBe(true)
  })

  it("makes the administrator-only level 11 shot exact", () => {
    expect(adminAssistErrorScale(10)).toBe(1)
    expect(adminAssistErrorScale(11)).toBe(0)
  })

  it("uses the shortest smooth rotation path across the angle wrap", () => {
    const delta = shortestAngleDelta(Math.PI - 0.1, -Math.PI + 0.1)
    expect(delta).toBeCloseTo(0.2)
  })

  it("keeps visible aim, fine-tune, thought and pull-back phases", () => {
    const timings = adminAimMotionTimings(Math.PI / 2, 11)
    expect(timings.orientMs).toBeGreaterThanOrEqual(900)
    expect(timings.orientMs).toBeLessThanOrEqual(2_000)
    expect(timings.fineTuneMs).toBeGreaterThanOrEqual(500)
    expect(timings.thinkMs).toBeGreaterThanOrEqual(750)
    expect(timings.pullBackMs).toBeGreaterThanOrEqual(600)
    expect(timings.strikeDelayMs).toBeGreaterThanOrEqual(180)
  })

  it("maps the Space hold cap to the same 100 percent ratio as the slider", () => {
    expect(powerRatioFromHeldMs(FULL_POWER_HOLD_MS)).toBe(1)
    expect(powerRatioFromHeldMs(FULL_POWER_HOLD_MS * 4)).toBe(1)
    expect(powerRatioFromHeldMs(FULL_POWER_HOLD_MS / 2)).toBe(0.5)
    expect(powerRatioFromHeldMs(-20)).toBe(0)
  })
})
