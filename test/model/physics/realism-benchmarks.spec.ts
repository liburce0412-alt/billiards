import { expect } from "chai"
import { Vector3 } from "three"
import { Ball, State } from "../../../src/model/ball"
import { Collision } from "../../../src/model/physics/collision"
import {
  cueStrike,
  cueToSpin,
  mathavanAdapter,
  rollingFull,
  sliding,
} from "../../../src/model/physics/physics"
import {
  applyPhysicsProfile,
  LEGACY_PHYSICS,
  POOL_STANDARD_PHYSICS,
} from "../../../src/model/physics/profile"
import { g, maxPower, R } from "../../../src/model/physics/constants"
import { Table } from "../../../src/model/table"
import { Rack } from "../../../src/utils/rack"
import { TableConfig } from "../../../src/view/tableconfig"

describe("Pool-standard realism benchmarks", () => {
  beforeEach(() => applyPhysicsProfile(POOL_STANDARD_PHYSICS))
  afterEach(() => applyPhysicsProfile(LEGACY_PHYSICS))

  it("matches 0.01 g rolling deceleration", () => {
    const v = new Vector3(1, 0, 0)
    const w = new Vector3(0, 1 / R, 0)
    expect(Math.abs(rollingFull(w, v, 1).v.x)).to.be.closeTo(0.01 * g, 0.001)
  })

  it("matches 0.2 g sliding deceleration", () => {
    const delta = sliding(new Vector3(1, 0, 0), new Vector3())
    expect(delta.v.length()).to.be.closeTo(0.2 * g, 0.001)
  })

  it("produces natural roll from a two-fifths-height cue strike", () => {
    const velocity = new Vector3(1, 0, 0)
    const spin = cueToSpin(new Vector3(0, 2 / 5, 0), velocity)
    expect(spin.length()).to.be.closeTo(velocity.length() / R, 0.001)
  })

  it("resolves a head-on ball collision without adding energy", () => {
    const a = new Ball(new Vector3(-R, 0, 0))
    const b = new Ball(new Vector3(R, 0, 0))
    a.vel.set(1, 0, 0)
    const energyBefore = a.vel.lengthSq() + b.vel.lengthSq()
    Collision.collide(a, b)
    const energyAfter = a.vel.lengthSq() + b.vel.lengthSq()
    expect(energyAfter).to.be.at.most(energyBefore)
    expect(b.vel.x - a.vel.x).to.be.closeTo(0.95, 0.001)
  })

  it("keeps a direct cushion rebound bounded by incident speed", () => {
    const velocity = new Vector3(1, 0, 0)
    const spin = new Vector3()
    const delta = mathavanAdapter(velocity, spin)
    const rebound = velocity.clone().add(delta.v)
    expect(rebound.x).to.be.lessThan(0)
    expect(rebound.length()).to.be.at.most(velocity.length())
  })

  it("transfers a full-power break through a tightly packed rack", () => {
    TableConfig.apply("eightball")
    Ball.id = 0
    const table = new Table(Rack.eightBall())
    const initialPositions = table.balls.map((ball) => ball.pos.clone())
    table.cueball.vel.set(maxPower, 0, 0)
    table.cueball.state = State.Sliding

    for (let step = 0; step < 512; step++) {
      table.advance(1 / 512)
    }

    const displacedObjectBalls = table.balls
      .slice(1)
      .filter(
        (ball, index) => ball.pos.distanceTo(initialPositions[index + 1]) > R
      )
    expect(displacedObjectBalls.length).to.be.at.least(8)
  })

  it("settles repeated high-energy breaks without non-finite ball states", () => {
    TableConfig.apply("eightball")
    let seed = 0x8b411a
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0
      return seed / 0x100000000
    }

    for (let shot = 0; shot < 6; shot++) {
      Ball.id = 0
      const table = new Table(Rack.eightBall())
      const strike = cueStrike(
        (random() - 0.5) * 0.18,
        maxPower * (0.72 + random() * 0.28),
        new Vector3((random() - 0.5) * 0.45, (random() - 0.5) * 0.45, 0),
        random() * 0.08
      )
      table.cueball.vel.copy(strike.vel)
      table.cueball.rvel.copy(strike.rvel)
      table.cueball.state = State.Sliding

      let step = 0
      const maxSteps = 35 * 512
      while (!table.allStationary() && step++ < maxSteps) {
        table.advance(1 / 512)
        if (step % 32 === 0) {
          for (const ball of table.balls) {
            expect(
              [
                ball.pos.x,
                ball.pos.y,
                ball.pos.z,
                ball.vel.x,
                ball.vel.y,
                ball.vel.z,
                ball.rvel.x,
                ball.rvel.y,
                ball.rvel.z,
              ].every(Number.isFinite)
            ).to.be.true
          }
        }
      }

      expect(table.allStationary()).to.be.true
    }
  })
})
