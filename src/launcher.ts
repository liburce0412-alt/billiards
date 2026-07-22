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
  ClawBreak: "基础 AI",
  TheFarJaw: "进阶 AI",
}

const qualityNames: Record<LauncherQuality, string> = {
  low: "省电",
  balanced: "均衡",
  high: "高画质",
}

const defaultSelection: LauncherSelection = {
  rule: "eightball",
  opponent: "TheFarJaw",
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
  return {
    rule: isRule(stored.rule) ? stored.rule : defaultSelection.rule,
    opponent: isOpponent(stored.opponent)
      ? stored.opponent
      : defaultSelection.opponent,
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
  return `
    <div class="launcher-shell">
      <header class="launcher-nav">
        <a class="launcher-wordmark" href="./" aria-label="Break Builder 首页">
          <span aria-hidden="true">●</span> Break Builder
        </a>
        <a class="launcher-lobby" href="lobby.html">联机大厅 <span aria-hidden="true">↗</span></a>
      </header>

      <main class="launcher-layout">
        <section class="launcher-intro" aria-labelledby="launcherTitle">
          <p class="launcher-kicker">浏览器台球模拟器</p>
          <h1 id="launcherTitle">选一张球桌。<br />打好下一杆。</h1>
          <p class="launcher-lede">
            四种规则、两档本地机器人，以及针对当前设备的渲染画质。物理结果不随画质改变。
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
              <div class="segment-control">
                <label>${checked("opponent", "practice", selection.opponent)}<span>自由练习</span></label>
                <label>${checked("opponent", "ClawBreak", selection.opponent)}<span>基础 AI</span></label>
                <label>${checked("opponent", "TheFarJaw", selection.opponent)}<span>进阶 AI</span></label>
              </div>
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
        <p>GPL-3.0 · TypeScript + Three.js</p>
        <p>方向键选择 · Enter 开始</p>
      </footer>
    </div>`
}

function selectionFromForm(form: HTMLFormElement): LauncherSelection {
  const data = new FormData(form)
  return {
    rule: data.get("rule") as LauncherRule,
    opponent: data.get("opponent") as LauncherOpponent,
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
  summary.textContent = `${ruleDetails[selection.rule].name} · ${opponentNames[selection.opponent]} · ${qualityNames[selection.quality]}`
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
