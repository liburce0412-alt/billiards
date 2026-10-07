import type { PlatformMe } from "../platform/api"
import { AppShell } from "./shell"

const rules = [
  ["九球", "按号码顺序击打；合法开球后，先完成 9 号球的一方获胜。"],
  [
    "八球",
    "全色与花色分组；清空本组后合法打进 8 号球。进球数相同也不代表平局，胜负由 8 号球的合法性决定。",
  ],
  ["四球追分", "按 1、2、3、9 的顺序追分，强调走位与连续得分。"],
  ["斯诺克", "红球和彩球交替进攻，以总分决定胜负。"],
  ["三库", "母球依次接触两颗目标球，并在第二次碰撞前触碰至少三次库边。"],
] as const

export function RulesPage({ session }: { session: PlatformMe }) {
  return (
    <AppShell
      session={session}
      active="rules"
      eyebrow="RULES / FAIR PLAY"
      title="规则与比赛说明"
      description="从击球顺序到获胜条件，找到适合自己的玩法。"
    >
      <section className="holo-rule-grid">
        {rules.map(([title, detail], index) => (
          <article className="holo-glass-card" key={title}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <h2>{title}</h2>
            <p>{detail}</p>
          </article>
        ))}
      </section>
      <section className="holo-legal holo-glass-card">
        <div>
          <p>LICENSE</p>
          <h2>GPL-3.0</h2>
        </div>
        <p>
          本项目采用 GPL-3.0
          许可证，保留相关版权与许可信息。在线比赛请尊重对手；遇到骚扰，可在对话中使用举报功能。
        </p>
      </section>
    </AppShell>
  )
}
