import {
  containsAdminDemoPreference,
  hasAdminDemoAssistCapability,
} from "../../server/admin-demo-assist"

describe("server-authoritative administrator demo capability", () => {
  it("does not infer capability from a mutable role", () => {
    expect(hasAdminDemoAssistCapability({ admin_demo_assist: 0 })).toBe(false)
    expect(hasAdminDemoAssistCapability({ admin_demo_assist: 1 })).toBe(true)
  })

  it("recognises only administrator demo preference inputs", () => {
    expect(
      containsAdminDemoPreference({
        quality: "high",
        reducedMotion: false,
      })
    ).toBe(false)
    expect(containsAdminDemoPreference({ adminDemoOnlineEnabled: false })).toBe(
      true
    )
    expect(containsAdminDemoPreference({ adminDemoLevel: 11 })).toBe(true)
  })
})
