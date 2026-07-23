import { Vector3 } from "three"
import { AimCalculator } from "../../../src/network/bot/aimcalculator"
import { Pocket } from "../../../src/model/physics/pocket"
import { offCenterLimit, R } from "../../../src/model/physics/constants"
import { Table } from "../../../src/model/table"
import { Ball } from "../../../src/model/ball"
import { BotShotContext } from "../../../src/network/bot/botstrategy"

describe("AimCalculator", () => {
  const calculator = new AimCalculator()

  describe("getAimPoint", () => {
    it("should return the ghost ball position for a simple straight shot", () => {
      const cuePos = new Vector3(0, 0, 0)
      const targetPos = new Vector3(2, 0, 0)
      const pocketPos = new Vector3(4, 0, 0)
      const pockets = [pocketPos]

      const aimPoint = calculator.getAimPoint(cuePos, targetPos, pockets)

      // Incident vector from pocket to target is (-1, 0, 0)
      // Ghost ball is at targetPos + incidentVector * 2 * ballRadius
      // Ghost ball = (2, 0, 0) + (-1, 0, 0) * 1 = (1, 0, 0)
      expect(aimPoint?.x).toBeCloseTo(2 - 2 * R)
      expect(aimPoint?.y).toBeCloseTo(0)
      expect(aimPoint?.z).toBeCloseTo(0)
    })

    it("should return an aim point even for very difficult cut shots (score > 0.8)", () => {
      const cuePos = new Vector3(0, 0, 0)
      const targetPos = new Vector3(2, 0, 0)
      // A pocket that requires a very sharp cut
      // shotLine = (1, 0, 0)
      // pocketLine = targetPos to pocket
      // If pocket is at (2, 2, 0), pocketLine is (0, 1, 0)
      // dot product is 0, score is 1.0 (which is > 0.8)
      const pocketPos = new Vector3(2, 2, 0)
      const pockets = [pocketPos]

      const aimPoint = calculator.getAimPoint(cuePos, targetPos, pockets)

      expect(aimPoint).toBeDefined()
      // Ghost ball should be at (2, -R*2, 0) because pocket is at (2, 2, 0)
      // Wait, incident vector from pocket (2, 2) to target (2, 0) is (0, -2) -> (0, -1) normalized
      // Ghost ball = targetPos + (0, -1) * 2 * R = (2, -2*R, 0)
      expect(aimPoint?.x).toBeCloseTo(2)
      expect(aimPoint?.y).toBeCloseTo(-2 * R)
    })
  })

  describe("generateShot", () => {
    it("should set spin to max top spin if cue intersects another ball", () => {
      const cueball = new Ball(new Vector3(0, 0, 0))
      const table = new Table([cueball])

      // Mock intersectsAnything to return true
      jest.spyOn(table.cue, "intersectsAnything").mockReturnValue(true)

      const targetPos = new Vector3(10, 0, 0)
      const hitEvent = calculator.generateShot(
        table,
        0,
        AimCalculator.DEFAULT_SHOT_POWER,
        targetPos
      ) as any

      const aimData = hitEvent.tablejson.aim
      expect(aimData.offset.y).toBe(offCenterLimit)
      expect(aimData.offset.x).toBe(0)
    })

    it("should not set spin to max top spin if cue does not intersect anything", () => {
      const cueball = new Ball(new Vector3(0, 0, 0))
      const table = new Table([cueball])

      // Mock intersectsAnything to return false
      jest.spyOn(table.cue, "intersectsAnything").mockReturnValue(false)

      const targetPos = new Vector3(10, 0, 0)
      const hitEvent = calculator.generateShot(
        table,
        0,
        AimCalculator.DEFAULT_SHOT_POWER,
        targetPos
      ) as any

      const aimData = hitEvent.tablejson.aim
      expect(aimData.offset.x).toBe(0)
      expect(aimData.offset.y).toBe(0)
    })
  })

  describe("1–11 level skill error", () => {
    function context(
      level: number,
      ruleName = "eightball",
      cuePos = new Vector3(-0.8, 0, 0),
      targetPos = new Vector3(0.1, 0, 0)
    ): { context: BotShotContext; target: Ball } {
      Ball.id = 0
      const cueBall = new Ball(cuePos)
      const target = new Ball(targetPos, 1)
      const table = new Table([cueBall, target])
      return {
        target,
        context: {
          table,
          cueBall,
          validTargetBalls: [target],
          ballInHand: false,
          ruleName,
          shotIndex: 3,
          level,
        },
      }
    }

    it("is exactly repeatable for the same table state", () => {
      const shot = context(6)
      const pocket = new Vector3(1.2, 0.1, 0)
      expect(calculator.skillError(shot.context, shot.target, pocket)).toEqual(
        calculator.skillError(shot.context, shot.target, pocket)
      )
    })

    it("makes every stronger level more accurate for the same shot", () => {
      const pocket = new Vector3(1.2, 0.7, 0)
      const errors = [1, 4, 6, 11].map((level) => {
        const shot = context(level)
        return Math.abs(
          calculator.skillError(shot.context, shot.target, pocket).angle
        )
      })
      expect(errors[0]).toBeGreaterThan(errors[1])
      expect(errors[1]).toBeGreaterThan(errors[2])
      expect(errors[2]).toBeGreaterThan(errors[3])
      expect(errors[3]).toBeGreaterThan(0)
    })

    it("rates long thin shots as harder than short straight shots", () => {
      const easy = context(
        6,
        "eightball",
        new Vector3(-0.2, 0, 0),
        new Vector3(0, 0, 0)
      )
      const hard = context(
        6,
        "eightball",
        new Vector3(-1.2, -0.5, 0),
        new Vector3(0.5, 0.4, 0)
      )
      const easyResult = calculator.skillError(
        easy.context,
        easy.target,
        new Vector3(1, 0, 0)
      )
      const hardResult = calculator.skillError(
        hard.context,
        hard.target,
        new Vector3(0.5, 1.2, 0)
      )
      expect(hardResult.difficulty).toBeGreaterThan(easyResult.difficulty)
    })

    it("applies the extra four-ball difficulty without making level 11 perfect", () => {
      const pool = context(11, "eightball")
      const fourBall = context(11, "fourball")
      const pocket = new Vector3(1.2, 0.6, 0)
      const poolResult = calculator.skillError(
        pool.context,
        pool.target,
        pocket
      )
      const fourBallResult = calculator.skillError(
        fourBall.context,
        fourBall.target,
        pocket
      )
      expect(fourBallResult.difficulty).toBeGreaterThan(poolResult.difficulty)
      expect(fourBallResult.angle).not.toBe(0)
    })
  })

  describe("checkCollision", () => {
    // Ball moving in +x direction from origin
    const pos = new Vector3(0, 0, 0)
    const vel = new Vector3(1, 0, 0)

    it("returns true when target is directly in path", () => {
      const target = new Vector3(5, 0, 0)
      expect(AimCalculator.checkCollision(pos, vel, target)).toBe(true)
    })

    it("returns true when target is within combined radii laterally", () => {
      // Perpendicular offset just inside 2R
      const target = new Vector3(5, 2 * R * 0.99, 0)
      expect(AimCalculator.checkCollision(pos, vel, target)).toBe(true)
    })

    it("returns false when target is outside combined radii laterally", () => {
      const target = new Vector3(5, 2 * R * 1.01, 0)
      expect(AimCalculator.checkCollision(pos, vel, target)).toBe(false)
    })

    it("returns false when target is behind the moving ball", () => {
      const target = new Vector3(-5, 0, 0)
      expect(AimCalculator.checkCollision(pos, vel, target)).toBe(false)
    })
  })

  describe("extractPocketPositions", () => {
    it("should extract positions from a list of Pocket objects", () => {
      const p1 = new Pocket(new Vector3(1, 2, 3), 1)
      const p2 = new Pocket(new Vector3(4, 5, 6), 1)
      const pockets = [p1, p2]

      const positions = calculator.extractPocketPositions(pockets)

      expect(positions).toHaveLength(2)
      expect(positions[0].distanceToSquared(p1.pos)).toBeLessThan(1)
      expect(positions[1].distanceToSquared(p2.pos)).toBeLessThan(1)
    })
  })
})
