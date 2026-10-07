import { demoSession } from "../../src/platform/api"
import {
  registerGameDebugTools,
  setGameDebugSource,
} from "../../src/platform/webmcp"

describe("game WebMCP diagnostics", () => {
  afterEach(() => {
    Reflect.deleteProperty(document, "modelContext")
  })

  it("skips registration when the browser does not expose WebMCP", () => {
    expect(() => registerGameDebugTools(demoSession())()).not.toThrow()
  })

  it("registers only read-only tools and removes sensitive fields", async () => {
    const registered: Array<{
      name: string
      annotations: { readOnlyHint: boolean; idempotentHint: boolean }
      execute: () => Promise<unknown>
    }> = []
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: {
        registerTool: (item: (typeof registered)[number]) => {
          registered.push(item)
        },
      },
    })
    const clearSource = setGameDebugSource({
      getPhysicsState: () => ({
        userId: "12345678-1234-1234-1234-123456789012",
        email: "private@example.test",
        balls: [{ id: 0, velocity: [0.1, 0, 0] }],
      }),
    })

    const dispose = registerGameDebugTools(demoSession())

    expect(registered).toHaveLength(7)
    expect(
      registered.every(
        (item) =>
          item.annotations.readOnlyHint && item.annotations.idempotentHint
      )
    ).toBe(true)
    const physics = registered.find(
      (item) => item.name === "game_get_physics_state"
    )!
    await expect(physics.execute()).resolves.toEqual({
      userId: "12345678…",
      balls: [{ id: 0, velocity: [0.1, 0, 0] }],
    })

    dispose()
    clearSource()
  })
})
