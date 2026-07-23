import {
  buildGameUrl,
  LauncherOpponent,
  LauncherQuality,
  LauncherRule,
  LauncherSelection,
  shouldShowLauncher,
} from "./launcherconfig"

const storageKey = "billiards-launcher-selection"

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

function readSelection(params: URLSearchParams): LauncherSelection {
  let stored: Partial<LauncherSelection>
  try {
    stored = JSON.parse(localStorage.getItem(storageKey) ?? "{}")
  } catch {
    stored = {}
  }

  const requestedQuality = params.get("quality")
  let quality = defaultSelection.quality
  if (isQuality(stored.quality)) quality = stored.quality
  if (isQuality(requestedQuality)) quality = requestedQuality
  let opponent = defaultSelection.opponent
  if (isOpponent(stored.opponent)) {
    opponent = stored.opponent === "practice" ? "practice" : "ai"
  }
  return {
    rule: isRule(stored.rule) ? stored.rule : defaultSelection.rule,
    opponent,
    botLevel: normalizeLevel(stored.botLevel),
    quality,
  }
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
          <h1 id="launcherTitle">选一张球桌。<br />打好下一杆。</h1>
          <p class="launcher-lede">
            五种规则、11 档本地 AI，以及针对当前设备的渲染画质。物理结果不随画质改变。
          </p>
          <dl class="launcher-facts">
            <div><dt>物理</dt><dd>固定 1/512 秒</dd></div>
            <div><dt>对手</dt><dd>浏览器本地运行</dd></div>
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
              <div class="segment-control segment-control--two">
                <label>${checked("opponent", "practice", selection.opponent)}<span>自由练习</span></label>
                <label>${checked("opponent", "ai", selection.opponent)}<span>AI 对战</span></label>
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
    selection.opponent === "practice"
      ? opponentNames.practice
      : levelNames[selection.botLevel - 1]
  summary.textContent = `${ruleDetails[selection.rule].name} · ${opponent} · ${qualityNames[selection.quality]}`
  saveSelection(selection)
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
  updateSummary(form)
  form.addEventListener("change", () => updateSummary(form))
  form.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && event.target instanceof HTMLInputElement) {
      event.preventDefault()
      form.requestSubmit()
    }
  })
  form.addEventListener("submit", (event) => {
    event.preventDefault()
    const current = selectionFromForm(form)
    start.dataset.state = "loading"
    start.disabled = true
    start.querySelector("span")!.textContent = "正在装台…"
    document.querySelector<HTMLElement>("#launcherStatus")!.textContent =
      "正在加载 3D 球桌"
    globalThis.location.assign(buildGameUrl(current, globalThis.location.href))
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
