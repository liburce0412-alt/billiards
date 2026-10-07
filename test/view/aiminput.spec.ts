import { expect } from "chai"
import { AimInputs, DEFAULT_SHOT_CLOCK_MS } from "../../src/view/dom/aiminputs"
import { initDom, canvas3d } from "./dom"
import { Container } from "../../src/container/container"
import { fireEvent } from "@testing-library/dom"
import { Assets } from "../../src/view/assets"
import { Session } from "../../src/network/client/session"

initDom()

describe("AimInput", () => {
  let container: Container
  let aiminputs: AimInputs

  beforeEach(function (done) {
    initDom()
    container = new Container({
      element: canvas3d,
      log: (_) => {},
      assets: Assets.localAssets(),
    })
    aiminputs = container.table.cue.aimInputs
    done()
  })

  it("adjust spin", (done) => {
    const e = { buttons: 1, offsetX: 1, offsetY: 1 }
    fireEvent.click(aiminputs.cueBallElement)
    aiminputs.mousemove(e)
    expect(aiminputs.cueHitElement).to.be.not.null
    done()
  })

  it("adjust power", (done) => {
    aiminputs.setDisabled(false)
    aiminputs.cuePowerElement.value = "1"
    fireEvent.input(aiminputs.cuePowerElement, { target: { value: "1" } })
    expect(container.table.cue.aim.power).to.be.greaterThan(0)
    done()
  })

  it("resets the range after a strike without overwriting its recorded force", () => {
    aiminputs.setDisabled(false)
    container.table.cue.setPower(1)
    const force = container.table.cue.aim.power
    aiminputs.animateSliderHit()
    expect(Number(aiminputs.cuePowerElement.value)).to.equal(0)
    expect(container.table.cue.aim.power).to.equal(force)
    expect(
      aiminputs.powerSliderContainerElement.getAttribute("aria-valuenow")
    ).to.equal("0")
    aiminputs.dispose()
  })

  it("double click cue ball toggles tilt slider", (done) => {
    aiminputs.setDisabled(false)
    expect(aiminputs.tiltSliderContainerElement.hidden).to.be.true
    fireEvent.dblClick(aiminputs.cueBallElement)
    expect(aiminputs.tiltSliderContainerElement.hidden).to.be.false
    fireEvent.dblClick(aiminputs.cueBallElement)
    expect(aiminputs.tiltSliderContainerElement.hidden).to.be.true
    done()
  })

  it("openElevation button toggles tilt slider", (done) => {
    aiminputs.setDisabled(false)
    expect(aiminputs.tiltSliderContainerElement.hidden).to.be.true
    fireEvent.click(document.getElementById("openElevation") as HTMLElement)
    expect(aiminputs.tiltSliderContainerElement.hidden).to.be.false
    fireEvent.click(document.getElementById("openElevation") as HTMLElement)
    expect(aiminputs.tiltSliderContainerElement.hidden).to.be.true
    done()
  })

  it("toggleTiltControl without arguments toggles tilt slider", (done) => {
    aiminputs.setDisabled(false)
    expect(aiminputs.tiltSliderContainerElement.hidden).to.be.true
    aiminputs.toggleTiltControl()
    expect(aiminputs.tiltSliderContainerElement.hidden).to.be.false
    aiminputs.toggleTiltControl()
    expect(aiminputs.tiltSliderContainerElement.hidden).to.be.true
    done()
  })

  it("tilt slider updates aim elevation", (done) => {
    aiminputs.setDisabled(false)
    aiminputs.tiltSliderContainerElement.hidden = false
    aiminputs.cueTiltElement.elevation = 0.75
    fireEvent.input(aiminputs.cueTiltElement)
    expect(container.table.cue.aim.elevation).to.equal(0.75)
    done()
  })

  it("click hit button", (done) => {
    aiminputs.setDisabled(false)
    aiminputs.tiltSliderContainerElement.hidden = false
    document.getElementById("cueHit")?.click()
    expect(aiminputs.tiltSliderContainerElement.hidden).to.be.true
    expect(aiminputs.container.inputQueue).to.be.not.empty
    done()
  })

  it("does not fire a shot when the shot-clock display expires", () => {
    jest.useFakeTimers()
    const originalRequestAnimationFrame = globalThis.requestAnimationFrame
    const originalCancelAnimationFrame = globalThis.cancelAnimationFrame
    globalThis.requestAnimationFrame = (callback: FrameRequestCallback) =>
      setTimeout(() => callback(performance.now()), 16) as unknown as number
    globalThis.cancelAnimationFrame = (id: number) =>
      clearTimeout(id as unknown as ReturnType<typeof setTimeout>)
    Session.init("id", "name", "table", false, true)

    const timedInputs = new AimInputs(container)
    timedInputs.setDisabled(false)
    jest.advanceTimersByTime(DEFAULT_SHOT_CLOCK_MS + 100)

    expect(container.inputQueue).to.be.empty
    timedInputs.setDisabled(true)
    Session.reset()
    globalThis.requestAnimationFrame = originalRequestAnimationFrame
    globalThis.cancelAnimationFrame = originalCancelAnimationFrame
    jest.useRealTimers()
  })

  it("mouse wheel updates power", (done) => {
    aiminputs.setDisabled(false)
    const initialPower = Number(aiminputs.cuePowerElement.value)
    aiminputs.mousewheel({ deltaY: 10 })
    expect(Number(aiminputs.cuePowerElement.value)).to.not.equal(initialPower)
    expect(aiminputs.cuePowerElement.style.getPropertyValue("--p")).to.not.be
      .empty
    done()
  })

  it("spectator mode disables hit button, power and spin controls", (done) => {
    Session.init("id", "name", "table", true)
    const spectatorAimInputs = new AimInputs(container)
    expect(spectatorAimInputs.cueHitElement.disabled).to.be.true
    expect(spectatorAimInputs.cuePowerElement.disabled).to.be.true
    expect(spectatorAimInputs.cueBallElement.style.pointerEvents).to.equal(
      "none"
    )
    spectatorAimInputs.setDisabled(false)
    expect(spectatorAimInputs.cueHitElement.disabled).to.be.true
    expect(spectatorAimInputs.cuePowerElement.disabled).to.be.true
    expect(spectatorAimInputs.cueBallElement.style.pointerEvents).to.equal(
      "none"
    )
    Session.reset()
    done()
  })

  it("setDisabled toggles hit, spin and power controls", (done) => {
    aiminputs.tiltSliderContainerElement.hidden = false
    aiminputs.setDisabled(true)
    expect(aiminputs.cueHitElement.disabled).to.be.true
    expect(aiminputs.cuePowerElement.disabled).to.be.true
    expect(aiminputs.cueTiltElement.disabled).to.be.true
    expect(aiminputs.tiltSliderContainerElement.hidden).to.be.true
    expect(aiminputs.cueBallElement.style.pointerEvents).to.equal("none")

    aiminputs.setDisabled(false)
    expect(aiminputs.cueHitElement.disabled).to.be.false
    expect(aiminputs.cuePowerElement.disabled).to.be.false
    expect(aiminputs.cueTiltElement.disabled).to.be.false
    expect(aiminputs.tiltSliderContainerElement.hidden).to.be.true
    expect(aiminputs.cueBallElement.style.pointerEvents).to.equal("auto")
    done()
  })

  it("disabled controls ignore spin and power input events", (done) => {
    aiminputs.setDisabled(true)
    const initialPower = container.table.cue.aim.power
    const initialOffset = container.table.cue.aim.offset.clone()

    aiminputs.cuePowerElement.value = 1
    aiminputs.powerChanged({})
    aiminputs.mousewheel({ deltaY: 10 })
    aiminputs.cueTiltElement.value = 1
    aiminputs.tiltChanged({})
    aiminputs.adjustSpin({ offsetX: 1, offsetY: 1 })

    expect(container.table.cue.aim.power).to.equal(initialPower)
    expect(container.table.cue.aim.elevation).to.equal(0)
    expect(container.table.cue.aim.offset.equals(initialOffset)).to.be.true
    done()
  })

  it("requires a downward arm gesture before vertical release can strike", () => {
    aiminputs.setDisabled(false)
    ;(aiminputs as any).powerOrientationQuery = { matches: true }
    ;(aiminputs as any).syncPowerOrientation()
    jest
      .spyOn((aiminputs as any).powerArcRenderer, "getGeometry")
      .mockReturnValue({
        valueFromPointer: (_x: number, y: number) => y / 180,
        pointAt: () => ({ x: 0, y: 0 }),
      })
    jest
      .spyOn(aiminputs.powerSliderContainerElement, "getBoundingClientRect")
      .mockReturnValue({
        left: 100,
        top: 40,
        right: 180,
        bottom: 220,
        width: 80,
        height: 180,
        x: 100,
        y: 40,
        toJSON: () => ({}),
      })
    const event = (pointerId: number, clientX: number, clientY: number) => ({
      pointerId,
      pointerType: "touch",
      button: 0,
      clientX,
      clientY,
      preventDefault: jest.fn(),
      stopPropagation: jest.fn(),
    })

    const before = Number(aiminputs.cuePowerElement.value)
    ;(aiminputs as any).powerPointerDown(event(1, 150, 80))
    ;(aiminputs as any).powerPointerMove(event(1, 150, 85))
    ;(aiminputs as any).powerPointerUp(event(1, 150, 85))
    expect(container.inputQueue).to.be.empty
    expect(Number(aiminputs.cuePowerElement.value)).to.be.closeTo(before, 1e-6)

    ;(aiminputs as any).powerPointerDown(event(2, 150, 80))
    ;(aiminputs as any).powerPointerMove(event(2, 150, 130))
    expect(aiminputs.getPowerGestureState().armed).to.be.true
    const movePower = Number(aiminputs.cuePowerElement.value)
    // The release may carry a newer position than the last coalesced move.
    ;(aiminputs as any).powerPointerUp(event(2, 150, 180))
    expect(container.inputQueue).to.have.length(1)
    expect(Number(aiminputs.cuePowerElement.value)).to.be.greaterThan(movePower)
  })

  it("uses left-side cancellation hysteresis on the vertical rail", () => {
    aiminputs.setDisabled(false)
    ;(aiminputs as any).powerOrientationQuery = { matches: true }
    jest
      .spyOn(aiminputs.powerSliderContainerElement, "getBoundingClientRect")
      .mockReturnValue({
        left: 100,
        top: 40,
        right: 180,
        bottom: 220,
        width: 80,
        height: 180,
        x: 100,
        y: 40,
        toJSON: () => ({}),
      })
    const event = (clientX: number, clientY: number) => ({
      pointerId: 5,
      pointerType: "touch",
      button: 0,
      clientX,
      clientY,
      preventDefault: jest.fn(),
      stopPropagation: jest.fn(),
    })

    ;(aiminputs as any).powerPointerDown(event(150, 80))
    ;(aiminputs as any).powerPointerMove(event(150, 110))
    ;(aiminputs as any).powerPointerMove(event(50, 130))
    expect(aiminputs.getPowerGestureState().cancelled).to.be.true
    ;(aiminputs as any).powerPointerMove(event(60, 140))
    expect(aiminputs.getPowerGestureState().cancelled).to.be.true
    ;(aiminputs as any).powerPointerMove(event(70, 140))
    expect(aiminputs.getPowerGestureState().cancelled).to.be.false
    ;(aiminputs as any).powerPointerCancel(event(70, 140))
  })
})
