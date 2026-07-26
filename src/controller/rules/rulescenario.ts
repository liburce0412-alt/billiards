import { RuleProfileId } from "./ruleprofile"

export interface RuleScenarioBall {
  readonly label: number
  readonly x: number
  readonly y: number
  readonly pocketed?: boolean
}

export interface RuleScenario {
  readonly id: string
  readonly profileId: RuleProfileId
  readonly title: string
  readonly opening: boolean
  readonly player: 1 | 2
  readonly balls: readonly RuleScenarioBall[]
  readonly action: {
    readonly firstContact?: number
    readonly potted: readonly number[]
    readonly cushions: number
    readonly cueBallPotted: boolean
    readonly requestLetStroke?: boolean
  }
  readonly expected: {
    readonly legal: boolean
    readonly group?: 0 | 1 | 2
    readonly ballInHand?: "none" | "behind-line" | "anywhere"
    readonly scoreDelta?: number
    readonly canLetStroke?: boolean
    readonly note: string
  }
}

const coreScenarios: readonly RuleScenario[] = [
  {
    id: "eightball-opening-pot-stays-open",
    profileId: "eightball",
    title: "中八开球进球不分组",
    opening: true,
    player: 1,
    balls: [],
    action: {
      firstContact: 1,
      potted: [1],
      cushions: 4,
      cueBallPotted: false,
    },
    expected: { legal: true, group: 0, note: "开球后保持开放球台" },
  },
  {
    id: "eightball-mixed-combination-stays-open",
    profileId: "eightball",
    title: "中八混合传球不分组",
    opening: false,
    player: 1,
    balls: [],
    action: {
      firstContact: 1,
      potted: [1, 9],
      cushions: 0,
      cueBallPotted: false,
    },
    expected: { legal: true, group: 0, note: "同时进全色和花色不分组" },
  },
  {
    id: "eightball-opening-scratch-behind-line",
    profileId: "eightball",
    title: "中八开球母球入袋为线后自由球",
    opening: true,
    player: 1,
    balls: [],
    action: {
      firstContact: 1,
      potted: [],
      cushions: 4,
      cueBallPotted: true,
    },
    expected: {
      legal: false,
      ballInHand: "behind-line",
      note: "对手只能在线后摆放母球",
    },
  },
  {
    id: "nineball-lowest-first",
    profileId: "nineball",
    title: "九球必须先碰最低号球",
    opening: false,
    player: 1,
    balls: [],
    action: {
      firstContact: 2,
      potted: [],
      cushions: 1,
      cueBallPotted: false,
    },
    expected: {
      legal: false,
      ballInHand: "anywhere",
      note: "未先碰最低号球判犯规",
    },
  },
  {
    id: "snooker-foul-minimum-four",
    profileId: "snooker",
    title: "斯诺克犯规最低罚四分",
    opening: false,
    player: 1,
    balls: [],
    action: {
      firstContact: 2,
      potted: [],
      cushions: 0,
      cueBallPotted: false,
    },
    expected: {
      legal: false,
      scoreDelta: -4,
      note: "低分值目标犯规仍至少罚四分",
    },
  },
  {
    id: "fourball-combination-nine",
    profileId: "fourball",
    title: "四球合法传九",
    opening: false,
    player: 1,
    balls: [],
    action: {
      firstContact: 1,
      potted: [9],
      cushions: 0,
      cueBallPotted: false,
    },
    expected: { legal: true, scoreDelta: 4, note: "先碰目标球后传九获胜" },
  },
  {
    id: "fourball-let-stroke-blocked-incoming",
    profileId: "fourball",
    title: "四球接手且中心线被挡可让杆",
    opening: false,
    player: 2,
    balls: [],
    action: {
      potted: [],
      cushions: 0,
      cueBallPotted: false,
      requestLetStroke: true,
    },
    expected: {
      legal: true,
      canLetStroke: true,
      note: "让杆权只在接手被遮挡时产生",
    },
  },
  {
    id: "fourball-no-let-during-run",
    profileId: "fourball",
    title: "四球连续进球中不可让杆",
    opening: false,
    player: 1,
    balls: [],
    action: {
      potted: [1],
      cushions: 0,
      cueBallPotted: false,
      requestLetStroke: true,
    },
    expected: {
      legal: false,
      canLetStroke: false,
      note: "连续进球不重新授予让杆权",
    },
  },
]

const profileIds: readonly RuleProfileId[] = [
  "eightball",
  "nineball",
  "snooker",
  "fourball",
  "threecushion",
]

function expectedBallInHand(
  profileId: RuleProfileId,
  opening: boolean,
  cueBallPotted: boolean
): "none" | "behind-line" | "anywhere" {
  if (!cueBallPotted) return "none"
  if (profileId === "eightball" && opening) return "behind-line"
  return "anywhere"
}

function matrixScenario(profileId: RuleProfileId, index: number): RuleScenario {
  const opening = index % 4 === 0
  const cueBallPotted = index % 7 === 0
  const potted = index % 3 === 0 ? [1 + (index % 9)] : []
  return {
    id: `${profileId}-regression-${String(index + 1).padStart(2, "0")}`,
    profileId,
    title: `${profileId} 固定回归局面 ${index + 1}`,
    opening,
    player: index % 2 === 0 ? 1 : 2,
    balls: [
      { label: 0, x: -0.5 + index * 0.001, y: 0 },
      { label: 1 + (index % 9), x: 0.4, y: (index % 5) * 0.03 },
    ],
    action: {
      firstContact: 1 + (index % 9),
      potted,
      cushions: index % 5,
      cueBallPotted,
    },
    expected: {
      legal: !cueBallPotted,
      ballInHand: expectedBallInHand(profileId, opening, cueBallPotted),
      note: "固定矩阵用于序列化、回放与判定回归",
    },
  }
}

function matrixScenarios(): RuleScenario[] {
  const scenarios: RuleScenario[] = []
  for (const profileId of profileIds) {
    for (let index = 0; index < 40; index++) {
      scenarios.push(matrixScenario(profileId, index))
    }
  }
  return scenarios
}

export const RULE_SCENARIOS: readonly RuleScenario[] = Object.freeze([
  ...coreScenarios,
  ...matrixScenarios(),
])

export function serialiseRuleScenario(scenario: RuleScenario): string {
  return JSON.stringify(scenario)
}

export function restoreRuleScenario(serialised: string): RuleScenario {
  return JSON.parse(serialised) as RuleScenario
}
