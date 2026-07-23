const ZH_TEXT: Record<string, string> = {
  Hit: "击球",
  Continue: "继续",
  Restore: "恢复",
  "Place\nBall": "摆放\n母球",
  FOUL: "犯规",
  "Ball in hand": "自由球",
  "Cue ball potted": "母球落袋",
  "White potted": "母球落袋",
  "No ball hit": "未击中任何球",
  "Wrong ball hit first": "首先击中的球不合法",
  "Wrong ball": "击球顺序错误",
  "Wrong group hit first": "首先击中了对方球组",
  "No cushion after contact": "碰球后没有球触库或落袋",
  "Illegal break: fewer than four object balls reached a cushion":
    "开球犯规：干开时少于四颗目标球触库",
  "Hitting the 8-ball first is a foul": "过早先击中 8 号球",
  "Must hit 8-ball first": "必须先击中 8 号球",
  "8-ball pocketed early": "过早打进 8 号球",
  "8-ball pocketed on foul": "犯规时打进 8 号球",
  "Cue ball potted on the break": "开球时母球落袋",
  "Hit red instead of colour": "应击彩球时先击中红球",
  "Red potted instead of colour": "应打彩球时误进红球",
  "Foul: Contacted the opponent's cue ball!": "犯规：碰到了对手的母球",
  "Foul: No ball hit": "犯规：未击中任何球",
  "YOU WON": "你赢了",
  "YOU LOST": "你输了",
  "GAME OVER": "比赛结束",
  "Replay Complete": "回放结束",
  "System error": "系统错误",
  "please return to lobby": "请返回首页后重试",
  "Waiting for opponent to join": "正在等待对手加入",
  "Concede Game": "认输",
  "opponent will win": "确认后对手将获胜",
  "opponent conceded": "对手已认输",
  "Lostber 🦞": "被龙虾击败了 🦞",
}

export function localizeText(text?: string): string {
  if (!text) return ""
  const exact = ZH_TEXT[text]
  if (exact) return exact

  const foulPoints = /^Foul \((\d+) points\)$/.exec(text)
  if (foulPoints) return `犯规（${foulPoints[1]} 分）`

  return text
}
