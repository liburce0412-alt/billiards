import { expect } from "chai"
import { Vector3 } from "three"
import { Ball } from "../../../src/model/ball"
import { Collision } from "../../../src/model/physics/collision"
import {
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
import { g, R } from "../../../src/model/physics/constants"

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
})
