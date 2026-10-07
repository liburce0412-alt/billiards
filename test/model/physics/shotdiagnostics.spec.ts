import { Vector3 } from "three"
import { Ball, State } from "../../../src/model/ball"
import { ShotPhysicsDiagnostics } from "../../../src/model/physics/shotdiagnostics"
import { Table } from "../../../src/model/table"
import { ShotStartUtils } from "../../../src/utils/shotstart"

describe("ShotPhysicsDiagnostics", () => {
  beforeEach(() => {
    Ball.id = 0
  })

  it("captures bounded non-sensitive per-ball physics and the shot repro", () => {
    const ball = new Ball(new Vector3(0.1, -0.2, 0), 0xffffff, 3)
    const table = new Table([ball])
    table.shotStartConditions = ShotStartUtils.capture(table, {
      baseUrl: "https://secret.example/play?token=private",
      angle: 0.4,
      power: 2,
    })
    ball.vel.set(0.5, 0, 0)
    ball.rvel.set(0, 2, 1)
    ball.state = State.Sliding
    const diagnostics = new ShotPhysicsDiagnostics()

    diagnostics.start(table, 123)
    const state = diagnostics.state(table)
    const report = diagnostics.lastShot()!

    expect(state.balls[0]).toMatchObject({
      id: ball.id,
      label: 3,
      state: State.Sliding,
      position: [0.1, -0.2, 0],
      velocity: [0.5, 0, 0],
    })
    expect(state.balls[0].slipSpeed).toBeGreaterThan(0)
    expect(state.totalKineticEnergy).toBeGreaterThan(0)
    expect(report.startedAt).toBe(123)
    expect(report.recreateUrl).toContain("initShot=")
    expect(report.start).not.toHaveProperty("baseUrl")
    expect(JSON.stringify(report)).not.toContain("token=private")
  })

  it("flags non-finite motion before it can propagate", () => {
    const ball = new Ball(new Vector3())
    const table = new Table([ball])
    const diagnostics = new ShotPhysicsDiagnostics()
    diagnostics.start(table)
    ball.vel.x = Number.NaN

    expect(diagnostics.inspect(table)?.kind).toBe("non-finite")
    expect(diagnostics.lastShot()?.anomalies[0].kind).toBe("non-finite")
  })

  it("records an unexplained kinetic-energy increase", () => {
    const ball = new Ball(new Vector3())
    const table = new Table([ball])
    ball.vel.x = 0.1
    ball.state = State.Sliding
    const diagnostics = new ShotPhysicsDiagnostics()
    diagnostics.start(table)
    ball.vel.x = 1

    expect(diagnostics.inspect(table)?.kind).toBe("energy-increase")
    diagnostics.finish(table)
    expect(diagnostics.lastShot()?.active).toBe(false)
  })
})
