import { expect } from "chai"
import { Camera, frameRateIndependentLerp } from "../../src/view/camera"
import { AimEvent } from "../../src/events/aimevent"
import { R } from "../../src/model/physics/constants"
import { Vector3 } from "three"

describe("Camera", () => {
  beforeEach(() => {
    globalThis.localStorage?.removeItem("billiards-camera-mode")
  })
  it("watches an opponent from above and restores the player's chosen shot view", () => {
    const camera = new Camera(2)
    const aim = new AimEvent()
    const frame = {
      eye: new Vector3(-1, 0, 0.2),
      position: new Vector3(-1.6, 0, -0.61),
      walking: false,
    }
    camera.toggleMode()
    camera.setOpponentView(true)
    for (let i = 0; i < 120; i++) camera.update(1 / 60, aim, aim.pos, frame)
    const overview = camera.camera.position.clone()
    camera.beginShot()
    frame.eye.set(1, 1, 0.96)
    frame.walking = true
    for (let i = 0; i < 120; i++) camera.update(1 / 60, aim, aim.pos, frame)
    expect(camera.camera.position.distanceTo(overview)).to.be.lessThan(0.001)
    expect((camera as any).shotView).to.be.undefined
    camera.setOpponentView(false)
    frame.walking = false
    camera.beginAimTurn(true)
    for (let i = 0; i < 180; i++) camera.update(1 / 60, aim, aim.pos, frame)
    expect(camera.mode).to.equal(camera.aimView)
    expect(camera.camera.position.distanceTo(frame.eye)).to.be.lessThan(0.001)
  })
  it("single-finger pitch leaves top view and follows vertical movement without changing cue aim", () => {
    const camera = new Camera(2)
    const aim = new AimEvent()
    const angle = aim.angle
    camera.adjustTouchPitch(20)
    camera.update(1 / 60, aim)
    const height = camera.camera.position.z
    expect(camera.mode).to.equal(camera.aimView)
    camera.adjustTouchPitch(20)
    camera.update(1 / 60, aim)
    expect(camera.camera.position.z).to.be.lessThan(height)
    expect(aim.angle).to.equal(angle)
    camera.adjustTouchPitch(10000)
    camera.update(1 / 60, aim)
    expect(camera.camera.position.z).to.equal(R * 6)
  })

  it("keeps damping equivalent across refresh rates", () => {
    const at30 = frameRateIndependentLerp(0.1, 1 / 30)
    const twoFramesAt60 = 1 - Math.pow(1 - 0.1, 2)
    expect(at30).to.be.closeTo(twoFramesAt60, 1e-12)
  })

  it("returns touch free inspection to the cue ball on each new aim while retaining 2D selection", () => {
    const camera = new Camera(2)
    camera.orbitByPixels(100, -50)
    camera.beginAimTurn(true)
    expect(camera.mode).to.equal(camera.aimView)
    expect((camera as any).height).to.equal(Camera.defaultHeight)
    expect((camera as any).distance).to.equal(Camera.defaultDistance)
    camera.toggleMode()
    camera.beginAimTurn(true)
    expect(camera.mode).to.equal(camera.topView)
    camera.orbitByPixels(30, 10)
    camera.beginAimTurn(false)
    expect(camera.mode).to.equal(camera.freeView)
  })

  it("tracks a moving cue ball without modifying the recorded strike position", () => {
    const camera = new Camera(2)
    const aim = new AimEvent()
    aim.pos.set(-1, 0, R)
    const original = aim.pos.clone()
    camera.toggleMode()
    const ballPosition = new Vector3(1, 0.5, R)
    for (let i = 0; i < 120; i++) camera.update(1 / 60, aim, ballPosition)
    const expected = ballPosition
      .clone()
      .add(new Vector3(-Camera.defaultDistance, 0, 0))
    expect(camera.camera.position.x).to.be.closeTo(expected.x, 0.001)
    expect(camera.camera.position.y).to.be.closeTo(expected.y, 0.001)
    expect(aim.pos.equals(original)).to.be.true
  })
  it("increments t in update", () => {
    const camera = new Camera(1)
    const aim = new AimEvent()
    camera.update(0.1, aim)
    expect((camera as any).t).to.be.closeTo(0.1, 0.001)
    camera.update(0.2, aim)
    expect((camera as any).t).to.be.closeTo(0.3, 0.001)
  })

  it("holds the exact strike pose before rising at a fixed observation point", () => {
    const camera = new Camera(2)
    const aim = new AimEvent()
    camera.toggleMode()
    camera.aimView(aim, 1)
    const position = camera.camera.position.clone()
    const rotation = camera.camera.quaternion.clone()
    const ball = new Vector3(2, 1, R)
    camera.beginShot()
    camera.suggestMode(camera.topView)
    camera.update(1, aim, ball)
    expect(camera.camera.position.equals(position)).to.be.true
    expect(camera.camera.quaternion.equals(rotation)).to.be.true
    camera.update(0.55, aim, ball)
    expect(camera.camera.position.z).to.be.closeTo(position.z + R * 7.5, 1e-9)
    expect(camera.camera.position.x).to.equal(position.x)
    expect(camera.camera.position.y).to.equal(position.y)
    camera.update(1, aim, ball)
    const standing = camera.camera.position.clone()
    expect(standing.z).to.be.closeTo(position.z + R * 15, 1e-9)
    ball.set(-2, -1, -1)
    camera.update(5, aim, ball)
    expect(camera.camera.position.equals(standing)).to.be.true
    expect(aim.pos.equals(new AimEvent().pos)).to.be.true
  })

  it("stands up consistently at 30 and 120 fps", () => {
    const positions = [30, 120].map((fps) => {
      globalThis.localStorage.removeItem("billiards-camera-mode")
      const camera = new Camera(2)
      const aim = new AimEvent()
      camera.toggleMode()
      camera.aimView(aim, 1)
      camera.beginShot()
      for (let i = 0; i < fps * 1.5; i++) camera.update(1 / fps, aim)
      return camera.camera.position.clone()
    })
    expect(positions[0].distanceTo(positions[1])).to.be.lessThan(1e-10)
  })

  it("returns smoothly to the next cue position and holds again on the next shot", () => {
    const camera = new Camera(2)
    const aim = new AimEvent()
    camera.toggleMode()
    camera.aimView(aim, 1)
    camera.beginShot()
    camera.update(2, aim)
    const height = camera.camera.position.z
    const ball = new Vector3(1, 0.5, R)
    camera.beginAimTurn(true)
    camera.update(1 / 60, aim, ball)
    expect(camera.camera.position.z).to.be.within(Camera.defaultHeight, height)
    expect(camera.camera.position.z).to.be.greaterThan(Camera.defaultHeight)
    for (let i = 0; i < 180; i++) camera.update(1 / 60, aim, ball)
    expect(camera.camera.position.x).to.be.closeTo(
      ball.x - Camera.defaultDistance,
      0.001
    )
    expect(camera.camera.position.z).to.equal(Camera.defaultHeight)
    camera.beginShot()
    const position = camera.camera.position.clone()
    camera.update(0.8, aim, new Vector3(-1, -1, R))
    expect(camera.camera.position.equals(position)).to.be.true
  })

  it("lets touch orbit and mode selection interrupt the shot hold immediately", () => {
    const camera = new Camera(2)
    const aim = new AimEvent()
    camera.toggleMode()
    camera.aimView(aim, 1)
    camera.beginShot()
    const position = camera.camera.position.clone()
    camera.adjustTouchPitch(20)
    camera.update(0.1, aim)
    expect(camera.mode).to.equal(camera.freeView)
    expect(camera.camera.position.distanceTo(position)).to.be.greaterThan(0.01)
    camera.beginAimTurn(true)
    camera.beginShot()
    camera.toggleMode()
    camera.update(0.1, aim)
    expect(camera.mode).to.equal(camera.topView)
    expect((camera as any).shotView).to.be.undefined
  })

  it("keeps 2D and freely positioned cameras unchanged when a shot starts", () => {
    const camera = new Camera(2)
    const aim = new AimEvent()
    camera.update(1, aim)
    camera.beginShot()
    expect(camera.mode).to.equal(camera.topView)
    expect((camera as any).shotView).to.be.undefined
    camera.orbitByPixels(20, 10)
    camera.update(1, aim)
    const position = camera.camera.position.clone()
    camera.beginShot()
    camera.update(2, aim, new Vector3(1, 1, R))
    expect(camera.mode).to.equal(camera.freeView)
    expect(camera.camera.position.equals(position)).to.be.true
  })

  it("uses the robot eyes to stand up and a wider camera only while walking", () => {
    const camera = new Camera(16 / 9)
    camera.toggleMode()
    const aim = new AimEvent()
    const frame = {
      eye: new Vector3(-1, 0, 0.2),
      position: new Vector3(-1.6, 0, -0.61),
      walking: false,
    }
    for (let i = 0; i < 180; i++) camera.update(1 / 60, aim, undefined, frame)
    expect(camera.camera.position.distanceTo(frame.eye)).to.be.lessThan(0.001)
    camera.beginShot()
    const held = camera.camera.position.clone()
    frame.eye.set(-1.5, 0, 0.96)
    camera.update(1, aim, undefined, frame)
    expect(camera.camera.position.equals(held)).to.be.true
    camera.update(1.1, aim, undefined, frame)
    expect(camera.camera.position.equals(frame.eye)).to.be.true
    camera.beginAimTurn(true)
    frame.walking = true
    for (let i = 0; i < 120; i++) camera.update(1 / 60, aim, undefined, frame)
    expect(camera.camera.position.distanceTo(frame.eye)).to.be.greaterThan(1)
    frame.walking = false
    for (let i = 0; i < 120; i++) camera.update(1 / 60, aim, undefined, frame)
    expect(camera.camera.position.distanceTo(frame.eye)).to.be.lessThan(0.001)
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

  it("starts the shot camera far enough back to show the cue fore-end", () => {
    Camera.configureForRule("eightball")
    const camera = new Camera(16 / 9)

    expect((camera as any).distance).to.equal(Camera.defaultDistance)
    expect((camera as any).distance).to.be.at.least(R * 48)
  })

  it("frames the cue ball, table centre and head ball in the 3D shot view", () => {
    Camera.configureForRule("eightball")
    const camera = new Camera(16 / 9)
    const aim = new AimEvent()
    aim.pos.set(-R * 26, 0, R)
    aim.angle = 0

    camera.aimView(aim, 1)
    camera.camera.updateProjectionMatrix()
    camera.camera.updateMatrixWorld(true)

    const projected = [
      aim.pos.clone(),
      new Vector3(0, 0, 0),
      new Vector3(R * 24, 0, R),
    ].map((point) => point.project(camera.camera))

    for (const point of projected) {
      expect(Math.abs(point.x)).to.be.lessThan(1)
      expect(Math.abs(point.y)).to.be.lessThan(1)
      expect(point.z).to.be.within(-1, 1)
    }
  })

  it("does not overwrite the selected view with a temporary forced view", () => {
    const camera = new Camera(1)

    camera.forceMode(camera.aimView)
    expect(camera.mode).to.equal(camera.aimView)

    camera.suggestMode(camera.aimView)
    expect(camera.mode).to.equal(camera.topView)
  })

  it("keeps a manually orbited view during AI and shot camera suggestions", () => {
    const camera = new Camera(1)
    const aim = new AimEvent()
    camera.topView(aim)

    camera.orbitByPixels(80, -30)
    camera.update(1 / 60, aim)
    expect(camera.mode).to.equal(camera.freeView)

    const position = camera.camera.position.clone()
    camera.suggestMode(camera.topView)
    camera.update(1 / 60, aim)

    expect(camera.mode).to.equal(camera.freeView)
    expect(camera.camera.position.distanceTo(position)).to.be.closeTo(0, 1e-12)
  })

  it("zooms the free camera with the mouse wheel direction", () => {
    const camera = new Camera(1)
    const aim = new AimEvent()
    camera.topView(aim)
    camera.zoomByWheel(-120)
    camera.update(1 / 60, aim)
    const near = camera.camera.position.length()

    camera.zoomByWheel(240)
    camera.update(1 / 60, aim)
    expect(camera.camera.position.length()).to.be.greaterThan(near)
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
