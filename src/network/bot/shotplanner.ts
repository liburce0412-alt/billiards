import { OutcomeType } from "../../model/outcome"
import {
  ShotSimulationBall,
  ShotSimulationInput,
  ShotSimulationResult,
  simulateShotSync,
} from "../../model/shotsimulator"

export interface ShotCandidate {
  id: string
  targetId: number
  kind:
    | "pot"
    | "escape"
    | "safety"
    | "carom"
    | "bank"
    | "kick"
    | "combo"
    | "push-out"
  aim: {
    angle: number
    power: number
    offset: { x: number; y: number }
    elevation: number
  }
  nextTargetIds: number[]
  geometryScore: number
}

export interface BotDifficultyProfile {
  level: number
  candidateBudget: number
  positionWeight: number
  safetyWeight: number
  escapeWeight: number
  lookaheadDepth: 1 | 2
  lookaheadWidth: number
  planningDeadlineMs: number
}

const candidateBudgets = [3, 4, 6, 8, 10, 14, 18, 24, 30, 40, 48]

export const BOT_DIFFICULTY_PROFILES: readonly BotDifficultyProfile[] =
  candidateBudgets.map((candidateBudget, index) => {
    const level = index + 1
    return {
      level,
      candidateBudget,
      positionWeight: level < 4 ? 0 : Math.min(0.72, (level - 3) * 0.09),
      safetyWeight: level < 6 ? 0.04 : Math.min(0.4, (level - 5) * 0.065),
      escapeWeight: level < 5 ? 0.08 : Math.min(0.7, (level - 4) * 0.1),
      lookaheadDepth: level >= 9 ? 2 : 1,
      lookaheadWidth: level < 9 ? 0 : 3 + (level - 9) * 2,
      planningDeadlineMs: level < 9 ? 1800 : 2400,
    }
  })

export function botDifficultyProfile(level: number): BotDifficultyProfile {
  return BOT_DIFFICULTY_PROFILES[
    Math.max(0, Math.min(10, Math.round(level) - 1))
  ]
}

export interface BotPlanRequest {
  type: "BOT_PLAN"
  id: string
  ruleType: string
  cueBallId: number
  balls: ShotSimulationBall[]
  candidates: ShotCandidate[]
  level: number
  cushionModel?: "mathavan" | "stronge"
}

export interface BotPlanResult {
  type: "BOT_PLAN_COMPLETE"
  id: string
  candidateId: string
  candidateIndex: number
  score: number
  simulations: number
  elapsedMs: number
}

function finalCuePosition(
  result: ShotSimulationResult,
  cueBallId: number
): { x: number; y: number } | undefined {
  return result.finalBalls.find((ball) => ball.id === cueBallId)?.pos
}

type Position2D = { x: number; y: number }

function positionScore(
  result: ShotSimulationResult,
  candidate: ShotCandidate,
  cuePos: Position2D | undefined,
  profile: BotDifficultyProfile
): number {
  if (!cuePos || candidate.nextTargetIds.length === 0) return 0
  const nextBalls = result.finalBalls.filter(
    (ball) => ball.onTable && candidate.nextTargetIds.includes(ball.id)
  )
  let score = 0
  if (nextBalls.length > 0) {
    const nextDistance = Math.min(
      ...nextBalls.map((ball) =>
        Math.hypot(ball.pos.x - cuePos.x, ball.pos.y - cuePos.y)
      )
    )
    score = nextDistance * 180 * profile.positionWeight
  } else if (profile.lookaheadDepth === 2) {
    score = -120
  }
  const railClearance = Math.min(
    result.tableX - Math.abs(cuePos.x),
    result.tableY - Math.abs(cuePos.y)
  )
  if (railClearance < 0.14) {
    score += (0.14 - railClearance) * 600 * profile.positionWeight
  }
  return score
}

function safetyScore(
  result: ShotSimulationResult,
  candidate: ShotCandidate,
  cuePos: Position2D | undefined,
  profile: BotDifficultyProfile,
  targetPotted: boolean
): number {
  if (targetPotted || candidate.kind !== "safety") return 0
  let score = -120 * profile.safetyWeight
  const target = result.finalBalls.find(
    (ball) => ball.id === candidate.targetId && ball.onTable
  )
  if (!cuePos || !target) return score
  const separation = Math.hypot(
    target.pos.x - cuePos.x,
    target.pos.y - cuePos.y
  )
  const targetRailDistance = Math.min(
    result.tableX - Math.abs(target.pos.x),
    result.tableY - Math.abs(target.pos.y)
  )
  score -= Math.min(separation, 2.2) * 95 * profile.safetyWeight
  if (targetRailDistance < 0.12) {
    score -= (0.12 - targetRailDistance) * 420 * profile.safetyWeight
  }
  return score
}

function scoreCandidate(
  request: BotPlanRequest,
  candidate: ShotCandidate,
  result: ShotSimulationResult,
  profile: BotDifficultyProfile
): number {
  if (result.exhausted) return 100000

  const firstCollision = result.outcomes.find(
    (outcome) =>
      outcome.type === OutcomeType.Collision &&
      outcome.ballA === request.cueBallId
  )
  const cueBallPotted = result.outcomes.some(
    (outcome) =>
      outcome.type === OutcomeType.Pot && outcome.ballA === request.cueBallId
  )
  const targetPotted = result.outcomes.some(
    (outcome) =>
      outcome.type === OutcomeType.Pot && outcome.ballA === candidate.targetId
  )
  const objectPots = result.outcomes.filter(
    (outcome) =>
      outcome.type === OutcomeType.Pot && outcome.ballA !== request.cueBallId
  ).length

  let score = candidate.geometryScore * 12
  if (!firstCollision || firstCollision.ballB !== candidate.targetId) {
    score += 1800
  }
  if (cueBallPotted) score += 2400
  if (targetPotted) score -= 1300
  score -= objectPots * 220

  const cuePos = finalCuePosition(result, request.cueBallId)
  score += positionScore(result, candidate, cuePos, profile)
  score += safetyScore(result, candidate, cuePos, profile, targetPotted)
  if (candidate.kind === "escape" || candidate.kind === "kick") {
    score -= firstCollision ? 180 * profile.escapeWeight : 0
  }
  return score
}

function simulationInput(
  request: BotPlanRequest,
  candidate: ShotCandidate
): ShotSimulationInput {
  return {
    id: `${request.id}:${candidate.id}`,
    ruleType: request.ruleType,
    balls: request.balls,
    cushionModel: request.cushionModel,
    shot: {
      cueBallId: request.cueBallId,
      angle: candidate.aim.angle,
      power: candidate.aim.power,
      offset: candidate.aim.offset,
      elevation: candidate.aim.elevation,
    },
    stepSize: 1 / 512,
    maxIterations: 45000,
    recordTrajectory: false,
  }
}

function secondShotInput(
  request: BotPlanRequest,
  candidate: ShotCandidate,
  firstResult: ShotSimulationResult,
  targetId: number
): ShotSimulationInput | undefined {
  const cue = firstResult.finalBalls.find(
    (ball) => ball.id === request.cueBallId
  )
  const target = firstResult.finalBalls.find(
    (ball) => ball.id === targetId && ball.onTable
  )
  if (!cue?.onTable || !target) return undefined
  return {
    id: `${request.id}:${candidate.id}:next:${targetId}`,
    ruleType: request.ruleType,
    balls: firstResult.finalBalls,
    cushionModel: request.cushionModel,
    shot: {
      cueBallId: request.cueBallId,
      angle: Math.atan2(target.pos.y - cue.pos.y, target.pos.x - cue.pos.x),
      power: 0.42,
      offset: { x: 0, y: 0.08 },
      elevation: 0,
    },
    stepSize: 1 / 512,
    maxIterations: 45000,
    recordTrajectory: false,
  }
}

function secondShotPenalty(
  request: BotPlanRequest,
  candidate: ShotCandidate,
  firstResult: ShotSimulationResult
): number {
  let best = 900
  for (const targetId of candidate.nextTargetIds.slice(0, 3)) {
    const input = secondShotInput(request, candidate, firstResult, targetId)
    if (!input) continue
    const result = simulateShotSync(input)
    const cuePotted = result.outcomes.some(
      (outcome) =>
        outcome.type === OutcomeType.Pot && outcome.ballA === request.cueBallId
    )
    const targetPotted = result.outcomes.some(
      (outcome) =>
        outcome.type === OutcomeType.Pot && outcome.ballA === targetId
    )
    const firstCollision = result.outcomes.find(
      (outcome) =>
        outcome.type === OutcomeType.Collision &&
        outcome.ballA === request.cueBallId
    )
    let penalty = 260
    if (targetPotted) penalty -= 420
    if (firstCollision?.ballB === targetId) penalty -= 130
    if (cuePotted) penalty += 900
    if (result.exhausted) penalty += 600
    best = Math.min(best, penalty)
  }
  return best
}

export function planBotShotSync(request: BotPlanRequest): BotPlanResult {
  const started = performance.now()
  const profile = botDifficultyProfile(request.level)
  const candidates = request.candidates.slice(0, profile.candidateBudget)
  if (candidates.length === 0) {
    throw new Error("Bot planner received no candidates")
  }

  const scored: {
    candidate: ShotCandidate
    candidateIndex: number
    score: number
    result: ShotSimulationResult
  }[] = []
  for (
    let candidateIndex = 0;
    candidateIndex < candidates.length;
    candidateIndex++
  ) {
    const candidate = candidates[candidateIndex]
    const result = simulateShotSync(simulationInput(request, candidate))
    scored.push({
      candidate,
      candidateIndex,
      score: scoreCandidate(request, candidate, result, profile),
      result,
    })
    if (
      scored.length >= 3 &&
      performance.now() - started >= profile.planningDeadlineMs
    ) {
      break
    }
  }
  scored.sort(
    (a, b) =>
      a.score - b.score ||
      a.candidate.geometryScore - b.candidate.geometryScore ||
      a.candidateIndex - b.candidateIndex
  )
  if (profile.lookaheadDepth === 2) {
    for (const entry of scored.slice(0, profile.lookaheadWidth)) {
      if (performance.now() - started >= profile.planningDeadlineMs) break
      entry.score += secondShotPenalty(request, entry.candidate, entry.result)
    }
    scored.sort(
      (a, b) =>
        a.score - b.score ||
        a.candidate.geometryScore - b.candidate.geometryScore ||
        a.candidateIndex - b.candidateIndex
    )
  }
  const best = scored[0]
  return {
    type: "BOT_PLAN_COMPLETE",
    id: request.id,
    candidateId: best.candidate.id,
    candidateIndex: best.candidateIndex,
    score: best.score,
    simulations: candidates.length,
    elapsedMs: performance.now() - started,
  }
}
