import { Vector3 } from "three"
import { Ball } from "../../src/model/ball"
import { maxPower, R } from "../../src/model/physics/constants"
import { Cue } from "../../src/view/cue"

describe("Continuous cue stroke", () => {
  it("keeps the settled cue still before starting a single backswing", () => {
    const cue = new Cue()
    cue.aim.power = maxPower
    cue.update(0)
    const rest = cue.cueBody.position.clone()
    cue.update(1)
    expect(cue.cueBody.position.distanceTo(rest)).toBeLessThan(1e-9)
    cue.preStrokeProgress = 0
    cue.update(0)
    expect(cue.cueBody.position.distanceTo(rest)).toBeLessThan(1e-9)
  })

  it.each([30, 60, 120])(
    "continues forward through contact without a sideways flick and holds at %i fps",
    (fps) => {
      const cue = new Cue()
      const ball = new Ball(new Vector3())
      cue.aim.power = maxPower
      cue.aim.offset.set(0.2, 0.3, 0)
      let previousX = -Infinity
      // The forward portion of the backswing must reach contact monotonically.
      for (let i = 0; i <= fps; i++) {
        cue.preStrokeProgress = 0.72 + (0.28 * i) / fps
        cue.update(0)
        expect(cue.cueBody.position.x).toBeGreaterThanOrEqual(previousX - 1e-9)
        previousX = cue.cueBody.position.x
      }
      const contact = cue.cueBody.position.clone()
      cue.preStrokeProgress = undefined
      cue.hit(ball)
      cue.update(0)
      expect(cue.cueBody.position.distanceTo(contact)).toBeLessThan(1e-9)
      let heldX = 0
      for (let i = 1; i <= fps; i++) {
        cue.update(1 / fps)
        const position = cue.cueBody.position
        expect(position.x).toBeGreaterThanOrEqual(previousX - 1e-9)
        expect(position.x - previousX).toBeLessThan(R)
        expect(position.y).toBeCloseTo(contact.y, 9)
        expect(position.z).toBeCloseTo(contact.z, 9)
        if (i / fps < 0.3) heldX = position.x
        else expect(position.x).toBeCloseTo(heldX, 9)
        previousX = position.x
      }
      expect(previousX).toBeGreaterThan(contact.x)
      expect(ball.vel.length()).toBeGreaterThan(0)
      expect(cue.hittingAnimation).toBe(false)
      cue.aimMode()
      cue.update(0)
      expect(cue.cueBody.position.distanceTo(contact)).toBeLessThan(1e-9)
    }
  )
})
