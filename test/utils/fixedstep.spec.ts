import { expect } from "chai"
import { FixedStepAccumulator } from "../../src/utils/fixedstep"

describe("FixedStepAccumulator", () => {
  const step = 1 / 512

  function stepsAfter(seconds: number, fps: number) {
    const accumulator = new FixedStepAccumulator(step)
    let steps = 0
    for (let frame = 0; frame < seconds * fps; frame++) {
      steps += accumulator.consume(1 / fps).steps
    }
    return steps
  }

  it("retains fractional frame time at common refresh rates", () => {
    expect(stepsAfter(10, 30)).to.equal(5120)
    expect(stepsAfter(10, 60)).to.equal(5120)
    expect(stepsAfter(10, 144)).to.equal(5120)
  })

  it("caps simulation catch-up after a long frame", () => {
    const accumulator = new FixedStepAccumulator(step, 0.1)
    const result = accumulator.consume(1)
    expect(result.steps).to.equal(51)
    expect(result.elapsed).to.equal(51 * step)
  })

  it("honours time scale without changing the fixed step", () => {
    const accumulator = new FixedStepAccumulator(step)
    const result = accumulator.consume(1 / 60, 2)
    expect(result.steps).to.equal(17)
    expect(result.elapsed).to.equal(result.steps * step)
  })
})
