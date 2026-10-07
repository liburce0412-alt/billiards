/** More travel for gentle shots, with the same full-speed endpoint. */
export function powerRatioFromControl(value: number): number {
  const control = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0
  return control * (0.15 + 0.85 * control)
}

export function controlFromPowerRatio(value: number): number {
  const power = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0
  return (2 * power) / (0.15 + Math.sqrt(0.15 ** 2 + 3.4 * power))
}
