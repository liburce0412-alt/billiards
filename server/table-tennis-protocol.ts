import type { PlayerInput } from "../packages/table-tennis/src/core/types"
import { STROKE_TECHNIQUES } from "../packages/table-tennis/src/core/racket"

export const TABLE_TENNIS_PROTOCOL = 1
export const TABLE_TENNIS_RECONNECT_MS = 30_000

/** Clients provide intentions only; positions, scores and outcomes are server-owned. */
export function validTableTennisInput(value: unknown): value is PlayerInput {
  if (!value || typeof value !== "object") return false
  const input = value as PlayerInput
  return (
    (input.kind === "serve" || input.kind === "swing") &&
    Number.isSafeInteger(input.seq) &&
    input.seq >= 0 &&
    Number.isFinite(input.aimX) &&
    Math.abs(input.aimX) <= 1 &&
    Number.isFinite(input.power) &&
    input.power >= 0 &&
    input.power <= 1 &&
    Number.isFinite(input.spin) &&
    Math.abs(input.spin) <= 1 &&
    (input.sideSpin === undefined ||
      (Number.isFinite(input.sideSpin) && Math.abs(input.sideSpin) <= 1)) &&
    (input.technique === undefined ||
      STROKE_TECHNIQUES.includes(input.technique))
  )
}
