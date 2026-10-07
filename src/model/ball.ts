import { Vector3 } from "three"
import { zero, vec, passesThroughZero } from "../utils/three-utils"
import {
  forceRoll,
  rollingFull,
  sliding,
  surfaceVelocityFull,
} from "../model/physics/physics"
import { BallMesh } from "../view/ballmesh"
import { Pocket } from "./physics/pocket"
import { BallAppearance } from "../view/ballappearance"
import { R } from "./physics/constants"

export enum State {
  Stationary = "Stationary",
  Rolling = "Rolling",
  Sliding = "Sliding",
  Falling = "Falling",
  InPocket = "InPocket",
}

export class Ball {
  readonly pos: Vector3
  readonly vel: Vector3 = zero.clone()
  readonly rvel: Vector3 = zero.clone()
  readonly futurePos: Vector3 = zero.clone()
  readonly ballmesh!: BallMesh
  state: State = State.Stationary
  pocket: Pocket

  public static id = 0
  readonly id = Ball.id++
  readonly label: number | undefined
  readonly appearance: BallAppearance | undefined

  static readonly transition = 0.05
  static readonly sleepSurfaceSpeed = 0.0015
  private static readonly slipBefore = new Vector3()
  private static readonly slipAfter = new Vector3()
  private static readonly slipNextVelocity = new Vector3()
  private static readonly slipNextRotation = new Vector3()
  private static readonly planarVelocity = new Vector3()
  private static readonly planarVelocityDelta = new Vector3()
  private static readonly planarRotation = new Vector3()
  private static readonly planarRotationDelta = new Vector3()

  constructor(pos, color?, label?: number, appearance?: BallAppearance) {
    this.pos = pos.clone()
    this.label = label
    this.appearance = appearance
    if (typeof document !== "undefined") {
      this.ballmesh = new BallMesh(
        color || 0xeeeeee * Math.random(),
        label,
        appearance
      )
    }
  }

  readonly velBefore: Vector3 = new Vector3()

  update(t) {
    if (this.state == State.Falling) {
      this.updatePosition(t)
      this.pocket?.updateFall(this, t)
    } else if (this.state == State.Rolling) {
      // A rolling ball can apply the trapezium rule
      // since it is guaranteed to be decelerating
      // this allows 'futurePos' which uses just current vel
      // to be a safe upper bound on actual position
      this.velBefore.copy(this.vel)
      this.updateVelocity(t)
      this.pos.addScaledVector(this.velBefore, t / 2)
      this.pos.addScaledVector(this.vel, t / 2)
    } else {
      // sliding ball more conservative less accurate
      this.updatePosition(t)
      this.updateVelocity(t)
    }
  }

  updateMesh(t) {
    this.ballmesh?.updateAll(this, t)
  }

  private updatePosition(t: number) {
    this.pos.addScaledVector(this.vel, t)
  }

  private updateVelocity(t: number) {
    if (this.inMotion()) {
      if (this.isRolling()) {
        this.state = State.Rolling
        forceRoll(this.vel, this.rvel)
        this.addDelta(t, rollingFull(this.rvel, this.vel, t))
      } else {
        this.state = State.Sliding
        this.addDelta(t, sliding(this.vel, this.rvel))
      }
      if (this.hasOnlyImperceptibleMotion()) this.setStationary()
    }
  }

  private hasOnlyImperceptibleMotion(): boolean {
    const thresholdSq = Ball.sleepSurfaceSpeed * Ball.sleepSurfaceSpeed
    const planarSpinSurfaceSpeedSq =
      (this.rvel.x * this.rvel.x + this.rvel.y * this.rvel.y) * R * R
    const sideSpinSurfaceSpeedSq = this.rvel.z * this.rvel.z * R * R
    return (
      this.vel.lengthSq() <= thresholdSq &&
      planarSpinSurfaceSpeedSq <= thresholdSq &&
      sideSpinSurfaceSpeedSq <= thresholdSq
    )
  }

  private addDelta(t: number, delta: { v: Vector3; w: Vector3 }) {
    // 1. Mutate by t upfront for the check, matching your existing structure
    delta.v.multiplyScalar(t)
    delta.w.multiplyScalar(t)

    // 2. Separate logic: Let passesZero handle the check, and handle the state mutation cleanly
    if (this.settleExhaustedRollingMotion(delta)) {
      // Linear rolling and vertical side-spin do not have to stop together.
      // Clamp the exhausted planar component instead of letting it reverse
      // while the ball continues spinning in place.
    } else if (this.passesZero(delta)) {
      this.setStationary()
    } else if (
      this.state === State.Sliding &&
      t <= 1 / 128 &&
      this.transitionSlipToRolling(delta)
    ) {
      // The friction step crossed zero surface slip. Apply only the fraction
      // up to that instant so a tiny reverse slide cannot be introduced.
    } else {
      this.vel.add(delta.v)
      this.rvel.add(delta.w)
    }
  }

  private settleExhaustedRollingMotion(delta: {
    v: Vector3
    w: Vector3
  }): boolean {
    if (this.state !== State.Rolling) return false

    const planarVelocity = Ball.planarVelocity.copy(this.vel).setZ(0)
    const planarVelocityDelta = Ball.planarVelocityDelta.copy(delta.v).setZ(0)
    const planarRotation = Ball.planarRotation.copy(this.rvel).setZ(0)
    const planarRotationDelta = Ball.planarRotationDelta.copy(delta.w).setZ(0)
    const velocityStops =
      planarVelocity.lengthSq() > 0 &&
      passesThroughZero(planarVelocity, planarVelocityDelta)
    const rotationStops =
      planarRotation.lengthSq() > 0 &&
      passesThroughZero(planarRotation, planarRotationDelta)
    if (!velocityStops && !rotationStops) return false

    this.vel.set(0, 0, 0)
    this.rvel.setX(0).setY(0)
    const nextSideSpin = this.rvel.z + delta.w.z
    this.rvel.z =
      this.rvel.z === 0 || this.rvel.z * nextSideSpin <= 0 ? 0 : nextSideSpin
    this.state = State.Rolling
    if (Math.abs(this.rvel.z) * R <= Ball.sleepSurfaceSpeed) {
      this.setStationary()
    }
    return true
  }

  private transitionSlipToRolling(delta: { v: Vector3; w: Vector3 }): boolean {
    const before = Ball.slipBefore
      .copy(surfaceVelocityFull(this.vel, this.rvel))
      .setZ(0)
    const nextVelocity = Ball.slipNextVelocity.copy(this.vel).add(delta.v)
    const nextRotation = Ball.slipNextRotation.copy(this.rvel).add(delta.w)
    const after = Ball.slipAfter
      .copy(surfaceVelocityFull(nextVelocity, nextRotation))
      .setZ(0)

    if (before.lengthSq() !== 0 && before.dot(after) > 0) return false

    const denominator = before.lengthSq() - before.dot(after)
    const fraction = denominator > 0 ? before.lengthSq() / denominator : 0
    this.vel.addScaledVector(delta.v, Math.max(0, Math.min(1, fraction)))
    this.rvel.addScaledVector(delta.w, Math.max(0, Math.min(1, fraction)))
    forceRoll(this.vel, this.rvel)
    this.state = State.Rolling
    return true
  }

  private passesZero(delta: { v: Vector3; w: Vector3 }): boolean {
    // In Sliding state: Both linear and angular friction must overcome momentum to halt.
    // In Rolling state: Breaking traction on either side forces a transition or a halt.
    const vz = passesThroughZero(this.vel, delta.v)
    const wz = passesThroughZero(this.rvel, delta.w)
    const halts = this.state === State.Rolling ? vz || wz : vz && wz

    if (!halts) return false

    // Catch vertical spin (Z-axis) overshoot dynamically.
    // If the step size is larger than remaining angular velocity, it has spent its energy.
    return Math.abs(this.rvel.z) <= Math.abs(delta.w.z)
  }

  setStationary() {
    this.vel.copy(zero)
    this.rvel.copy(zero)
    this.state = State.Stationary
  }

  isRolling() {
    return (
      this.rvel.lengthSq() !== 0 &&
      surfaceVelocityFull(this.vel, this.rvel).length() < Ball.transition
    )
  }

  onTable() {
    return this.state !== State.Falling && this.state !== State.InPocket
  }

  inMotion() {
    return (
      this.state === State.Rolling ||
      this.state === State.Sliding ||
      this.isFalling()
    )
  }

  isFalling() {
    return this.state === State.Falling
  }

  futurePosition(t) {
    this.futurePos.copy(this.pos).addScaledVector(this.vel, t)
    return this.futurePos
  }

  fround() {
    this.pos.x = Math.fround(this.pos.x)
    this.pos.y = Math.fround(this.pos.y)
    this.vel.x = Math.fround(this.vel.x)
    this.vel.y = Math.fround(this.vel.y)
    this.rvel.x = Math.fround(this.rvel.x)
    this.rvel.y = Math.fround(this.rvel.y)
    this.rvel.z = Math.fround(this.rvel.z)
  }

  serialise() {
    return {
      pos: this.pos.clone(),
      id: this.id,
    }
  }

  static fromSerialised(data) {
    return Ball.updateFromSerialised(new Ball(vec(data.pos)), data)
  }

  static updateFromSerialised(b, data) {
    b.pos.copy(data.pos)
    b.vel.copy(data?.vel ?? zero)
    b.rvel.copy(data?.rvel ?? zero)
    return b
  }
}
