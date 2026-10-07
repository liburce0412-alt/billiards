import { useEffect, useRef, useState, type FormEvent } from "react"
import { useSearchParams } from "react-router"
import { apiJson, isLocalDemo, type PlatformMe } from "../platform/api"
import {
  normaliseRoomCode,
  type AnyRoomLaunchDescriptor,
  type TableTennisRoomDescriptor,
} from "../launcherconfig"
import { AppShell } from "./shell"
import { useViewportSnapshot } from "./stores"

type Environment = "cyber-arena" | "sports-hall"
type Mode = "practice" | "ai" | "online"
type Difficulty = "easy" | "medium" | "hard"
type Friend = { id: string; displayName: string }
const selectionKey = "break-builder-tt-selection-v1"
function savedSelection(): {
  environment?: Environment
  mode?: Mode
  difficulty?: Difficulty
} {
  try {
    return JSON.parse(localStorage.getItem(selectionKey) || "{}") || {}
  } catch {
    return {}
  }
}
type MatchResult = {
  id: string
  winner_id: string | null
  reason: string
  score_json: string
  ended_at: number
}

function resultLabel(result: MatchResult, userId: string): string {
  if (!result.winner_id) return "已结束"
  return result.winner_id === userId ? "获胜" : "落败"
}

function startLabel(busy: boolean, mode: Mode, roomCode: string): string {
  if (busy) return "正在准备房间…"
  if (mode !== "online") return "进入球场"
  return roomCode.trim() ? "加入好友比赛" : "创建好友比赛"
}

export function TableTennisRoute({ session }: { session: PlatformMe }) {
  const [params, setParams] = useSearchParams()
  const viewport = useViewportSnapshot()
  const host = useRef<HTMLDivElement>(null)
  const [environment, setEnvironment] = useState<Environment>(
    (params.get("environment") || savedSelection().environment) ===
      "sports-hall"
      ? "sports-hall"
      : "cyber-arena"
  )
  const [mode, setMode] = useState<Mode>(() => {
    const saved = savedSelection().mode
    return saved === "practice" || saved === "online" ? saved : "ai"
  })
  const [difficulty, setDifficulty] = useState<Difficulty>(() => {
    const saved = savedSelection().difficulty
    return saved === "easy" || saved === "hard" ? saved : "medium"
  })
  const [roomCode, setRoomCode] = useState("")
  const [friendId, setFriendId] = useState("")
  const [friends, setFriends] = useState<Friend[]>([])
  const [results, setResults] = useState<MatchResult[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [attempt, setAttempt] = useState(0)
  const requestedMode = params.get("mode")
  const gameMode: Mode | null =
    requestedMode === "ai" ||
    requestedMode === "practice" ||
    requestedMode === "online"
      ? requestedMode
      : null
  const roomId = params.get("room") ?? ""
  const requestedDifficulty = params.get("difficulty")
  const gameDifficulty: Difficulty =
    requestedDifficulty === "easy" || requestedDifficulty === "hard"
      ? requestedDifficulty
      : "medium"
  const gameEnvironment: Environment =
    params.get("environment") === "sports-hall" ? "sports-hall" : "cyber-arena"
  const rotate = viewport.coarsePointer && viewport.orientation === "portrait"
  useEffect(() => {
    try {
      localStorage.setItem(
        selectionKey,
        JSON.stringify({ environment, mode, difficulty })
      )
    } catch {
      /* Optional preference. */
    }
  }, [environment, mode, difficulty])

  function exitGame() {
    setError("")
    setParams(isLocalDemo() ? { platformDemo: "1" } : {})
  }

  useEffect(() => {
    if (!session.capabilities.online || isLocalDemo() || gameMode) return
    let active = true
    void apiJson<{ friends: Friend[] }>("/api/social/friends")
      .then((response) => {
        if (active) setFriends(response.friends)
      })
      .catch(() => undefined)
    void apiJson<{ results: MatchResult[] }>("/api/table-tennis/results")
      .then((response) => {
        if (active) setResults(response.results)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [session.capabilities.online, gameMode])

  useEffect(() => {
    document.body.classList.add("app-platform-route")
    document.body.classList.toggle("app-table-tennis-route", Boolean(gameMode))
    return () => document.body.classList.remove("app-table-tennis-route")
  }, [gameMode])

  useEffect(() => {
    if (!gameMode || rotate || !host.current) return
    let active = true
    let handle: { dispose(): void } | undefined
    const target = host.current
    setError("")
    async function mount() {
      if (gameMode === "online") {
        if (!session.capabilities.online || !roomId)
          throw new Error("请先创建或加入好友房间")
        const response = await apiJson<{ room: AnyRoomLaunchDescriptor }>(
          `/api/rooms/${encodeURIComponent(roomId)}`
        )
        if (response.room.gameType !== "table-tennis")
          throw new Error("这个房间是台球房间，请从台球入口进入")
      }
      const engine = await import("../../packages/table-tennis/src/browser")
      if (!active) return
      const websocketUrl = new URL(
        `/ws/game/${encodeURIComponent(roomId)}?v=1`,
        location.href
      )
      websocketUrl.protocol = location.protocol === "https:" ? "wss:" : "ws:"
      handle = await engine.mountTableTennis({
        container: target,
        mode: gameMode!,
        difficulty: gameDifficulty,
        environment: gameEnvironment,
        assetBaseUrl: "/models/table-tennis/",
        preferences: {
          quality: session.preferences.quality,
          masterVolume: session.preferences.master_volume,
          reducedMotion: Boolean(session.preferences.reduced_motion),
        },
        session: {
          localPlayerId: session.user.id,
          displayName: session.user.displayName,
          avatarUrl: session.user.avatarUrl ?? undefined,
          websocketUrl: gameMode === "online" ? websocketUrl.href : undefined,
        },
        onExit: exitGame,
      })
      if (!active) handle.dispose()
    }
    void mount().catch((reason: unknown) => {
      if (active)
        setError(reason instanceof Error ? reason.message : "乒乓球加载失败")
    })
    return () => {
      active = false
      handle?.dispose()
    }
  }, [
    gameMode,
    roomId,
    gameDifficulty,
    gameEnvironment,
    rotate,
    attempt,
    session,
  ])

  function launch(nextMode: Mode, room?: TableTennisRoomDescriptor) {
    const next = new URLSearchParams({
      mode: nextMode,
      environment: room?.environmentStyle ?? environment,
      difficulty,
    })
    if (room) {
      next.set("room", room.id)
      next.set("code", room.code)
    }
    if (isLocalDemo()) next.set("platformDemo", "1")
    setParams(next)
  }

  async function start(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    if (mode !== "online") {
      launch(mode)
      return
    }
    setBusy(true)
    setError("")
    try {
      if (!session.capabilities.online || isLocalDemo())
        throw new Error(
          "好友联机需要已获联机权限的真实账号；本地演示可先体验练习和 AI"
        )
      const code = normaliseRoomCode(roomCode)
      let room: AnyRoomLaunchDescriptor
      if (code) {
        const lookup = await apiJson<{ room: AnyRoomLaunchDescriptor }>(
          `/api/rooms/code/${encodeURIComponent(code)}`
        )
        if (lookup.room.gameType !== "table-tennis")
          throw new Error("这个房间码对应台球比赛，请从台球入口加入")
        room = (
          await apiJson<{ room: AnyRoomLaunchDescriptor }>(
            `/api/rooms/${lookup.room.id}/join`,
            { method: "POST", body: "{}" }
          )
        ).room
      } else {
        room = (
          await apiJson<{ room: TableTennisRoomDescriptor }>("/api/rooms", {
            method: "POST",
            body: JSON.stringify({
              gameType: "table-tennis",
              ruleType: "singles-11",
              environmentStyle: environment,
            }),
          })
        ).room
        if (friendId)
          await apiJson("/api/invites", {
            method: "POST",
            body: JSON.stringify({
              challengeeId: friendId,
              roomId: room.id,
              expiresInSeconds: 120,
            }),
          })
      }
      if (room.gameType !== "table-tennis") throw new Error("房间类型不匹配")
      launch("online", room)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "无法进入房间")
    } finally {
      setBusy(false)
    }
  }

  if (gameMode)
    return (
      <main className="tt-route-game">
        {rotate ? (
          <div className="tt-route-message">
            <h1>横放设备，开始对拉</h1>
            <p>横屏可以完整看到球台和来球。</p>
            <button onClick={exitGame}>返回设置</button>
          </div>
        ) : (
          <div ref={host} className="tt-game-host" />
        )}
        {gameMode === "online" && params.get("code") && (
          <div className="tt-room-code">房间 {params.get("code")}</div>
        )}
        {error && (
          <div role="alert" className="tt-route-message">
            <h2>暂时无法进入球场</h2>
            <p>{error}</p>
            <button onClick={() => setAttempt((value) => value + 1)}>
              重试
            </button>
            <button onClick={exitGame}>返回设置</button>
          </div>
        )}
      </main>
    )

  return (
    <AppShell
      session={session}
      active="play"
      eyebrow="BREAK BUILDER / TABLE TENNIS"
      title="下一拍，打出你的节奏。"
      description="3D 乒乓球 · 11 分单打 · 三局两胜"
    >
      <div className="tt-mode-links">
        <a href={isLocalDemo() ? "/?platformDemo=1" : "/"}>台球</a>
        <span aria-current="page">乒乓球</span>
      </div>
      <form className="tt-launcher" onSubmit={start}>
        <section className="tt-scenes" aria-label="乒乓球场景">
          {(
            [
              ["cyber-arena", "赛博竞技馆", "冷光结构 · 开阔看台 · 亮台对拉"],
              ["sports-hall", "真实体育馆", "日光木地板 · 专业球台 · 轻盈空间"],
            ] as const
          ).map(([id, name, description]) => (
            <button
              key={id}
              type="button"
              className={`tt-scene tt-scene--${id}`}
              aria-pressed={environment === id}
              onClick={() => setEnvironment(id)}
            >
              <img
                className="tt-scene__image"
                src={`/images/table-tennis/${id}.png`}
                alt={`${name}的球台与场馆模型预览`}
              />
              {environment === id && (
                <span className="tt-scene__selected">✓ 当前球场</span>
              )}
              <span className="tt-scene__copy">
                <span>
                  {id === "cyber-arena" ? "CYBER ARENA" : "SPORTS HALL"}
                </span>
                <strong>{name}</strong>
                <small>{description}</small>
              </span>
            </button>
          ))}
        </section>
        <section className="tt-config">
          <p className="tt-config__eyebrow">YOUR NEXT RALLY</p>
          <h2>选好球场，来一局。</h2>
          <p>先练一拍轻推，再试试加转与强攻。你的上次选择会留在这里。</p>
          <label>
            比赛方式
            <select
              value={mode}
              onChange={(event) => setMode(event.target.value as Mode)}
            >
              <option value="ai">AI 对战</option>
              <option value="practice">自由练习</option>
              <option value="online">好友联机</option>
            </select>
          </label>
          {mode === "ai" && (
            <label>
              AI 难度
              <select
                value={difficulty}
                onChange={(event) =>
                  setDifficulty(event.target.value as Difficulty)
                }
              >
                <option value="easy">入门</option>
                <option value="medium">进阶</option>
                <option value="hard">挑战</option>
              </select>
            </label>
          )}
          {mode === "online" && (
            <>
              <label>
                加入房间
                <input
                  value={roomCode}
                  onChange={(event) => setRoomCode(event.target.value)}
                  placeholder="输入房间码；留空创建新房间"
                  maxLength={24}
                />
              </label>
              {!roomCode.trim() && (
                <label>
                  邀请好友
                  <select
                    value={friendId}
                    onChange={(event) => setFriendId(event.target.value)}
                  >
                    <option value="">创建后分享房间码</option>
                    {friends.map((friend) => (
                      <option key={friend.id} value={friend.id}>
                        {friend.displayName}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <p>双方准备后开始。断线暂停，30 秒内可以重新连接。</p>
            </>
          )}
          <p>
            鼠标瞄准，左键或空格按住蓄力、松开挥拍。Q/W/E/R
            可直接出轻挡、平击、上旋、扣杀；触屏一笔滑动出拍。系统辅助脚步，方向、力度和触球时机由你决定。
          </p>
          <div className="tt-quick-guide" aria-label="可用球技">
            <span>轻挡 Q</span>
            <span>平击 W</span>
            <span>上旋</span>
            <span>扣杀</span>
            <span>侧旋调节</span>
          </div>
          <a
            href={
              isLocalDemo()
                ? "/tools?platformDemo=1#ttControlsTitle"
                : "/tools#ttControlsTitle"
            }
          >
            查看完整操作说明
          </a>
          <button className="tt-launch" type="submit" disabled={busy}>
            {startLabel(busy, mode, roomCode)}
          </button>
          {error && <p role="alert">{error}</p>}
        </section>
      </form>
      {results.length > 0 && (
        <section className="tt-history">
          <h2>最近的好友比赛</h2>
          {results.slice(0, 5).map((result) => (
            <p key={result.id}>
              <strong>{resultLabel(result, session.user.id)}</strong> ·{" "}
              {new Date(result.ended_at).toLocaleString("zh-CN")} ·{" "}
              {result.reason === "forfeit" ? "弃权结束" : "完成比赛"}
            </p>
          ))}
        </section>
      )}
    </AppShell>
  )
}
