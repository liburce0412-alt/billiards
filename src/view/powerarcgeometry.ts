export interface PowerArcPoint {
  x: number
  y: number
}

export type PowerArcNormal = PowerArcPoint

/**
 * Geometry shared by the WebGL renderer, DOM readout and pointer input.
 * The curve is deliberately x-monotonic, which makes dragging predictable on
 * mouse and touch while retaining the deep bowed profile from the reference.
 */
export class PowerArcGeometry {
  constructor(
    readonly width: number,
    readonly height: number,
    readonly inset: number = Math.min(34, width * 0.055),
    readonly top: number = Math.max(16, height * 0.16),
    readonly sag: number = Math.min(54, height * 0.44)
  ) {}

  clamp(value: number): number {
    return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
  }

  pointAt(value: number): PowerArcPoint {
    const t = this.clamp(value)
    const usable = Math.max(1, this.width - this.inset * 2)
    const centred = t * 2 - 1
    return {
      x: this.inset + usable * t,
      y: this.top + this.sag * (1 - centred * centred),
    }
  }

  tangentAt(value: number): PowerArcPoint {
    const t = this.clamp(value)
    const usable = Math.max(1, this.width - this.inset * 2)
    return { x: usable, y: -4 * this.sag * (t * 2 - 1) }
  }

  normalAt(value: number): PowerArcNormal {
    const tangent = this.tangentAt(value)
    const length = Math.hypot(tangent.x, tangent.y) || 1
    return { x: -tangent.y / length, y: tangent.x / length }
  }

  valueFromPointer(x: number, _y?: number): number {
    return this.clamp(
      (x - this.inset) / Math.max(1, this.width - this.inset * 2)
    )
  }
}
