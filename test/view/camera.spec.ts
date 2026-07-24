import { expect } from "chai"
import { Camera, frameRateIndependentLerp } from "../../src/view/camera"
import { AimEvent } from "../../src/events/aimevent"

describe("Camera", () => {
  beforeEach(() => {
    globalThis.localStorage?.removeItem("billiards-camera-mode")
  })

  it("keeps damping equivalent across refresh rates", () => {
    const at30 = frameRateIndependentLerp(0.1, 1 / 30)
    const twoFramesAt60 = 1 - Math.pow(1 - 0.1, 2)
    expect(at30).to.be.closeTo(twoFramesAt60, 1e-12)
  })
  it("increments t in update", () => {
    const camera = new Camera(1)
    const aim = new AimEvent()
    camera.update(0.1, aim)
    expect((camera as any).t).to.be.closeTo(0.1, 0.001)
    camera.update(0.2, aim)
    expect((camera as any).t).to.be.closeTo(0.3, 0.001)
  })

  it("keeps the manually selected view across controller suggestions", () => {
    const camera = new Camera(1)

    expect(camera.mode).to.equal(camera.topView)
    camera.suggestMode(camera.aimView)
    expect(camera.mode).to.equal(camera.topView)

    camera.toggleMode()
    expect(camera.mode).to.equal(camera.aimView)
    camera.suggestMode(camera.topView)
    expect(camera.mode).to.equal(camera.aimView)
  })

  it("does not overwrite the selected view with a temporary forced view", () => {
    const camera = new Camera(1)

    camera.forceMode(camera.aimView)
    expect(camera.mode).to.equal(camera.aimView)

    camera.suggestMode(camera.aimView)
    expect(camera.mode).to.equal(camera.topView)
  })

  it("orbitView sets target correctly", () => {
    const camera = new Camera(1)
    const aim = new AimEvent()

    const t = (20 * Math.PI) / 2
    camera.update(t, aim)

    camera.orbitView(aim)

    const target = (camera as any).target
    expect(target.z).to.be.greaterThan(0)
  })

  it("stepBackToFitAllBalls steps back and restores original distance on toggleMode", () => {
    const camera = new Camera(1)
    camera.forceMode(camera.aimView)

    const { Vector3 } = require("three")
    const balls = [
      {
        onTable: () => true,
        pos: new Vector3(0, 0, 0),
      },
      {
        onTable: () => true,
        pos: new Vector3(1.0, 1.0, 0),
      },
    ]

    const aim = new AimEvent()
    aim.pos = new Vector3(0, 0, 0)
    aim.angle = 0

    const initialDistance = (camera as any).distance

    camera.stepBackToFitAllBalls(balls, aim)

    const steppedDistance = (camera as any).distance

    expect(steppedDistance).to.be.greaterThan(initialDistance)
    expect(camera.savedDistance).to.equal(initialDistance)

    camera.toggleMode()
    expect((camera as any).distance).to.equal(initialDistance)
    expect(camera.savedDistance).to.be.undefined
  })
})
