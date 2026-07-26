import {
  MotionWatchdog,
  RuntimeDiagnostics,
} from "../../src/utils/runtimediagnostics"

describe("Runtime diagnostics", () => {
  it("keeps bounded local frame diagnostics", () => {
    const diagnostics = new RuntimeDiagnostics()
    diagnostics.recordFrame(0)
    diagnostics.recordFrame(16)
    diagnostics.recordFrame(32)
    diagnostics.recordPhysicsRecovery()
    diagnostics.recordContextLoss()

    expect(diagnostics.snapshot()).toMatchObject({
      averageFps: 63,
      worstFrameMs: 16,
      physicsRecoveries: 1,
      contextLosses: 1,
    })
  })

  it("trips only after continuous motion exceeds the limit", () => {
    const watchdog = new MotionWatchdog(100)
    expect(watchdog.update(true, 0)).toBe(false)
    expect(watchdog.update(true, 99)).toBe(false)
    expect(watchdog.update(true, 100)).toBe(true)
    expect(watchdog.update(false, 101)).toBe(false)
    expect(watchdog.update(true, 150)).toBe(false)
  })
})
