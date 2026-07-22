import { expect } from "chai"
import {
  applyPhysicsProfile,
  applyPhysicsProfileForRule,
  LEGACY_PHYSICS,
  physicsProfileForRule,
  POOL_STANDARD_PHYSICS,
} from "../../../src/model/physics/profile"
import {
  ballRestitution,
  m,
  maxPower,
  mu,
  muS,
  R,
} from "../../../src/model/physics/constants"
import { Rack } from "../../../src/utils/rack"

describe("PhysicsProfile", () => {
  afterEach(() => applyPhysicsProfile(LEGACY_PHYSICS))

  it("selects regulation pool dimensions for eight and nine ball", () => {
    expect(physicsProfileForRule("eightball")).to.equal(POOL_STANDARD_PHYSICS)
    expect(physicsProfileForRule("nineball")).to.equal(POOL_STANDARD_PHYSICS)
    expect(physicsProfileForRule("snooker")).to.equal(LEGACY_PHYSICS)
  })

  it("applies all core pool constants before geometry is built", () => {
    applyPhysicsProfileForRule("nineball")
    expect(R).to.be.closeTo(0.028575, 1e-12)
    expect(m).to.be.closeTo(0.170097, 1e-12)
    expect(mu).to.be.closeTo(Math.SQRT2 * 0.01, 1e-12)
    expect(muS).to.be.closeTo(0.2, 1e-12)
    expect(ballRestitution).to.be.closeTo(0.95, 1e-12)
    expect(maxPower).to.be.closeTo(8.5, 1e-12)
    expect(Rack.gap - 2 * R).to.be.lessThan(0.0002)
  })
})
