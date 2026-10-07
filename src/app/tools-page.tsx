import { isLocalDemo, type PlatformMe } from "../platform/api"
import { AppShell } from "./shell"

const tools = [
  [
    "台球操作帮助",
    "/help.html",
    "ph-compass-tool",
    "瞄准、旋转、俯仰、相机与蓄力说明",
  ],
  ["网络诊断", "/net.html", "ph-network", "检查实时房间与网络状态"],
  ["Warp 工具", "/warp.html", "ph-wave-sine", "轨迹与碰撞实验工具"],
  ["多视窗诊断", "/m2.html", "ph-browsers", "并排检查大厅布局与会话隔离"],
] as const

export function ToolsPage({ session }: { session: PlatformMe }) {
  return (
    <AppShell
      session={session}
      active="tools"
      eyebrow="HELP / UTILITIES"
      title="打得顺手，也玩得明白。"
      description="查看击球操作，或使用诊断工具排查问题。"
    >
      <section
        className="holo-panel tt-control-guide"
        aria-labelledby="ttControlsTitle"
        data-glass="optical"
      >
        <p className="platform-eyebrow">TABLE TENNIS / CONTROLS</p>
        <h2 id="ttControlsTitle">乒乓球：看住来球，松手出拍</h2>
        <p>
          先在练习模式完成发球，再尝试轻重击和旋转。比分按每局 11 分、净胜 2
          分计算，三局两胜；局内同时显示小分、胜局和发球方。
        </p>
        <dl>
          <div>
            <dt>鼠标</dt>
            <dd>
              左右移动瞄准。轻点左键轻挡；按住短暂蓄力，松开挥拍。向上刷带上旋，向下刷带下旋，水平位置仍决定方向。
            </dd>
          </div>
          <div>
            <dt>键盘 + 鼠标</dt>
            <dd>
              鼠标瞄准，按住 <kbd>Q</kbd> 轻挡、<kbd>W</kbd> 平击、<kbd>E</kbd>{" "}
              上旋或 <kbd>R</kbd> 扣杀，松键出拍。按住时间改变力度，<kbd>A</kbd>{" "}
              / <kbd>D</kbd> 加侧旋。<kbd>Space</kbd> 使用当前默认球技。
            </dd>
          </div>
          <div>
            <dt>触屏</dt>
            <dd>
              在球场内一笔滑动，松手出拍；短慢动作轻打，向上刷或向下切带旋转。横屏留出观察来球的空间。想扣杀或精调时，可提前展开球技面板。
            </dd>
          </div>
          <div>
            <dt>时机与球路</dt>
            <dd>
              接球先等球在己方落台，靠近球拍时释放。过早或太晚可能挥空；扣杀适合高球，低球强扣可能下网。看触球和落台结果调整下一拍。
            </dd>
          </div>
          <div>
            <dt>练习与重看</dt>
            <dd>
              练习模式按发球、轻重击、旋转逐步引导。可以跳过，在比赛菜单重新查看；本地练习和
              AI 对局可从菜单重新开始，联机不会自行重置双方比赛。
            </dd>
          </div>
        </dl>
        <a
          className="platform-soft-button"
          href={
            isLocalDemo()
              ? "/table-tennis?mode=practice&platformDemo=1"
              : "/table-tennis?mode=practice"
          }
        >
          进入乒乓球练习
        </a>
      </section>
      <section className="holo-tool-grid">
        {tools.map(([title, href, icon, detail]) => (
          <a className="holo-tool-card" href={href} key={href}>
            <i className={`ph ${icon}`} aria-hidden="true" />
            <span>
              <strong>{title}</strong>
              <small>{detail}</small>
            </span>
            <i className="ph ph-arrow-up-right" aria-hidden="true" />
          </a>
        ))}
      </section>
    </AppShell>
  )
}
