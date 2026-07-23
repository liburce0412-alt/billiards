import {
  setR,
  setBallFrictionScale,
  setBallRestitution,
  setMaxPower,
  setee,
  setm,
  setmu,
  setmuS,
  setrho,
  setstronge_e_n,
  setstronge_omega_ratio,
  setstronge_μ,
  setμs,
  setμw,
} from "./constants"

export interface PhysicsProfile {
  readonly id: "legacy" | "pool-standard"
  readonly ballRadius: number
  readonly ballMass: number
  readonly rollingFriction: number
  readonly slidingFriction: number
  readonly spinFriction: number
  readonly ballRestitution: number
  readonly ballFrictionScale: number
  readonly maxCueSpeed: number
  readonly cushionRestitution: number
  readonly tableFriction: number
  readonly cushionFriction: number
  readonly strongeOmegaRatio: number
  readonly strongeRestitution: number
  readonly strongeFriction: number
}

export const LEGACY_PHYSICS: PhysicsProfile = {
  id: "legacy",
  ballRadius: 0.03275,
  ballMass: 0.23,
  rollingFriction: 0.0055,
  slidingFriction: 0.126,
  spinFriction: 0.045,
  ballRestitution: 0.925,
  ballFrictionScale: 1,
  maxCueSpeed: 160 * 0.03275,
  cushionRestitution: 0.85,
  tableFriction: 0.2,
  cushionFriction: 0.2,
  strongeOmegaRatio: 1.76,
  strongeRestitution: 0.77,
  strongeFriction: 0.25,
}

/** SI-sized starting point for regulation 2.25 inch pool balls. */
export const POOL_STANDARD_PHYSICS: PhysicsProfile = {
  ...LEGACY_PHYSICS,
  id: "pool-standard",
  ballRadius: 0.028575,
  ballMass: 0.170097,
  // The Han rolling moment model resolves to mu * g / sqrt(2).
  // Scale the measured 0.01 rolling coefficient so deceleration is 0.01 g.
  rollingFriction: Math.SQRT2 * 0.01,
  slidingFriction: 0.2,
  ballRestitution: 0.95,
  maxCueSpeed: 8.5,
}

export function physicsProfileForRule(ruleType: string): PhysicsProfile {
  return ["eightball", "nineball", "fourball"].includes(ruleType)
    ? POOL_STANDARD_PHYSICS
    : LEGACY_PHYSICS
}

export function applyPhysicsProfile(profile: PhysicsProfile) {
  setR(profile.ballRadius)
  setm(profile.ballMass)
  setmu(profile.rollingFriction)
  setmuS(profile.slidingFriction)
  setrho(profile.spinFriction)
  setBallRestitution(profile.ballRestitution)
  setBallFrictionScale(profile.ballFrictionScale)
  setMaxPower(profile.maxCueSpeed)
  setee(profile.cushionRestitution)
  setμs(profile.tableFriction)
  setμw(profile.cushionFriction)
  setstronge_omega_ratio(profile.strongeOmegaRatio)
  setstronge_e_n(profile.strongeRestitution)
  setstronge_μ(profile.strongeFriction)
}

export function applyPhysicsProfileForRule(ruleType: string) {
  const profile = physicsProfileForRule(ruleType)
  applyPhysicsProfile(profile)
  return profile
}
