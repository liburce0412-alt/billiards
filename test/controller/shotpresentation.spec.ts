import { ControllerBase } from "../../src/controller/controllerbase"
import { Cue } from "../../src/view/cue"
import { PlayShot } from "../../src/controller/playshot"

class ShotController extends ControllerBase {}

function setup() {
  const cue = new Cue()
  const robot = {
    readyToStrike: false,
    prepareShot: jest.fn(),
    beginShot: jest.fn(),
  }
  const container: any = {
    table: {
      cue,
      cueball: { id: 0 },
      hit: jest.fn(),
      proximityIndicator: { hide: jest.fn() },
    },
    view: { robotPlayers: robot, camera: { beginShot: jest.fn() } },
    sound: {},
    shotDiagnostics: { start: jest.fn() },
  }
  return { cue, robot, container, controller: new ShotController(container) }
}

describe("Shot presentation contact gate", () => {
  it("strikes in the same call on human release once the player is ready", () => {
    const { cue, robot, container } = setup()
    robot.readyToStrike = true
    const contact = jest.fn()
    const controller = new PlayShot(container, contact, "player")
    expect(container.table.hit).toHaveBeenCalledTimes(1)
    expect(contact).toHaveBeenCalledTimes(1)
    expect(robot.prepareShot).not.toHaveBeenCalled()
    expect(cue.preStrokeProgress).toBeUndefined()
    expect(controller.isPreparingShot).toBe(false)
    expect(robot.beginShot).toHaveBeenCalledTimes(1)
    expect(container.view.camera.beginShot).toHaveBeenCalledTimes(1)
    controller.updatePresentation(1 / 60)
    expect(container.table.hit).toHaveBeenCalledTimes(1)
  })

  it("waits only for arrival on human release, then strikes on the first ready frame", () => {
    const { cue, robot, container } = setup()
    const contact = jest.fn()
    const controller = new PlayShot(container, contact, "player")
    for (let i = 0; i < 600; i++) controller.updatePresentation(1 / 60)
    expect(container.table.hit).not.toHaveBeenCalled()
    expect(robot.prepareShot).not.toHaveBeenCalled()
    robot.readyToStrike = true
    controller.updatePresentation(1 / 60)
    expect(container.table.hit).toHaveBeenCalledTimes(1)
    expect(contact).toHaveBeenCalledTimes(1)
    expect(cue.preStrokeProgress).toBeUndefined()
  })

  it("retains automatic preparation for administrator assist", () => {
    const { robot, container } = setup()
    robot.readyToStrike = true
    const controller = new PlayShot(container, undefined, "assist")
    expect(container.table.hit).not.toHaveBeenCalled()
    expect(robot.prepareShot).toHaveBeenCalledTimes(1)
    expect(controller.isPreparingShot).toBe(true)
  })
  it("keeps physics stopped while walking, settles the aim and hits once at stroke contact", () => {
    const { cue, robot, container, controller } = setup()
    const contact = jest.fn()
    controller.hit(contact)
    for (let i = 0; i < 600; i++) controller.updatePresentation(1 / 60)
    expect(container.table.hit).not.toHaveBeenCalled()
    expect(contact).not.toHaveBeenCalled()
    robot.readyToStrike = true
    for (let i = 0; i < 60; i++) controller.updatePresentation(1 / 60)
    expect(cue.preStrokeProgress).toBeGreaterThan(0.7)
    expect(container.table.hit).not.toHaveBeenCalled()
    for (let i = 0; i < 120; i++) controller.updatePresentation(1 / 60)
    expect(container.table.hit).toHaveBeenCalledTimes(1)
    expect(contact).toHaveBeenCalledTimes(1)
    expect(robot.beginShot).toHaveBeenCalledTimes(1)
    expect(controller.isPreparingShot).toBe(false)
  })

  it("pauses without rewinding if the stance loses readiness and cancels on leaving", () => {
    const { cue, robot, container, controller } = setup()
    controller.hit()
    robot.readyToStrike = true
    for (let i = 0; i < 50; i++) controller.updatePresentation(1 / 60)
    const progress = cue.preStrokeProgress
    robot.readyToStrike = false
    for (let i = 0; i < 120; i++) controller.updatePresentation(1 / 60)
    expect(cue.preStrokeProgress).toBe(progress)
    robot.readyToStrike = true
    controller.updatePresentation(1 / 60)
    expect(cue.preStrokeProgress).toBeGreaterThan(progress!)
    expect(container.table.hit).not.toHaveBeenCalled()
    controller.dispose()
    for (let i = 0; i < 100; i++) controller.updatePresentation(1 / 60)
    expect(container.table.hit).not.toHaveBeenCalled()
    expect(cue.preStrokeProgress).toBeUndefined()
  })
})
