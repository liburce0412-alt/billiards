import {
  buildGameUrl,
  buildInviteUrl,
  generateRoomCode,
  LauncherOpponent,
  LauncherOnlineAction,
  LauncherQuality,
  LauncherRule,
  LauncherSelection,
  normaliseRoomCode,
  shouldShowLauncher,
} from "./launcherconfig"
import { CUE_STYLES } from "./view/cuestyle"

const storageKey = "billiards-launcher-selection"
const onlineUserIdKey = "billiards-online-user-id"

const ruleDetails: Record<
  LauncherRule,
  { number: string; name: string; description: string; meta: string }
> = {
  nineball: {
    number: "9",
    name: "九球",
    description: "按号码顺序进攻，节奏快，线路清晰。",
    meta: "有袋 · 轮转",
  },
  eightball: {
    number: "8",
    name: "八球",
    description: "全色与花色分组，最后处理黑八。",
    meta: "有袋 · 分组",
  },
  fourball: {
    number: "4",
    name: "四球追分",
    description: "依次进攻 1、2、3、9，按 1/4/7/10 追分。",
    meta: "有袋 · 21 分",
  },
  snooker: {
    number: "S",
    name: "斯诺克",
    description: "红球与彩球交替，强调控制与连续得分。",
    meta: "大台 · 计分",
  },
  threecushion: {
    number: "3",
    name: "三库",
    description: "母球触及三次库边后完成碰球得分。",
    meta: "无袋 · 开伦",
  },
}

const opponentNames: Record<LauncherOpponent, string> = {
  practice: "自由练习",
  ai: "AI 对战",
  local: "同设备双人",
  online: "两台设备联机",
  ClawBreak: "基础 AI",
  TheFarJaw: "进阶 AI",
}

const levelNames = [
  "1 档 · 入门新手",
  "2 档 · 初学瞄准",
  "3 档 · 基础连续进攻",
  "4 档 · 偶尔清台",
  "5 档 · 稳定业余高手",
  "6 档 · 县级第一杆",
  "7 档 · 地区赛强手",
  "8 档 · 市级顶尖",
  "9 档 · 省级强手",
  "10 档 · 全国赛强手",
  "11 档 · 顶级挑战",
]

const qualityNames: Record<LauncherQuality, string> = {
  low: "省电",
  balanced: "均衡",
  high: "高画质",
}

const defaultSelection: LauncherSelection = {
  rule: "eightball",
  opponent: "ai",
  botLevel: 4,
  quality: "high",
  player1Name: "玩家一",
  player2Name: "玩家二",
  player1Cue: "heritage",
  player2Cue: "jade",
  onlineAction: "create",
  roomCode: "",
  onlinePlayerName: "玩家",
}

function isRule(value: unknown): value is LauncherRule {
  return typeof value === "string" && value in ruleDetails
}

function isOpponent(value: unknown): value is LauncherOpponent {
  return typeof value === "string" && value in opponentNames
}

function isQuality(value: unknown): value is LauncherQuality {
  return typeof value === "string" && value in qualityNames
}

function normalizeLevel(value: unknown): number {
  const parsed =
    typeof value === "number" ? value : Number.parseInt(String(value ?? ""))
  return Number.isFinite(parsed)
    ? Math.max(1, Math.min(11, Math.round(parsed)))
    : defaultSelection.botLevel
}

function storedSelection(): Partial<LauncherSelection> {
  try {
    return JSON.parse(localStorage.getItem(storageKey) ?? "{}")
  } catch {
    return {}
  }
}

function selectedQuality(
  params: URLSearchParams,
  stored: Partial<LauncherSelection>
): LauncherQuality {
  let quality = defaultSelection.quality
  if (isQuality(stored.quality)) quality = stored.quality
  const requested = params.get("quality")
  if (isQuality(requested)) quality = requested
  return quality
}

function selectedOpponent(
  stored: Partial<LauncherSelection>,
  joinCode: string
): LauncherOpponent {
  if (joinCode) return "online"
  let opponent = defaultSelection.opponent
  if (isOpponent(stored.opponent)) {
    opponent = stored.opponent
  }
  if (opponent === "ClawBreak" || opponent === "TheFarJaw") return "ai"
  return opponent
}

function selectedRule(
  params: URLSearchParams,
  stored: Partial<LauncherSelection>
): LauncherRule {
  const requested = params.get("rule")
  if (isRule(requested)) return requested
  return isRule(stored.rule) ? stored.rule : defaultSelection.rule
}

function storedString(value: unknown, fallback: string | undefined): string {
  return typeof value === "string" ? value : fallback || ""
}

function readSelection(params: URLSearchParams): LauncherSelection {
  const stored = storedSelection()
  const joinCode = normaliseRoomCode(params.get("join") ?? "")
  return {
    rule: selectedRule(params, stored),
    opponent: selectedOpponent(stored, joinCode),
    botLevel: normalizeLevel(stored.botLevel),
    quality: selectedQuality(params, stored),
    player1Name: storedString(stored.player1Name, defaultSelection.player1Name),
    player2Name: storedString(stored.player2Name, defaultSelection.player2Name),
    player1Cue: storedString(stored.player1Cue, defaultSelection.player1Cue),
    player2Cue: storedString(stored.player2Cue, defaultSelection.player2Cue),
    onlineAction:
      joinCode || stored.onlineAction === "join" ? "join" : "create",
    roomCode: joinCode || "",
    onlinePlayerName: storedString(
      stored.onlinePlayerName,
      defaultSelection.onlinePlayerName
    ),
  }
}

function escapeAttribute(value: string | undefined): string {
  return (value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
}

function checked(name: string, value: string, selected: string) {
  return `<input type="radio" name="${name}" value="${value}" ${
    value === selected ? "checked" : ""
  } />`
}

function ruleOptions(selection: LauncherSelection) {
  return (
    Object.entries(ruleDetails) as [
      LauncherRule,
      (typeof ruleDetails)[LauncherRule],
    ][]
  )
    .map(
      ([value, detail]) => `
        <label class="mode-option" data-rule="${value}">
          ${checked("rule", value, selection.rule)}
          <span class="mode-option__ball" aria-hidden="true">${detail.number}</span>
          <span class="mode-option__copy">
            <strong>${detail.name}</strong>
            <span>${detail.description}</span>
          </span>
          <span class="mode-option__meta">${detail.meta}</span>
        </label>`
    )
    .join("")
}

function cueOptions(selected: string | undefined) {
  return CUE_STYLES.map(
    (style) =>
      `<option value="${style.id}" ${
        selected === style.id ? "selected" : ""
      }>${style.name} · ${style.description}</option>`
  ).join("")
}

function launcherMarkup(selection: LauncherSelection) {
  const levelOptions = levelNames
    .map(
      (name, index) =>
        `<option value="${index + 1}" ${
          selection.botLevel === index + 1 ? "selected" : ""
        }>${name}</option>`
    )
    .join("")
  return `
    <div class="launcher-shell">
      <header class="launcher-nav">
        <a class="launcher-wordmark" href="./" aria-label="Break Builder 首页">
          <span aria-hidden="true">●</span> Break Builder
        </a>
        <div class="launcher-nav__links">
          <a class="launcher-lobby" href="rules.html">规则对照</a>
          <a class="launcher-lobby" href="lobby.html">联机大厅 <span aria-hidden="true">↗</span></a>
        </div>
      </header>

      <main class="launcher-layout">
        <section class="launcher-intro" aria-labelledby="launcherTitle">
          <p class="launcher-kicker">浏览器台球模拟器</p>
          <h1 id="launcherTitle">选一张球桌<br />打好下一杆</h1>
          <p class="launcher-lede">
            五种规则、11 档本地 AI、同屏双人与房间联机。物理结果不随画质改变。
          </p>
          <dl class="launcher-facts">
            <div><dt>物理</dt><dd>固定 1/512 秒</dd></div>
            <div><dt>对战</dt><dd>本地 / 双人 / 联机</dd></div>
            <div><dt>平台</dt><dd>桌面与移动端</dd></div>
          </dl>
        </section>

        <form id="launcherForm" class="launcher-form">
          <fieldset class="launcher-fieldset">
            <legend>选择玩法</legend>
            <div class="mode-index">${ruleOptions(selection)}</div>
          </fieldset>

          <div class="launcher-controls">
            <fieldset class="launcher-fieldset">
              <legend>对手</legend>
              <div class="segment-control segment-control--four">
                <label>${checked("opponent", "practice", selection.opponent)}<span>自由练习</span></label>
                <label>${checked("opponent", "ai", selection.opponent)}<span>AI 对战</span></label>
                <label>${checked("opponent", "local", selection.opponent)}<span>同屏双人</span></label>
                <label>${checked("opponent", "online", selection.opponent)}<span>房间联机</span></label>
              </div>
            </fieldset>

            <fieldset class="launcher-fieldset">
              <legend>AI 能力（1 弱 → 11 强）</legend>
              <label class="level-select">
                <span class="sr-only">AI 能力档位</span>
                <select id="botLevel" name="botLevel">${levelOptions}</select>
              </label>
            </fieldset>

            <fieldset class="launcher-fieldset">
              <legend>画质</legend>
              <div class="segment-control">
                <label>${checked("quality", "low", selection.quality)}<span>省电</span></label>
                <label>${checked("quality", "balanced", selection.quality)}<span>均衡</span></label>
                <label>${checked("quality", "high", selection.quality)}<span>高画质</span></label>
              </div>
            </fieldset>
          </div>

          <fieldset id="localSettings" class="launcher-fieldset launcher-detail-panel" hidden>
            <legend>同屏双方</legend>
            <div class="player-config-grid">
              <label>
                <span>玩家一</span>
                <input name="player1Name" maxlength="16" value="${escapeAttribute(selection.player1Name)}" />
                <select name="player1Cue" aria-label="玩家一球杆">${cueOptions(selection.player1Cue)}</select>
              </label>
              <label>
                <span>玩家二</span>
                <input name="player2Name" maxlength="16" value="${escapeAttribute(selection.player2Name)}" />
                <select name="player2Cue" aria-label="玩家二球杆">${cueOptions(selection.player2Cue)}</select>
              </label>
            </div>
            <p class="launcher-detail-note">每次换人会同步切换姓名、计分高亮和各自球杆。</p>
          </fieldset>

          <fieldset id="onlineSettings" class="launcher-fieldset launcher-detail-panel" hidden>
            <legend>联机房间</legend>
            <div class="online-config-grid">
              <div class="segment-control segment-control--two">
                <label>${checked("onlineAction", "create", selection.onlineAction ?? "create")}<span>创建房间</span></label>
                <label>${checked("onlineAction", "join", selection.onlineAction ?? "create")}<span>加入房间</span></label>
              </div>
              <label class="launcher-input">
                <span>你的名字</span>
                <input name="onlinePlayerName" maxlength="16" value="${escapeAttribute(selection.onlinePlayerName)}" />
              </label>
              <label class="launcher-input">
                <span>房间码</span>
                <input id="roomCode" name="roomCode" maxlength="8" autocomplete="off" value="${escapeAttribute(selection.roomCode)}" />
              </label>
            </div>
            <div id="inviteRow" class="invite-row" hidden>
              <label class="launcher-input">
                <span>邀请链接</span>
                <input id="inviteUrl" readonly />
              </label>
              <button id="copyInvite" type="button">复制邀请</button>
            </div>
            <p class="launcher-detail-note">房主先进入球桌，再把邀请链接发给另一台设备。</p>
          </fieldset>

          <div class="launcher-status" id="launcherStatus" aria-live="polite"></div>
          <div class="launcher-action">
            <p id="launcherSummary"></p>
            <button id="launcherStart" type="submit" data-state="default">
              <span>开始比赛</span><span aria-hidden="true">→</span>
            </button>
          </div>
        </form>
      </main>

      <footer class="launcher-footer">
        <p>GPL-3.0 · TypeScript + Three.js · <a href="rules.html">查看规则与实现差异</a></p>
        <p>方向键选择 · Enter 开始</p>
      </footer>
    </div>`
}

function selectionFromForm(form: HTMLFormElement): LauncherSelection {
  const data = new FormData(form)
  return {
    rule: data.get("rule") as LauncherRule,
    opponent: data.get("opponent") as LauncherOpponent,
    botLevel: normalizeLevel(data.get("botLevel")),
    quality: data.get("quality") as LauncherQuality,
    player1Name: String(data.get("player1Name") ?? ""),
    player2Name: String(data.get("player2Name") ?? ""),
    player1Cue: String(data.get("player1Cue") ?? "heritage"),
    player2Cue: String(data.get("player2Cue") ?? "jade"),
    onlineAction: data.get("onlineAction") as LauncherOnlineAction,
    roomCode: normaliseRoomCode(String(data.get("roomCode") ?? "")),
    onlinePlayerName: String(data.get("onlinePlayerName") ?? ""),
  }
}

function saveSelection(selection: LauncherSelection) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(selection))
  } catch {
    // Local storage can be unavailable in private browsing. The launcher still works.
  }
}

function updateSummary(form: HTMLFormElement) {
  const selection = selectionFromForm(form)
  const summary = document.querySelector<HTMLElement>("#launcherSummary")!
  const opponent =
    selection.opponent === "ai"
      ? levelNames[selection.botLevel - 1]
      : opponentNames[selection.opponent]
  summary.textContent = `${ruleDetails[selection.rule].name} · ${opponent} · ${qualityNames[selection.quality]}`
  saveSelection(selection)
}

function persistentOnlineUserId(): string {
  try {
    const saved = localStorage.getItem(onlineUserIdKey)
    if (saved) return saved
    const id = `P_${globalThis.crypto?.randomUUID?.() ?? generateRoomCode()}`
    localStorage.setItem(onlineUserIdKey, id)
    return id
  } catch {
    return `P_${generateRoomCode()}`
  }
}

function syncOpponentSettings(
  form: HTMLFormElement,
  selection = selectionFromForm(form)
) {
  const aiSettings = document
    .querySelector<HTMLElement>("#botLevel")
    ?.closest<HTMLElement>(".launcher-fieldset")
  const localSettings = document.querySelector<HTMLElement>("#localSettings")!
  const onlineSettings = document.querySelector<HTMLElement>("#onlineSettings")!
  const botLevel = document.querySelector<HTMLSelectElement>("#botLevel")!

  const isAi = selection.opponent === "ai"
  const isLocal = selection.opponent === "local"
  const isOnline = selection.opponent === "online"
  if (aiSettings) aiSettings.hidden = !isAi
  localSettings.hidden = !isLocal
  onlineSettings.hidden = !isOnline
  botLevel.disabled = !isAi

  if (isOnline) {
    const roomCode = document.querySelector<HTMLInputElement>("#roomCode")!
    if (
      selection.onlineAction === "create" &&
      normaliseRoomCode(roomCode.value).length < 4
    ) {
      roomCode.value = generateRoomCode()
    }
    roomCode.value = normaliseRoomCode(roomCode.value)
    const inviteRow = document.querySelector<HTMLElement>("#inviteRow")!
    const inviteUrl = document.querySelector<HTMLInputElement>("#inviteUrl")!
    const creating = selection.onlineAction !== "join"
    inviteRow.hidden = !creating
    if (creating) {
      inviteUrl.value = buildInviteUrl(
        roomCode.value,
        selection,
        globalThis.location.href
      )
    }
  }
}

function initialiseLauncher(params: URLSearchParams) {
  document.documentElement.classList.add("launcher-mode")
  document.title = "Break Builder — 选择模式"
  const launcher = document.querySelector<HTMLElement>("#gameLauncher")!
  const selection = readSelection(params)
  launcher.innerHTML = launcherMarkup(selection)
  launcher.hidden = false

  const form = document.querySelector<HTMLFormElement>("#launcherForm")!
  const start = document.querySelector<HTMLButtonElement>("#launcherStart")!
  const roomCode = document.querySelector<HTMLInputElement>("#roomCode")!
  const copyInvite = document.querySelector<HTMLButtonElement>("#copyInvite")!
  syncOpponentSettings(form)
  updateSummary(form)
  form.addEventListener("change", () => {
    syncOpponentSettings(form)
    updateSummary(form)
  })
  roomCode.addEventListener("input", () => {
    roomCode.value = normaliseRoomCode(roomCode.value)
    syncOpponentSettings(form)
  })
  copyInvite.addEventListener("click", async () => {
    const inviteUrl = document.querySelector<HTMLInputElement>("#inviteUrl")!
    try {
      await navigator.clipboard.writeText(inviteUrl.value)
      copyInvite.textContent = "已复制"
    } catch {
      inviteUrl.select()
      document.execCommand("copy")
      copyInvite.textContent = "已复制"
    }
    setTimeout(() => {
      copyInvite.textContent = "复制邀请"
    }, 1600)
  })
  form.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && event.target instanceof HTMLInputElement) {
      event.preventDefault()
      form.requestSubmit()
    }
  })
  form.addEventListener("submit", (event) => {
    event.preventDefault()
    const current = selectionFromForm(form)
    if (
      current.opponent === "online" &&
      normaliseRoomCode(current.roomCode ?? "").length < 4
    ) {
      document.querySelector<HTMLElement>("#launcherStatus")!.textContent =
        "请输入至少 4 位房间码"
      roomCode.focus()
      return
    }
    current.onlineUserId = persistentOnlineUserId()
    start.dataset.state = "loading"
    start.disabled = true
    start.querySelector("span")!.textContent = "正在装台…"
    document.querySelector<HTMLElement>("#launcherStatus")!.textContent =
      "正在加载 3D 球桌"
    try {
      globalThis.location.assign(
        buildGameUrl(current, globalThis.location.href)
      )
    } catch (error) {
      start.dataset.state = "error"
      start.disabled = false
      start.querySelector("span")!.textContent = "开始比赛"
      document.querySelector<HTMLElement>("#launcherStatus")!.textContent =
        error instanceof Error ? error.message : "无法创建比赛"
    }
  })
}

function loadScript(source: string) {
  return new Promise<void>((resolve, reject) => {
    const script = document.createElement("script")
    script.src = source
    script.onload = () => resolve()
    script.onerror = () => reject(new Error(`Unable to load ${source}`))
    document.body.append(script)
  })
}

async function loadGame() {
  for (const source of [
    "three_core.js",
    "three_module.js",
    "three_examples.js",
    "messaging.js",
    "index.js",
  ]) {
    await loadScript(source)
  }
}

const params = new URLSearchParams(globalThis.location.search)
if (shouldShowLauncher(params)) {
  initialiseLauncher(params)
} else {
  void loadGame()
}
