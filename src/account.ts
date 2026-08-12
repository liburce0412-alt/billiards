import { apiJson, isLocalDemo, type PlatformMe } from "./platform/api"
import { avatarElement, mountPlatformPage, toast } from "./platform/page"
import { applyPersonalisation, platformGate, signOut } from "./platform/shell"
import { CUE_STYLES } from "./view/cuestyle"
import { ENVIRONMENT_STYLES } from "./view/environmentstyle"
import { TABLE_STYLES } from "./view/tablestyle"

class AccountPage {
  constructor(
    private session: PlatformMe,
    private readonly root: HTMLElement
  ) {}

  init() {
    this.root.innerHTML = `
      <div class="account-layout">
        <aside class="platform-panel account-profile-card">
          <div class="account-profile-card__spectra"></div>
          <div id="accountAvatar" class="account-avatar-wrap"></div>
          <h2 id="accountDisplayName"></h2>
          <p id="accountUsername"></p>
          <span id="accountApproval" class="account-status-badge"></span>
          <label class="platform-soft-button account-avatar-upload">
            <i class="ph ph-camera"></i><span>更换头像</span>
            <input id="accountAvatarInput" type="file" accept="image/jpeg,image/png,image/webp" />
          </label>
          <dl class="account-profile-facts">
            <div><dt>角色</dt><dd id="accountRole"></dd></div>
            <div><dt>邮箱</dt><dd id="accountEmail"></dd></div>
            <div><dt>可见性</dt><dd id="accountVisibilityLabel"></dd></div>
          </dl>
          <button id="accountSignOut" class="platform-danger-button" type="button"><i class="ph ph-sign-out"></i>退出账号</button>
        </aside>

        <div class="account-settings">
          <form id="accountProfileForm" class="platform-panel account-form">
            <header class="platform-panel__header"><div><h2>球员档案</h2><p>显示名和简介会出现在好友与房间中</p></div><i class="ph ph-identification-card account-section-icon"></i></header>
            <div class="platform-panel__body account-form-grid">
              <label class="platform-field"><span>显示名</span><input name="displayName" minlength="2" maxlength="24" required /></label>
              <label class="platform-field"><span>在线可见性</span><select name="visibility"><option value="online">在线</option><option value="away">暂离</option><option value="dnd">勿扰</option><option value="invisible">隐身</option></select></label>
              <label class="platform-field account-span-two"><span>个人简介</span><textarea name="bio" maxlength="180" rows="3" placeholder="写一点你的台球风格…"></textarea></label>
              <div class="account-span-two account-form-actions"><p>隐身后普通用户和好友都看不到你在线；管理员仍可按权限审计。</p><button class="platform-primary" type="submit"><span>保存档案</span><i class="ph ph-check"></i></button></div>
            </div>
          </form>

          <form id="accountAppearanceForm" class="platform-panel account-form">
            <header class="platform-panel__header"><div><h2>个性化外观</h2><p>免费选择；不会改变物理或胜率</p></div><i class="ph ph-sparkle account-section-icon"></i></header>
            <div class="platform-panel__body account-form-grid">
              <fieldset class="account-accent account-span-two"><legend>流光主题</legend><div id="accountAccentOptions"></div></fieldset>
              <label class="platform-field"><span>我的球杆</span><select name="cueStyle"></select></label>
              <label class="platform-field"><span>默认球台</span><select name="tableStyle"></select></label>
              <label class="platform-field account-span-two"><span>默认环境</span><select name="environmentStyle"></select></label>
              <div class="account-appearance-preview account-span-two" aria-hidden="true"><span>SPECTRA PROFILE</span><strong id="accountPreviewLabel"></strong><i class="ph ph-wave-sine"></i></div>
              <div class="account-span-two account-form-actions"><p>联机时球杆保持个人选择；球台与环境由房主同步。</p><button class="platform-primary" type="submit"><span>保存外观</span><i class="ph ph-check"></i></button></div>
            </div>
          </form>

          <form id="accountControlForm" class="platform-panel account-form">
            <header class="platform-panel__header"><div><h2>操作与性能</h2><p>跨设备同步常用游玩偏好</p></div><i class="ph ph-sliders-horizontal account-section-icon"></i></header>
            <div class="platform-panel__body account-form-grid">
              <label class="platform-field"><span>画质</span><select name="quality"><option value="low">省电</option><option value="balanced">均衡</option><option value="high">高画质</option></select></label>
              <label class="platform-field"><span>默认镜头</span><select name="cameraMode"><option value="aim">瞄准视角</option><option value="top">俯视视角</option><option value="free">自由视角</option></select></label>
              <label class="platform-field"><span>桌面操作栏</span><select name="desktopShotDock"><option value="expanded">默认展开</option><option value="collapsed">默认收起</option></select></label>
              <label class="platform-field"><span>触屏操作栏</span><select name="touchShotDock"><option value="expanded">默认展开</option><option value="collapsed">默认收起</option></select></label>
              <label class="platform-field"><span>局内社交栏</span><select name="socialDrawerOpen"><option value="closed">默认收起</option><option value="open">默认展开</option></select></label>
              <label class="platform-field account-volume"><span>主音量 <output id="accountVolumeOutput"></output></span><input name="masterVolume" type="range" min="0" max="1" step="0.05" /></label>
              <label class="account-toggle"><input name="reducedMotion" type="checkbox" /><span><strong>减少动态</strong><small>停止流光动画并减少界面过渡</small></span></label>
              <div class="account-span-two account-form-actions"><p>低画质与减少动态会暂停不必要的连续 shader 渲染。</p><button class="platform-primary" type="submit"><span>保存操作</span><i class="ph ph-check"></i></button></div>
            </div>
          </form>

          <section class="platform-panel account-security">
            <header class="platform-panel__header"><div><h2>账号安全</h2><p>无需邮件服务的一次性恢复码</p></div><i class="ph ph-shield-check account-section-icon"></i></header>
            <div class="platform-panel__body">
              <div><strong>重新生成恢复码</strong><p>新码生成后，所有旧恢复码立即失效。请下载后离线保存。</p></div>
              <button id="accountRegenerateCodes" class="platform-soft-button" type="button"><i class="ph ph-key"></i>生成新恢复码</button>
            </div>
            <div id="accountRecoveryCodes" class="account-recovery-output" hidden></div>
          </section>
        </div>
      </div>`
    this.populate()
    this.bind()
  }

  private populate() {
    const user = this.session.user
    const profileForm = this.root.querySelector<HTMLFormElement>(
      "#accountProfileForm"
    )!
    const appearanceForm = this.root.querySelector<HTMLFormElement>(
      "#accountAppearanceForm"
    )!
    const controlForm = this.root.querySelector<HTMLFormElement>(
      "#accountControlForm"
    )!
    this.renderAvatar()
    this.root.querySelector<HTMLElement>("#accountDisplayName")!.textContent =
      user.displayName
    this.root.querySelector<HTMLElement>("#accountUsername")!.textContent =
      `@${user.username}`
    this.root.querySelector<HTMLElement>("#accountApproval")!.textContent =
      approvalText(user.approvalStatus)
    this.root.querySelector<HTMLElement>("#accountApproval")!.dataset.state =
      user.approvalStatus
    this.root.querySelector<HTMLElement>("#accountRole")!.textContent =
      roleText(user.role)
    this.root.querySelector<HTMLElement>("#accountEmail")!.textContent =
      maskEmail(user.email)
    this.root.querySelector<HTMLElement>(
      "#accountVisibilityLabel"
    )!.textContent = visibilityText(user.visibility)
    setValue(profileForm, "displayName", user.displayName)
    setValue(profileForm, "visibility", user.visibility)
    setValue(profileForm, "bio", user.bio)

    const accents = [
      ["ocean", "海洋", "#2edee7", "#625dff"],
      ["violet", "紫外", "#8b5df2", "#d16bff"],
      ["ember", "暖焰", "#f06a4d", "#f3b04f"],
      ["jade", "翡翠", "#159279", "#47cfad"],
      ["chrome", "银铬", "#55667d", "#a8b1c1"],
    ]
    const options = this.root.querySelector<HTMLElement>(
      "#accountAccentOptions"
    )!
    for (const [value, name, from, to] of accents) {
      const label = document.createElement("label")
      label.className = "account-accent-option"
      const input = document.createElement("input")
      input.type = "radio"
      input.name = "accent"
      input.value = value
      input.checked = user.accent === value
      const swatch = document.createElement("span")
      swatch.style.setProperty("--accent-from", from)
      swatch.style.setProperty("--accent-to", to)
      const copy = document.createElement("strong")
      copy.textContent = name
      label.append(input, swatch, copy)
      options.append(label)
    }
    populateSelect(
      appearanceForm.elements.namedItem("cueStyle") as HTMLSelectElement,
      CUE_STYLES.map((style) => [
        style.id,
        `${style.name} · ${style.description}`,
      ]),
      user.cueStyle
    )
    populateSelect(
      appearanceForm.elements.namedItem("tableStyle") as HTMLSelectElement,
      TABLE_STYLES.map((style) => [
        style.id,
        `${style.name} · ${style.description}`,
      ]),
      user.tableStyle
    )
    populateSelect(
      appearanceForm.elements.namedItem(
        "environmentStyle"
      ) as HTMLSelectElement,
      ENVIRONMENT_STYLES.map((style) => [
        style.id,
        `${style.name} · ${style.description}`,
      ]),
      user.environmentStyle
    )
    this.updatePreview()

    setValue(controlForm, "quality", this.session.preferences.quality)
    setValue(controlForm, "cameraMode", this.session.preferences.camera_mode)
    setValue(
      controlForm,
      "desktopShotDock",
      this.session.preferences.desktop_shot_dock
    )
    setValue(
      controlForm,
      "touchShotDock",
      this.session.preferences.touch_shot_dock
    )
    setValue(
      controlForm,
      "socialDrawerOpen",
      this.session.preferences.social_drawer_open ? "open" : "closed"
    )
    const volume = controlForm.elements.namedItem(
      "masterVolume"
    ) as HTMLInputElement
    volume.value = String(this.session.preferences.master_volume)
    ;(
      controlForm.elements.namedItem("reducedMotion") as HTMLInputElement
    ).checked = !!this.session.preferences.reduced_motion
    this.updateVolume()
  }

  private bind() {
    const profileForm = this.root.querySelector<HTMLFormElement>(
      "#accountProfileForm"
    )!
    const appearanceForm = this.root.querySelector<HTMLFormElement>(
      "#accountAppearanceForm"
    )!
    const controlForm = this.root.querySelector<HTMLFormElement>(
      "#accountControlForm"
    )!
    profileForm.onsubmit = (event) => {
      event.preventDefault()
      void this.saveForm(
        profileForm,
        {
          displayName: value(profileForm, "displayName"),
          visibility: value(profileForm, "visibility"),
          bio: value(profileForm, "bio"),
        },
        "球员档案已保存"
      )
    }
    appearanceForm.onchange = () => this.updatePreview()
    appearanceForm.onsubmit = (event) => {
      event.preventDefault()
      const accent = new FormData(appearanceForm).get(
        "accent"
      ) as PlatformMe["user"]["accent"]
      void this.saveForm(
        appearanceForm,
        {
          accent,
          cueStyle: value(appearanceForm, "cueStyle"),
          tableStyle: value(appearanceForm, "tableStyle"),
          environmentStyle: value(appearanceForm, "environmentStyle"),
        },
        "个性化外观已保存",
        () => {
          this.session.user.accent = accent
          this.session.user.cueStyle = value(appearanceForm, "cueStyle")
          this.session.user.tableStyle = value(appearanceForm, "tableStyle")
          this.session.user.environmentStyle = value(
            appearanceForm,
            "environmentStyle"
          )
        }
      )
    }
    controlForm.querySelector<HTMLInputElement>(
      '[name="masterVolume"]'
    )!.oninput = () => this.updateVolume()
    controlForm.onsubmit = (event) => {
      event.preventDefault()
      const reducedMotion = (
        controlForm.elements.namedItem("reducedMotion") as HTMLInputElement
      ).checked
      void this.saveForm(
        controlForm,
        {
          preferences: {
            quality: value(controlForm, "quality"),
            cameraMode: value(controlForm, "cameraMode"),
            desktopShotDock: value(controlForm, "desktopShotDock"),
            touchShotDock: value(controlForm, "touchShotDock"),
            socialDrawerOpen: value(controlForm, "socialDrawerOpen") === "open",
            masterVolume: Number(value(controlForm, "masterVolume")),
            reducedMotion,
          },
        },
        "操作偏好已保存",
        () => {
          this.session.preferences.reduced_motion = Number(reducedMotion)
          this.session.preferences.quality = value(
            controlForm,
            "quality"
          ) as PlatformMe["preferences"]["quality"]
          this.session.preferences.camera_mode = value(
            controlForm,
            "cameraMode"
          ) as PlatformMe["preferences"]["camera_mode"]
          this.session.preferences.desktop_shot_dock = value(
            controlForm,
            "desktopShotDock"
          ) as PlatformMe["preferences"]["desktop_shot_dock"]
          this.session.preferences.touch_shot_dock = value(
            controlForm,
            "touchShotDock"
          ) as PlatformMe["preferences"]["touch_shot_dock"]
          this.session.preferences.master_volume = Number(
            value(controlForm, "masterVolume")
          )
          this.session.preferences.social_drawer_open = Number(
            value(controlForm, "socialDrawerOpen") === "open"
          )
        }
      )
    }
    this.root.querySelector<HTMLInputElement>("#accountAvatarInput")!.onchange =
      (event) =>
        void this.uploadAvatar(
          (event.currentTarget as HTMLInputElement).files?.[0]
        )
    this.root.querySelector<HTMLButtonElement>(
      "#accountRegenerateCodes"
    )!.onclick = () => void this.regenerateCodes()
    this.root.querySelector<HTMLButtonElement>("#accountSignOut")!.onclick =
      () => void signOut()
  }

  private async saveForm(
    form: HTMLFormElement,
    body: unknown,
    success: string,
    after?: () => void
  ) {
    const button = form.querySelector<HTMLButtonElement>(
      'button[type="submit"]'
    )!
    button.disabled = true
    try {
      if (!isLocalDemo())
        this.session = await apiJson<PlatformMe>("/api/me", {
          method: "PATCH",
          body: JSON.stringify(body),
        })
      after?.()
      applyPersonalisation(this.session)
      toast(success, "success")
      this.populateHeaderFacts()
    } catch (error) {
      toast(error instanceof Error ? error.message : "保存失败", "error")
    } finally {
      button.disabled = false
    }
  }

  private populateHeaderFacts() {
    this.root.querySelector<HTMLElement>("#accountDisplayName")!.textContent =
      value(
        this.root.querySelector<HTMLFormElement>("#accountProfileForm")!,
        "displayName"
      )
    this.root.querySelector<HTMLElement>(
      "#accountVisibilityLabel"
    )!.textContent = visibilityText(
      value(
        this.root.querySelector<HTMLFormElement>("#accountProfileForm")!,
        "visibility"
      )
    )
  }

  private renderAvatar() {
    const root = this.root.querySelector<HTMLElement>("#accountAvatar")!
    root.replaceChildren(
      avatarElement(
        this.session.user.displayName,
        this.session.user.avatarUrl,
        "lg"
      )
    )
  }

  private updatePreview() {
    const form = this.root.querySelector<HTMLFormElement>(
      "#accountAppearanceForm"
    )!
    const cue = CUE_STYLES.find((item) => item.id === value(form, "cueStyle"))
    const table = TABLE_STYLES.find(
      (item) => item.id === value(form, "tableStyle")
    )
    this.root.querySelector<HTMLElement>("#accountPreviewLabel")!.textContent =
      `${cue?.name ?? "球杆"} / ${table?.name ?? "球台"}`
  }

  private updateVolume() {
    const value = Number(
      this.root.querySelector<HTMLInputElement>('[name="masterVolume"]')!.value
    )
    this.root.querySelector<HTMLOutputElement>("#accountVolumeOutput")!.value =
      `${Math.round(value * 100)}%`
  }

  private async uploadAvatar(file?: File) {
    if (!file) return
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error("原图不能超过 10 MB")
      const blob = await cropAvatar(file)
      if (!isLocalDemo()) {
        const result = await apiJson<{ avatarUrl: string }>("/api/me/avatar", {
          method: "PUT",
          headers: { "content-type": "image/webp" },
          body: blob,
        })
        this.session.user.avatarUrl = `${result.avatarUrl}?v=${Date.now()}`
      } else {
        this.session.user.avatarUrl = URL.createObjectURL(blob)
      }
      this.renderAvatar()
      toast("头像已更新", "success")
    } catch (error) {
      toast(error instanceof Error ? error.message : "头像上传失败", "error")
    }
  }

  private async regenerateCodes() {
    if (
      !globalThis.confirm("生成新恢复码后，所有旧恢复码都会立即失效。继续吗？")
    )
      return
    try {
      const codes = isLocalDemo()
        ? Array.from(
            { length: 8 },
            (_, index) => `DEMO-${String(index + 1).padStart(4, "0")}-CODE`
          )
        : (
            await apiJson<{ recoveryCodes: string[] }>(
              "/api/me/recovery-codes",
              { method: "POST", body: JSON.stringify({}) }
            )
          ).recoveryCodes
      this.showCodes(codes)
      toast("新恢复码已生成；旧码已失效", "success")
    } catch (error) {
      toast(error instanceof Error ? error.message : "无法生成恢复码", "error")
    }
  }

  private showCodes(codes: string[]) {
    const root = this.root.querySelector<HTMLElement>("#accountRecoveryCodes")!
    root.hidden = false
    root.replaceChildren()
    const grid = document.createElement("div")
    grid.className = "platform-recovery-grid"
    for (const code of codes) {
      const item = document.createElement("code")
      item.textContent = code
      grid.append(item)
    }
    const actions = document.createElement("div")
    actions.className = "platform-button-row"
    const copy = document.createElement("button")
    copy.type = "button"
    copy.className = "platform-soft-button"
    copy.innerHTML = '<i class="ph ph-copy"></i><span>复制全部</span>'
    copy.onclick = () => void navigator.clipboard.writeText(codes.join("\n"))
    const download = document.createElement("button")
    download.type = "button"
    download.className = "platform-soft-button"
    download.innerHTML =
      '<i class="ph ph-download-simple"></i><span>下载文本</span>'
    download.onclick = () => downloadCodes(codes)
    actions.append(copy, download)
    root.append(grid, actions)
  }
}

function setValue(form: HTMLFormElement, name: string, value: string) {
  const control = form.elements.namedItem(name) as
    HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null
  if (control) control.value = value
}

function value(form: HTMLFormElement, name: string) {
  return String(new FormData(form).get(name) ?? "")
}

function populateSelect(
  select: HTMLSelectElement,
  entries: Array<[string, string]>,
  selected: string
) {
  select.replaceChildren()
  for (const [value, label] of entries) {
    const option = document.createElement("option")
    option.value = value
    option.textContent = label
    option.selected = value === selected
    select.append(option)
  }
}

function approvalText(value: string) {
  return (
    (
      {
        pending: "待管理员审核 · 仅离线",
        approved: "在线权限已开启",
        rejected: "审核未通过 · 仅离线",
        revoked: "在线权限已撤销",
      } as Record<string, string>
    )[value] ?? value
  )
}

function roleText(value: string) {
  return (
    (
      { user: "球员", moderator: "版主", admin: "管理员" } as Record<
        string,
        string
      >
    )[value] ?? value
  )
}

function visibilityText(value: string) {
  return (
    (
      {
        online: "在线",
        away: "暂离",
        dnd: "勿扰",
        invisible: "隐身",
      } as Record<string, string>
    )[value] ?? value
  )
}

function maskEmail(email: string) {
  const [name, domain] = email.split("@")
  if (!domain) return "私有"
  return `${name.slice(0, 2)}${"•".repeat(Math.min(4, Math.max(1, name.length - 2)))}@${domain}`
}

async function cropAvatar(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const side = Math.min(bitmap.width, bitmap.height)
  const sourceX = (bitmap.width - side) / 2
  const sourceY = (bitmap.height - side) / 2
  const canvas = document.createElement("canvas")
  canvas.width = 512
  canvas.height = 512
  const context = canvas.getContext("2d")
  if (!context) throw new Error("浏览器无法处理头像")
  context.drawImage(bitmap, sourceX, sourceY, side, side, 0, 0, 512, 512)
  bitmap.close()
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("头像编码失败"))),
      "image/webp",
      0.88
    )
  })
}

function downloadCodes(codes: string[]) {
  const text = `Break Builder 一次性恢复码\n\n${codes.join("\n")}\n\n请离线安全保存。每个恢复码只能使用一次。`
  const link = document.createElement("a")
  link.href = URL.createObjectURL(
    new Blob([text], { type: "text/plain;charset=utf-8" })
  )
  link.download = "break-builder-recovery-codes.txt"
  link.click()
  URL.revokeObjectURL(link.href)
}

async function bootstrap() {
  const session = await platformGate()
  if (!session) return
  const root = mountPlatformPage(
    session,
    "account",
    "账号与个性化",
    "你的外观、操作与隐私偏好会跟随账号同步到下一台设备。"
  )
  new AccountPage(session, root).init()
}

void bootstrap().catch((error) =>
  toast(error instanceof Error ? error.message : "账号页面加载失败", "error")
)
