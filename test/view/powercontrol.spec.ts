import { Vector3 } from "three"
import { Cue } from "../../src/view/cue"
import { maxPower } from "../../src/model/physics/constants"
import {
  powerRatioFromControl,
  controlFromPowerRatio,
} from "../../src/view/powercontrol"

describe("Gentle shot control", () => {
  it("provides a usable gentle range while retaining the full break speed", () => {
    expect(powerRatioFromControl(0)).toBe(0)
    expect(powerRatioFromControl(0.01) * 17).toBeCloseTo(0.026945)
    expect(powerRatioFromControl(0.1) * 17).toBeCloseTo(0.3995)
    expect(powerRatioFromControl(1) * 17).toBe(17)
    let previous = -1
    for (let i = 0; i <= 1000; i++) {
      const control = i / 1000
      const power = powerRatioFromControl(control)
      expect(power).toBeGreaterThan(previous)
      expect(controlFromPowerRatio(power)).toBeCloseTo(control, 10)
      previous = power
    }
  })

  it("keeps the displayed charge stable when spin updates the controls", () => {
    const cue = new Cue()
    const updatePowerSlider = jest.fn()
    cue.aimInputs = {
      isDisabled: () => false,
      updateVisualState: jest.fn(),
      updatePowerSlider,
      showOverlap: jest.fn(),
    } as any
    cue.setControlPower(0.1)
    expect(cue.aim.power).toBeCloseTo(maxPower * 0.0235, 6)
    cue.aim.offset.copy(new Vector3(0.1, 0.2, 0))
    cue.updateAimInput()
    expect(updatePowerSlider.mock.lastCall[0]).toBeCloseTo(0.1, 6)
    cue.setPower(0.5)
    expect(cue.aim.power).toBeCloseTo(maxPower * 0.5, 6)
  })
})
