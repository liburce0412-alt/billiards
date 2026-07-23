import {
  DEFAULT_SHOT_CLOCK_MS,
  SHOT_CLOCK_CRITICAL_MS,
  shotClockDuration,
} from "../../src/view/dom/aiminputs"

describe("human shot clock", () => {
  it("uses a relaxed 35 second default", () => {
    expect(shotClockDuration("")).toBe(DEFAULT_SHOT_CLOCK_MS)
    expect(DEFAULT_SHOT_CLOCK_MS).toBe(35000)
    expect(SHOT_CLOCK_CRITICAL_MS).toBe(7000)
  })

  it("keeps a valid URL override and rejects invalid values", () => {
    expect(shotClockDuration("?shotClock=50")).toBe(50000)
    expect(shotClockDuration("?shotClock=0")).toBe(DEFAULT_SHOT_CLOCK_MS)
    expect(shotClockDuration("?shotClock=invalid")).toBe(DEFAULT_SHOT_CLOCK_MS)
  })
})
