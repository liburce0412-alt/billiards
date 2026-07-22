import { MathUtils } from "three"

export function gainForImpact(
  speed: number,
  referenceSpeed: number,
  ceiling = 1
) {
  const normalized = MathUtils.clamp(
    Math.abs(speed) / Math.max(referenceSpeed, 1e-6),
    0,
    1
  )
  return Math.pow(normalized, 0.65) * ceiling
}
