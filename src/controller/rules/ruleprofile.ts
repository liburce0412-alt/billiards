export type RuleProfileId =
  | "eightball"
  | "nineball"
  | "snooker"
  | "fourball"
  | "threecushion"
  | "sagu"
  | "threecushion-drill"

export interface RuleProfile {
  readonly id: RuleProfileId
  readonly displayName: string
  readonly version: string
  readonly reviewedOn: string
  readonly sourceUrls: readonly string[]
  readonly break: string
  readonly ballInHand: string
  readonly grouping: string
  readonly fouls: readonly string[]
  readonly scoring: string
  readonly letStroke: string
  readonly reset: string
}

const profiles: Record<RuleProfileId, RuleProfile> = {
  eightball: {
    id: "eightball",
    displayName: "中式八球",
    version: "Break Builder 2026.07 / 星牌规则基线",
    reviewedOn: "2026-07-27",
    sourceUrls: [
      "https://www.xingpaibilliard.com/news/hydt/2020/06/01/4508.html",
    ],
    break: "合法开球需有目标球入袋，或至少四颗目标球触库；开球进球不分组。",
    ballInHand: "开球母球落袋为开球线后自由球；其余犯规为全台自由球。",
    grouping:
      "开球后保持开放球台；合法非开球杆只进全色或只进花色时确定分组，混合传球不分组。",
    fouls: [
      "母球落袋或离台",
      "先碰非法目标球",
      "击球后无球入袋且无球触库",
      "非法开球",
    ],
    scoring: "清完本组后合法打进黑八获胜；提前进黑八或黑八杆犯规判负。",
    letStroke: "不使用让杆。",
    reset: "黑八开球入袋时复位黑八并继续开放球台。",
  },
  nineball: {
    id: "nineball",
    displayName: "美式九球",
    version: "WPA Rules of Play 2025",
    reviewedOn: "2026-07-27",
    sourceUrls: [
      "https://wpapool.com/wp-content/uploads/2025/10/2025.09.15-WPA-Rules-NP.pdf",
    ],
    break: "先碰台面最低号球；无球入袋时至少四颗目标球触库。",
    ballInHand: "犯规后对手获得全台自由球。",
    grouping: "无分组，始终先碰台面最低号球。",
    fouls: ["母球落袋或离台", "未先碰最低号球", "击球后无球入袋且无球触库"],
    scoring: "合法击球中九号球入袋获胜，允许传九。",
    letStroke: "不使用让杆。",
    reset: "犯规或非法情况下入袋的九号球复位。",
  },
  snooker: {
    id: "snooker",
    displayName: "斯诺克",
    version: "WPBSA Official Rules 2024–25",
    reviewedOn: "2026-07-27",
    sourceUrls: [
      "https://wpbsa.com/wp-content/uploads/2198_WPBSA-Rulebook-2024-25.pdf",
    ],
    break: "首杆从 D 区内摆放母球，先击红球。",
    ballInHand: "母球入袋后在 D 区内自由摆球。",
    grouping: "红球阶段按红球、彩球交替；红球清完后按彩球分值顺序。",
    fouls: ["未先碰目标球", "母球入袋", "非目标球入袋", "球离台"],
    scoring: "红球 1 分，彩球 2–7 分；犯规罚分至少 4 分。",
    letStroke: "当前实现不判自由球和重摆。",
    reset: "红球阶段彩球复位；清彩阶段合法入袋后不复位。",
  },
  fourball: {
    id: "fourball",
    displayName: "四球追分",
    version: "项目选定 1/4/7/10 追分规则 2026.07",
    reviewedOn: "2026-07-27",
    sourceUrls: [
      "https://tw.zzlgxy.net/i/H202510185713000033282.shtml",
      "https://www.sohu.com/a/788879095_121894857",
      "https://www.sohu.com/a/905439520_121608857",
    ],
    break: "开球线后摆放母球，先碰当前目标球。",
    ballInHand: "犯规后对手在开球线后自由摆球。",
    grouping: "按当前目标顺序追球；允许合法传九。",
    fouls: ["母球落袋或离台", "未先碰当前目标球", "击球后无球入袋且无球触库"],
    scoring: "犯规 -1；普通胜局或传九 +4；小金 +7；大金 +10。",
    letStroke: "仅接手时母球到目标球中心线被遮挡才可让杆，连续进球中不可让杆。",
    reset: "非法入袋的关键球按规则复位，胜局后重新摆球。",
  },
  threecushion: {
    id: "threecushion",
    displayName: "三库",
    version: "UMB Statutes and Rules 2025 基线",
    reviewedOn: "2026-07-27",
    sourceUrls: [
      "https://www.umb-carom.org/uploads/documents/wifwnpfs.bz0.pdf",
    ],
    break: "使用指定母球开球。",
    ballInHand: "无自由球摆放。",
    grouping: "无分组。",
    fouls: ["球离台", "非法触球"],
    scoring: "母球在碰到第二颗目标球前累计至少三次碰库得 1 分。",
    letStroke: "不使用让杆。",
    reset: "按开伦规则复位离台球。",
  },
  sagu: {
    id: "sagu",
    displayName: "四球开伦",
    version: "Break Builder legacy",
    reviewedOn: "2026-07-27",
    sourceUrls: [],
    break: "使用指定母球开球。",
    ballInHand: "无自由球摆放。",
    grouping: "无分组。",
    fouls: ["球离台", "非法触球"],
    scoring: "按项目既有四球开伦计分。",
    letStroke: "不使用让杆。",
    reset: "按项目既有规则复位。",
  },
  "threecushion-drill": {
    id: "threecushion-drill",
    displayName: "三库练习",
    version: "Break Builder drill",
    reviewedOn: "2026-07-27",
    sourceUrls: [],
    break: "练习局任意摆放母球。",
    ballInHand: "始终允许摆放母球。",
    grouping: "无分组。",
    fouls: [],
    scoring: "完成三库线路后累计练习连杆。",
    letStroke: "不使用让杆。",
    reset: "练习失败后恢复杆前局面。",
  },
}

export const RULE_PROFILES: Readonly<Record<RuleProfileId, RuleProfile>> =
  Object.freeze(profiles)

export function ruleProfileFor(ruletype: string): RuleProfile {
  if (ruletype in RULE_PROFILES) {
    return RULE_PROFILES[ruletype as RuleProfileId]
  }
  return RULE_PROFILES.nineball
}
