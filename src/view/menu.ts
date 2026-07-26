import { Container } from "../container/container"
import { getButton } from "../utils/dom"
import { Session } from "../network/client/session"
import { ConcedeEvent } from "../events/concedeevent"
import { ExportUtils } from "../utils/export-utils"
import {
  CUE_STYLES,
  CUSTOM_CUE_STYLE_ID,
  CustomCueColours,
  cueColourHex,
  customCueDetails,
  CustomCueDetails,
  saveCustomCueDetails,
} from "./cuestyle"
import { TABLE_STYLES } from "./tablestyle"
import { ENVIRONMENT_STYLES } from "./environmentstyle"

export class Menu {
  private static readonly settingsStorageVersion =
    "break-builder.controls-seen.v2"
  container: Container
  share: HTMLButtonElement
  diagram: HTMLButtonElement
  camera: HTMLButtonElement
  concede: HTMLButtonElement
  menu: HTMLButtonElement
  analysis: HTMLButtonElement
  cueStyle: HTMLButtonElement
  tableStyle: HTMLButtonElement

  disabled = true

  constructor(container) {
    this.container = container

    this.share = this.getElement("share")
    this.diagram = this.getElement("diagram")
    this.camera = this.getElement("camera")
    this.concede = this.getElement("concede")
    this.menu = this.getElement("menu")
    this.analysis = this.getElement("analysis")
    this.cueStyle = this.getElement("cueStyle")
    this.tableStyle = this.getElement("tableStyle")

    if (this.analysis) {
      this.analysis.onclick = () => this.handleExport(true)
    }

    if (this.diagram) {
      this.diagram.onclick = () => this.handleExport(false)
    }

    this.setShareVisible(false)
    this.setDiagramVisible(false)
    if (this.camera) {
      this.camera.onclick = (_) => {
        this.adjustCamera()
      }
    }
    if (this.menu) {
      this.menu.onclick = (_) => {
        this.toggleSettingsDrawer()
      }
    }
    this.initSettingsDrawer()
    this.initControlTutorial()
    this.initCueSelector()
    this.initTableSelector()
    const closeBtn = document.getElementById("helpClose")
    if (closeBtn) {
      closeBtn.onclick = () => {
        const overlay = document.getElementById("helpOverlay")
        overlay?.setAttribute("hidden", "true")
      }
    }
    if (this.concede) {
      this.concede.onclick = (_) => {
        this.container.notification.show(
          {
            type: "Info",
            title: "确认认输",
            subtext: "认输后本局由对手获胜",
            extra:
              '<button class="notification-btn" data-notification-action="concede-confirm">确认认输</button>' +
              '<button class="notification-btn" data-notification-action="concede-cancel">继续比赛</button>',
            duration: 0,
          },
          0,
          {
            "concede-confirm": () => {
              this.container.notification.clear()
              if (Session.isBotMode()) {
                this.container.updateController(
                  this.container.rules.handleGameEnd(false)
                )
              } else {
                this.container.updateController(
                  this.container.rules.handleGameEnd(false)
                )
                this.container.sendEvent(new ConcedeEvent())
              }
            },
            "concede-cancel": () => this.container.notification.clear(),
          }
        )
      }
    }
  }

  private handleExport(isAnalysis: boolean) {
    const init = this.container.lastShotInit
    const shot = this.container.lastShotData
    if (init && shot) {
      const urlParams = new URLSearchParams(globalThis.location?.search ?? "")
      const tableSize = parseFloat(urlParams.get("tableSize") || "10")
      const url = ExportUtils.getExportUrl(
        isAnalysis,
        this.container.rules.rulename,
        init,
        shot,
        tableSize
      )
      window.open(url, "_blank")
    }
  }

  adjustCamera() {
    this.container.view.camera.toggleMode()
    this.container.lastEventTime = performance.now()
  }

  getElement(id): HTMLButtonElement {
    return getButton(id)!
  }

  setShareVisible(visible: boolean) {
    if (!this.share) {
      return
    }
    this.share.hidden = !visible
    this.share.disabled = !visible
  }

  setDiagramVisible(visible: boolean) {
    if (!this.diagram) {
      return
    }
    this.diagram.hidden = !visible
    this.diagram.disabled = !visible
  }

  setConcedeVisible(visible: boolean) {
    if (this.concede) {
      this.concede.hidden = !visible
      this.concede.disabled = !visible
    }
  }

  setAnalysisVisible(visible: boolean) {
    if (this.analysis) {
      this.analysis.hidden = !visible
      this.analysis.disabled = !visible
    }
  }

  toggleHelpOverlay() {
    const overlay = document.getElementById("helpOverlay")
    if (overlay) {
      const isHidden = overlay.hasAttribute("hidden")
      if (isHidden) {
        document.getElementById("cueSelector")?.setAttribute("hidden", "true")
        document.getElementById("tableSelector")?.setAttribute("hidden", "true")
        this.showOverlay("help.html")
      } else {
        overlay.setAttribute("hidden", "true")
      }
    }
  }

  private toggleSettingsDrawer(forceOpen?: boolean) {
    const drawer = document.getElementById("gameSettingsDrawer")
    if (!drawer) return
    const opening = forceOpen ?? drawer.hasAttribute("hidden")
    drawer.toggleAttribute("hidden", !opening)
    drawer.setAttribute("aria-hidden", String(!opening))
    this.menu?.setAttribute("aria-expanded", String(opening))
    if (opening) {
      document.getElementById("cueSelector")?.setAttribute("hidden", "true")
      document.getElementById("tableSelector")?.setAttribute("hidden", "true")
      document.getElementById("gameSettingsClose")?.focus()
    }
  }

  private initSettingsDrawer() {
    this.menu?.setAttribute("aria-controls", "gameSettingsDrawer")
    this.menu?.setAttribute("aria-expanded", "false")
    document
      .getElementById("gameSettingsClose")
      ?.addEventListener("click", () => {
        this.toggleSettingsDrawer(false)
        this.menu?.focus()
      })
    document.getElementById("settingsCamera")?.addEventListener("click", () => {
      this.adjustCamera()
    })
    document.getElementById("settingsHelp")?.addEventListener("click", () => {
      this.toggleSettingsDrawer(false)
      this.showOverlay("help.html")
    })
    document.getElementById("settingsCue")?.addEventListener("click", () => {
      this.toggleSettingsDrawer(false)
      this.cueStyle?.click()
    })
    document.getElementById("settingsTable")?.addEventListener("click", () => {
      this.toggleSettingsDrawer(false)
      this.tableStyle?.click()
    })
    const environment = document.getElementById(
      "settingsEnvironment"
    ) as HTMLSelectElement | null
    if (environment) {
      environment.innerHTML = ENVIRONMENT_STYLES.map(
        (style) =>
          `<option value="${style.id}">${style.name} · ${style.description}</option>`
      ).join("")
      environment.value = this.container.view.environmentStyleId
      environment.addEventListener("change", () => {
        this.container.view.setEnvironmentStyle(environment.value)
        this.container.lastEventTime = performance.now()
      })
    }

    const volume = document.getElementById(
      "settingsVolume"
    ) as HTMLInputElement | null
    if (volume) {
      const stored = Number.parseFloat(
        globalThis.localStorage?.getItem("break-builder.master-volume") ?? "0.8"
      )
      volume.value = String(Number.isFinite(stored) ? stored : 0.8)
      this.container.sound.listener?.setMasterVolume(Number(volume.value))
      volume.addEventListener("input", () => {
        const value = Number(volume.value)
        this.container.sound.listener?.setMasterVolume(value)
        globalThis.localStorage?.setItem(
          "break-builder.master-volume",
          String(value)
        )
      })
    }

    const quality = document.getElementById(
      "settingsQuality"
    ) as HTMLSelectElement | null
    if (quality) {
      const params = new URLSearchParams(globalThis.location.search)
      quality.value = params.get("quality") ?? "balanced"
      quality.addEventListener("change", () => {
        const next = new URL(globalThis.location.href)
        next.searchParams.set("quality", quality.value)
        globalThis.location.assign(next)
      })
    }

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") this.toggleSettingsDrawer(false)
    })
  }

  private initControlTutorial() {
    const tutorial = document.getElementById("controlTutorial")
    const close = document.getElementById("controlTutorialClose")
    if (!tutorial || !close) return
    let seen = false
    try {
      seen =
        localStorage.getItem(Menu.settingsStorageVersion) === "acknowledged"
    } catch {
      // Treat unavailable storage as a first visit.
    }
    if (!seen) {
      tutorial.removeAttribute("hidden")
      close.focus()
    }
    close.addEventListener("click", () => {
      tutorial.setAttribute("hidden", "true")
      try {
        localStorage.setItem(Menu.settingsStorageVersion, "acknowledged")
      } catch {
        // Tutorial still closes when storage is unavailable.
      }
    })
  }

  private initCueSelector() {
    const selector = document.getElementById("cueSelector")
    const options = document.getElementById("cueStyleOptions")
    if (!selector || !options || !this.cueStyle) return

    const presetMarkup = CUE_STYLES.map(
      (style) => `
        <button
          type="button"
          class="cue-style-option"
          data-cue-style="${style.id}"
          aria-pressed="false"
        >
          <span class="cue-style-preview" aria-hidden="true">
            ${style.swatches
              .map(
                (color) =>
                  `<span class="cue-style-swatch" style="background:${color}"></span>`
              )
              .join("")}
          </span>
          <span class="cue-style-copy">
            <strong>${style.name}</strong>
            <small>${style.description}</small>
          </span>
          <span class="cue-style-check" aria-hidden="true">✓</span>
        </button>
      `
    ).join("")
    const custom = customCueDetails()
    options.innerHTML = `${presetMarkup}
      <section class="cue-customizer" aria-labelledby="cueCustomizerTitle">
        <div class="cue-customizer__heading">
          <div>
            <span>专属配色</span>
            <strong id="cueCustomizerTitle">我的定制杆</strong>
          </div>
          <span class="cue-customizer__badge">自定义</span>
        </div>
        <div class="cue-customizer__colours">
          ${(
            [
              ["forearm", "前把", custom.forearm],
              ["sleeve", "后把", custom.sleeve],
              ["wrap", "握把", custom.wrap],
              ["accent", "嵌花", custom.accent],
            ] as [keyof CustomCueColours, string, number][]
          )
            .map(
              ([key, label, colour]) => `
                <label>
                  <input
                    type="color"
                    data-custom-cue-colour="${key}"
                    value="${cueColourHex(colour)}"
                    aria-label="${label}颜色"
                  />
                  <span>${label}</span>
                </label>`
            )
            .join("")}
        </div>
        <div class="cue-customizer__patterns">
          <label>
            <span>前节纹理</span>
            <select data-custom-cue-detail="shaftPattern">
              <option value="maple" ${custom.shaftPattern === "maple" ? "selected" : ""}>直纹枫木</option>
              <option value="ash" ${custom.shaftPattern === "ash" ? "selected" : ""}>山纹白蜡木</option>
              <option value="carbon" ${custom.shaftPattern === "carbon" ? "selected" : ""}>斜织碳纤</option>
            </select>
          </label>
          <label>
            <span>前把木纹</span>
            <select data-custom-cue-detail="forearmPattern">
              <option value="straight" ${custom.forearmPattern === "straight" ? "selected" : ""}>顺直木纹</option>
              <option value="burl" ${custom.forearmPattern === "burl" ? "selected" : ""}>瘿木旋纹</option>
              <option value="flame" ${custom.forearmPattern === "flame" ? "selected" : ""}>火焰枫纹</option>
            </select>
          </label>
          <label>
            <span>握把质感</span>
            <select data-custom-cue-detail="wrapPattern">
              <option value="linen" ${custom.wrapPattern === "linen" ? "selected" : ""}>爱尔兰亚麻</option>
              <option value="leather" ${custom.wrapPattern === "leather" ? "selected" : ""}>细纹皮革</option>
              <option value="braid" ${custom.wrapPattern === "braid" ? "selected" : ""}>交错编织</option>
            </select>
          </label>
          <label>
            <span>镶嵌造型</span>
            <select data-custom-cue-detail="inlayPattern">
              <option value="spear" ${custom.inlayPattern === "spear" ? "selected" : ""}>长矛拼花</option>
              <option value="diamond" ${custom.inlayPattern === "diamond" ? "selected" : ""}>钻石镶嵌</option>
              <option value="chevron" ${custom.inlayPattern === "chevron" ? "selected" : ""}>V 形箭羽</option>
              <option value="feather" ${custom.inlayPattern === "feather" ? "selected" : ""}>孔雀羽片</option>
            </select>
          </label>
        </div>
        <div class="cue-customizer__actions">
          <button type="button" data-custom-cue-action="shuffle">换一组灵感</button>
          <button type="button" data-custom-cue-action="apply">应用定制</button>
        </div>
      </section>`

    const updateSelected = () => {
      const current = this.container.table.cue.styleId
      options
        .querySelectorAll<HTMLElement>("[data-cue-style]")
        .forEach((button) => {
          const selected = button.dataset.cueStyle === current
          button.classList.toggle("is-selected", selected)
          button.setAttribute("aria-pressed", String(selected))
        })
      options
        .querySelector(".cue-customizer")
        ?.classList.toggle("is-selected", current === CUSTOM_CUE_STYLE_ID)
    }
    updateSelected()

    this.cueStyle.onclick = () => {
      const opening = selector.hasAttribute("hidden")
      document.getElementById("helpOverlay")?.setAttribute("hidden", "true")
      document.getElementById("tableSelector")?.setAttribute("hidden", "true")
      selector.toggleAttribute("hidden", !opening)
      if (opening) updateSelected()
    }
    document
      .getElementById("cueSelectorClose")
      ?.addEventListener("click", () => {
        selector.setAttribute("hidden", "true")
      })
    options.onclick = (event) => {
      const target = event.target as HTMLElement | null
      const customAction = target?.closest<HTMLElement>(
        "[data-custom-cue-action]"
      )?.dataset.customCueAction
      if (customAction) {
        if (customAction === "shuffle") {
          const palettes = [
            ["#173f5f", "#0a1726", "#762a3a", "#e3bf67"],
            ["#6a244d", "#271024", "#121216", "#e6a84e"],
            ["#0b675f", "#06342f", "#40251c", "#f0d487"],
            ["#e5ddd0", "#6e4933", "#164b50", "#d59343"],
            ["#22272e", "#08090b", "#6b1524", "#c5d0dc"],
          ]
          const palette = palettes[Math.floor(Math.random() * palettes.length)]
          options
            .querySelectorAll<HTMLInputElement>("[data-custom-cue-colour]")
            .forEach((input, index) => {
              input.value = palette[index]
            })
          const patternSets = [
            ["maple", "burl", "linen", "diamond"],
            ["carbon", "straight", "leather", "chevron"],
            ["ash", "flame", "braid", "feather"],
          ]
          const patterns =
            patternSets[Math.floor(Math.random() * patternSets.length)]
          options
            .querySelectorAll<HTMLSelectElement>("[data-custom-cue-detail]")
            .forEach((input, index) => {
              input.value = patterns[index]
            })
          return
        }
        const details: Partial<Record<keyof CustomCueDetails, string>> = {}
        options
          .querySelectorAll<HTMLInputElement>("[data-custom-cue-colour]")
          .forEach((input) => {
            const key = input.dataset.customCueColour as
              keyof CustomCueColours | undefined
            if (key) details[key] = input.value
          })
        options
          .querySelectorAll<HTMLSelectElement>("[data-custom-cue-detail]")
          .forEach((input) => {
            const key = input.dataset.customCueDetail as
              keyof CustomCueDetails | undefined
            if (key) details[key] = input.value
          })
        saveCustomCueDetails(details)
        this.container.table.cue.setStyle(CUSTOM_CUE_STYLE_ID)
        this.container.lastEventTime = performance.now()
        updateSelected()
        return
      }

      const button = target?.closest("[data-cue-style]") as HTMLElement | null
      const styleId = button?.dataset.cueStyle
      if (!styleId) return
      this.container.table.cue.setStyle(styleId)
      this.container.lastEventTime = performance.now()
      updateSelected()
    }
    ;["pointerdown", "mousedown", "touchstart", "click"].forEach(
      (eventName) => {
        selector.addEventListener(eventName, (event) => event.stopPropagation())
      }
    )
  }

  private initTableSelector() {
    const selector = document.getElementById("tableSelector")
    const options = document.getElementById("tableStyleOptions")
    if (!selector || !options || !this.tableStyle) return

    options.innerHTML = TABLE_STYLES.map(
      (style) => `
        <button
          type="button"
          class="table-style-option"
          data-table-style="${style.id}"
          aria-pressed="false"
        >
          <span class="table-style-preview" aria-hidden="true">
            ${style.swatches
              .map(
                (color) =>
                  `<span class="table-style-swatch" style="background:${color}"></span>`
              )
              .join("")}
          </span>
          <span class="table-style-copy">
            <span class="table-style-heading">
              <strong>${style.name}</strong>
              <em>${style.profile === "chinese" ? "中式台型" : "美式台型"}</em>
            </span>
            <small>${style.description}</small>
          </span>
          <span class="table-style-check" aria-hidden="true">✓</span>
        </button>
      `
    ).join("")

    const updateSelected = () => {
      const current = this.container.view.assets.tableStyleId
      options
        .querySelectorAll<HTMLElement>("[data-table-style]")
        .forEach((button) => {
          const selected = button.dataset.tableStyle === current
          button.classList.toggle("is-selected", selected)
          button.setAttribute("aria-pressed", String(selected))
        })
    }
    updateSelected()

    this.tableStyle.onclick = () => {
      const opening = selector.hasAttribute("hidden")
      document.getElementById("helpOverlay")?.setAttribute("hidden", "true")
      document.getElementById("cueSelector")?.setAttribute("hidden", "true")
      selector.toggleAttribute("hidden", !opening)
      if (opening) updateSelected()
    }
    document
      .getElementById("tableSelectorClose")
      ?.addEventListener("click", () => {
        selector.setAttribute("hidden", "true")
      })
    options.onclick = (event) => {
      const button = (event.target as HTMLElement | null)?.closest(
        "[data-table-style]"
      ) as HTMLElement | null
      const styleId = button?.dataset.tableStyle
      if (!styleId) return
      selector.classList.add("is-loading")
      this.container.view.assets.setTableStyle(styleId, () => {
        selector.classList.remove("is-loading")
        this.container.view.warmup()
        this.container.lastEventTime = performance.now()
        updateSelected()
      })
    }
    ;["pointerdown", "mousedown", "touchstart", "click"].forEach(
      (eventName) => {
        selector.addEventListener(eventName, (event) => event.stopPropagation())
      }
    )
  }

  showOverlay(url: string) {
    const overlay = document.getElementById("helpOverlay")
    if (overlay) {
      const iframe = overlay.querySelector("iframe")
      if (iframe) {
        iframe.setAttribute("src", url)
      }
      overlay.removeAttribute("hidden")
    }
  }
}
