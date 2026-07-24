import { Vector3 } from "three"
import { Ball, State } from "../ball"
import { CollisionThrow } from "./collisionthrow"
import { R } from "./constants"

export class Collision {
  private static readonly separation = new Vector3()
  private static readonly relativeVelocity = new Vector3()

  static willCollide(a: Ball, b: Ball, t: number): boolean {
    if (!(a.inMotion() || b.inMotion()) || !a.onTable() || !b.onTable()) {
      return false
    }

    const futureDistanceSq = a
      .futurePosition(t)
      .distanceToSquared(b.futurePosition(t))
    if (futureDistanceSq >= 4 * R * R) return false

    // A collision response does not move the balls to their contact points.
    // They can therefore remain microscopically overlapped until this fixed
    // step advances. Only resolve the pair while it is approaching; otherwise
    // the same pair can be "collided" repeatedly until Table.advance() hits
    // its depth guard and kills the browser animation callback.
    const separation = this.separation.subVectors(b.pos, a.pos)
    const relativeVelocity = this.relativeVelocity.subVectors(b.vel, a.vel)
    return separation.dot(relativeVelocity) < 0
  }

  static collide(a: Ball, b: Ball) {
    return Collision.updateVelocities(a, b)
  }

  static readonly p = new Vector3()
  static readonly v = new Vector3()
  static readonly contactA = new Vector3()
  static readonly contactB = new Vector3()

  static positionsAtContact(a: Ball, b: Ball) {
    this.p.subVectors(a.pos, b.pos)
    this.v.subVectors(a.vel, b.vel)

    const rSum = 2 * R
    const aCoeff = this.v.lengthSq()

    if (aCoeff === 0) {
      return {
        a: this.contactA.copy(a.pos),
        b: this.contactB.copy(b.pos),
      }
    }

    const bCoeff = 2 * this.p.dot(this.v)
    const cCoeff = this.p.lengthSq() - rSum * rSum

    const discriminant = bCoeff * bCoeff - 4 * aCoeff * cCoeff

    const t =
      discriminant < 0 ? 0 : (-bCoeff - Math.sqrt(discriminant)) / (2 * aCoeff)

    return {
      a: this.contactA.copy(a.pos).addScaledVector(a.vel, t),
      b: this.contactB.copy(b.pos).addScaledVector(b.vel, t),
    }
  }

  static readonly model = new CollisionThrow()

  private static updateVelocities(a: Ball, b: Ball) {
    const impactSpeed = Collision.model.updateVelocities(a, b)
    a.state = State.Sliding
    b.state = State.Sliding
    return impactSpeed
  }
}
