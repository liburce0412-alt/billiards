export interface FixedStepResult {
  steps: number
  elapsed: number
}

/**
 * Converts variable render-frame time into deterministic fixed simulation steps.
 * Unconsumed time is retained instead of being discarded every frame.
 */
export class FixedStepAccumulator {
  private remainder = 0

  constructor(
    readonly step: number,
    readonly maxCatchUp: number = 0.1
  ) {}

  consume(elapsed: number, timeScale: number = 1): FixedStepResult {
    const scaled = Math.min(
      this.maxCatchUp,
      Math.max(0, elapsed * Math.max(0, timeScale))
    )
    this.remainder += scaled

    const steps = Math.floor((this.remainder + Number.EPSILON) / this.step)
    const simulatedElapsed = steps * this.step
    this.remainder = Math.max(0, this.remainder - simulatedElapsed)

    return { steps, elapsed: simulatedElapsed }
  }

  reset() {
    this.remainder = 0
  }
}
