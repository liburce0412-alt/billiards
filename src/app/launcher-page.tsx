import { useEffect, useMemo, useState, type FormEvent } from "react"
import type { PlatformMe } from "../platform/api"
import { apiJson, isLocalDemo } from "../platform/api"
import {
  buildGameUrl,
  applyRoomDemoOptions,
  generateRoomCode,
  normaliseRoomCode,
  type LauncherOpponent,
  type LauncherQuality,
  type LauncherRule,
  type LauncherSelection,
  type RoomLaunchDescriptor,
  type AnyRoomLaunchDescriptor,
  tableTennisRoomUrl,
} from "../launcherconfig"
import { cueOptions, environmentOptions, tableOptions } from "./catalog"
import { AppShell } from "./shell"
import { applyPersonalisation } from "../platform/shell"
import { publishVerifiedGameIdentity } from "../platform/gameidentity"
import {
  renderQualityModeForPreference,
  saveRenderQualityMode,
  serverQualityForRenderMode,
} from "../view/renderquality"

const rules: Array<[LauncherRule, string, string]> = [
  ["nineball", "九球", "按号码顺序，节奏快"],
  ["eightball", "八球", "全色与花色分组"],
  ["fourball", "四球追分", "连续进攻，计算走位"],
  ["snooker", "斯诺克", "控球与长台策略"],
  ["threecushion", "三库", "无袋开伦，精确线路"],
]

const opponents: Array<[LauncherOpponent, string, string]> = [
  ["practice", "自由练习", "不计比分，自由摆球"],
  ["ai", "AI 对战", "11 档本地智能"],
  ["local", "同屏双人", "同一设备轮流击球"],
  ["online", "房间联机", "好友、邀请与准备状态"],
]

function qualityLabel(quality: LauncherQuality) {
  if (quality === "adaptive") return "观感优先自适应"
  if (quality === "high") return "锁定展示画质"
  if (quality === "balanced") return "兼容均衡"
  return "兼容省电"
}

async function requestImmersiveLandscape() {
  if (!matchMedia("(pointer: coarse)").matches) return
  try {
    await document.documentElement.requestFullscreen?.({ navigationUI: "hide" })
  } catch {
    // Browsers may reject fullscreen while still allowing landscape play.
  }
  try {
    await screen.orientation?.lock?.("landscape")
  } catch {
    // The game route keeps a safe landscape browser layout as fallback.
  }
}

export function LauncherPage({ session }: { session: PlatformMe }) {
  const invite = useMemo(() => {
    const params = new URLSearchParams(globalThis.location.search)
    const inviteRule = params.get("rule")
    const inviteEnvironment = params.get("environment")
    return {
      roomCode: normaliseRoomCode(params.get("join") ?? ""),
      rule: rules.some(([id]) => id === inviteRule)
        ? (inviteRule as LauncherRule)
        : "eightball",
      quality: renderQualityModeForPreference(
        session.preferences.quality,
        params
      ),
      environmentStyle: environmentOptions.some(
        ([id]) => id === inviteEnvironment
      )
        ? inviteEnvironment!
        : session.user.environmentStyle,
    }
  }, [session.preferences.quality, session.user.environmentStyle])
  const [rule, setRule] = useState<LauncherRule>(invite.rule)
  const [opponent, setOpponent] = useState<LauncherOpponent>(
    invite.roomCode ? "online" : "ai"
  )
  const [quality, setQuality] = useState<LauncherQuality>(invite.quality)
  const [botLevel, setBotLevel] = useState(5)
  const [cueStyle, setCueStyle] = useState(session.user.cueStyle)
  const [tableStyle, setTableStyle] = useState(session.user.tableStyle)
  const [environmentStyle, setEnvironmentStyle] = useState(
    invite.environmentStyle
  )
  const [onlineAction, setOnlineAction] = useState<"create" | "join">(
    invite.roomCode ? "join" : "create"
  )
  const [roomCode, setRoomCode] = useState(
    invite.roomCode || generateRoomCode()
  )
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState("准备就绪")

  useEffect(() => {
    saveRenderQualityMode(quality)
  }, [quality])

  const selectedRule = useMemo(() => rules.find(([id]) => id === rule)!, [rule])

  async function start(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    void requestImmersiveLandscape()
    setBusy(true)
    setStatus(opponent === "online" ? "正在确认服务端房间" : "正在装载球桌")
    const selection: LauncherSelection = {
      rule,
      opponent,
      quality,
      botLevel,
      cueStyle,
      player1Name: session.user.displayName,
      player1Cue: cueStyle,
      tableStyle,
      environmentStyle,
      onlineAction,
      roomCode,
      onlineUserId: session.user.id,
      onlinePlayerName: session.user.displayName,
    }
    const serverQuality = serverQualityForRenderMode(quality)
    try {
      saveRenderQualityMode(quality)
      applyPersonalisation({
        ...session,
        user: { ...session.user, cueStyle, tableStyle, environmentStyle },
        preferences: { ...session.preferences, quality: serverQuality },
      })
      void apiJson<PlatformMe>("/api/me", {
        method: "PATCH",
        keepalive: true,
        body: JSON.stringify({
          cueStyle,
          tableStyle,
          environmentStyle,
          preferences: { quality: serverQuality },
        }),
      })
        .then(publishVerifiedGameIdentity)
        .catch(() => undefined)
      if (opponent === "online") {
        if (!session.capabilities.online)
          throw new Error("账号仍待管理员批准，当前只能离线游玩")
        const code = normaliseRoomCode(roomCode)
        if (onlineAction === "join") {
          const lookup = await apiJson<{ room: AnyRoomLaunchDescriptor }>(
            `/api/rooms/code/${encodeURIComponent(code)}`
          )
          const joined = await apiJson<{ room: AnyRoomLaunchDescriptor }>(
            `/api/rooms/${lookup.room.id}/join`,
            { method: "POST", body: JSON.stringify({}) }
          )
          if (joined.room.gameType === "table-tennis") {
            globalThis.location.assign(tableTennisRoomUrl(joined.room))
            return
          }
          Object.assign(selection, {
            roomInstanceId: joined.room.id,
            roomCode: joined.room.code,
            rule: joined.room.ruleType,
            tableStyle: joined.room.tableStyle,
            environmentStyle: joined.room.environmentStyle,
          })
          applyRoomDemoOptions(selection, joined.room, session.user.id)
        } else {
          const created = await apiJson<{ room: RoomLaunchDescriptor }>(
            "/api/rooms",
            {
              method: "POST",
              body: JSON.stringify({
                ruleType: rule,
                code: code || undefined,
                options: {
                  quality: serverQuality,
                },
                tableStyle,
                environmentStyle,
              }),
            }
          )
          selection.roomInstanceId = created.room.id
          selection.roomCode = created.room.code
          applyRoomDemoOptions(selection, created.room, session.user.id)
        }
      }
      const target = new URL(
        await buildGameUrl(selection, globalThis.location.href)
      )
      target.pathname = "/play"
      globalThis.location.assign(target)
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : "比赛启动失败")
      setBusy(false)
    }
  }

  return (
    <AppShell
      session={session}
      active="play"
      eyebrow="BREAK BUILDER / PLAY"
      title="下一局，由你开场。"
      description="选一个喜欢的场景，练习走位，或与好友切磋。"
    >
      <div className="holo-segmented" aria-label="运动模式">
        <span aria-current="page">台球</span>
        <a
          href={
            isLocalDemo() ? "/table-tennis?platformDemo=1" : "/table-tennis"
          }
        >
          乒乓球 · 3D 对战
        </a>
      </div>
      <form className="holo-launcher" onSubmit={start}>
        <section className="holo-launcher__mission">
          <figure className="holo-scene-preview">
            <img
              src={`/images/environments/${environmentStyle}.webp`}
              alt={`${environmentOptions.find(([id]) => id === environmentStyle)?.[1]}游戏实景`}
              width="1440"
              height="900"
            />
            <figcaption>
              <span>场景实拍 · 象牙球台示意</span>
              <h2>
                {
                  environmentOptions.find(
                    ([id]) => id === environmentStyle
                  )?.[1]
                }
              </h2>
            </figcaption>
          </figure>
          <fieldset className="holo-environment-picker">
            <legend>
              选择你的球场 <span>8 个独立场景</span>
            </legend>
            {environmentOptions.map(([id, name]) => (
              <button
                key={id}
                type="button"
                aria-label={`选择${name}`}
                aria-pressed={environmentStyle === id}
                onClick={() => setEnvironmentStyle(id)}
              >
                <img
                  src={`/images/environments/${id}.webp`}
                  alt=""
                  width="1440"
                  height="900"
                  loading="lazy"
                />
                <span>{name.replace("SPECTRA ", "")}</span>
              </button>
            ))}
          </fieldset>
          <div className="holo-launcher__facts">
            <span>
              <small>当前玩法</small>
              <strong>{selectedRule[1]}</strong>
            </span>
            <span>
              <small>操作</small>
              <strong>鼠标 / 触控</strong>
            </span>
            <span>
              <small>移动设备</small>
              <strong>横屏开球</strong>
            </span>
          </div>
        </section>

        <section className="holo-launcher__controls">
          <fieldset className="holo-choice-grid holo-choice-grid--rules">
            <legend>01 · 选择玩法</legend>
            {rules.map(([id, title, detail]) => (
              <label key={id} data-selected={rule === id}>
                <input
                  type="radio"
                  name="rule"
                  value={id}
                  checked={rule === id}
                  onChange={() => setRule(id)}
                />
                <span>
                  {title}
                  <small>{detail}</small>
                </span>
                <i>{id === "threecushion" ? "3" : title.slice(0, 1)}</i>
              </label>
            ))}
          </fieldset>

          <fieldset className="holo-segmented">
            <legend>02 · 选择对手</legend>
            {opponents.map(([id, title]) => (
              <label
                key={id}
                data-disabled={id === "online" && !session.capabilities.online}
              >
                <input
                  type="radio"
                  name="opponent"
                  value={id}
                  checked={opponent === id}
                  disabled={id === "online" && !session.capabilities.online}
                  onChange={() => setOpponent(id)}
                />
                <span>{title}</span>
              </label>
            ))}
          </fieldset>

          <div className="holo-launcher__submit">
            <span>
              <small>当前方案</small>
              <strong>
                {selectedRule[1]} ·{" "}
                {opponents.find(([id]) => id === opponent)?.[1]} ·{" "}
                {qualityLabel(quality)}
              </strong>
              <em aria-live="polite">{status}</em>
            </span>
            <button id="launcherStart" type="submit" disabled={busy}>
              <span>{busy ? "正在装台" : "进入比赛"}</span>
              <i className="ph ph-arrow-right" />
            </button>
          </div>
          <section className="holo-config-panel">
            <header>
              <div>
                <p>03 · 比赛设置</p>
                <h2>{opponents.find(([id]) => id === opponent)?.[1]}</h2>
              </div>
              <span>开局时保存偏好</span>
            </header>
            {opponent === "ai" && (
              <label className="holo-field holo-field--wide">
                <span>
                  AI 能力 <b>{botLevel} / 11</b>
                </span>
                <input
                  type="range"
                  min="1"
                  max="11"
                  value={botLevel}
                  onChange={(event) => setBotLevel(Number(event.target.value))}
                />
              </label>
            )}
            <div className="holo-config-grid">
              <label className="holo-field">
                <span>画质</span>
                <select
                  aria-label="画质"
                  value={quality}
                  onChange={(event) =>
                    setQuality(event.target.value as LauncherQuality)
                  }
                >
                  <option value="adaptive">观感优先自适应</option>
                  <option value="high">锁定展示画质</option>
                  <option value="balanced">兼容 · 均衡</option>
                  <option value="low">兼容 · 省电</option>
                </select>
              </label>
              <label className="holo-field">
                <span>球杆</span>
                <select
                  aria-label="球杆"
                  value={cueStyle}
                  onChange={(event) => setCueStyle(event.target.value)}
                >
                  {cueOptions.map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="holo-field">
                <span>球台</span>
                <select
                  aria-label="球台"
                  value={tableStyle}
                  onChange={(event) => setTableStyle(event.target.value)}
                >
                  {tableOptions.map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="holo-field">
                <span>环境</span>
                <select
                  aria-label="环境"
                  value={environmentStyle}
                  onChange={(event) => setEnvironmentStyle(event.target.value)}
                >
                  {environmentOptions.map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {opponent === "online" && (
              <div className="holo-room-panel">
                <div className="holo-segmented holo-segmented--compact">
                  <label>
                    <input
                      type="radio"
                      checked={onlineAction === "create"}
                      onChange={() => setOnlineAction("create")}
                    />
                    <span>创建房间</span>
                  </label>
                  <label>
                    <input
                      type="radio"
                      checked={onlineAction === "join"}
                      onChange={() => setOnlineAction("join")}
                    />
                    <span>加入房间</span>
                  </label>
                </div>
                <label className="holo-field holo-field--wide">
                  <span>
                    自定义房间码 <b>3–24 字符</b>
                  </span>
                  <div className="holo-room-code">
                    <input
                      id="roomCode"
                      name="roomCode"
                      minLength={3}
                      maxLength={24}
                      value={roomCode}
                      onChange={(event) =>
                        setRoomCode(normaliseRoomCode(event.target.value))
                      }
                    />
                    <button
                      type="button"
                      onClick={() => setRoomCode(generateRoomCode())}
                    >
                      随机
                    </button>
                  </div>
                </label>
              </div>
            )}
          </section>
        </section>
      </form>
    </AppShell>
  )
}
