import { Container } from "../container/container"
import { getButton } from "../utils/dom"
import { Session } from "../network/client/session"
import { ConcedeEvent } from "../events/concedeevent"
import { ExportUtils } from "../utils/export-utils"
import { CUE_STYLES } from "./cuestyle"
import { TABLE_STYLES } from "./tablestyle"

export class Menu {
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
        this.toggleHelpOverlay()
      }
    }
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
            title: "Concede Game",
            subtext: "opponent will win",
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

  private initCueSelector() {
    const selector = document.getElementById("cueSelector")
    const options = document.getElementById("cueStyleOptions")
    if (!selector || !options || !this.cueStyle) return

    options.innerHTML = CUE_STYLES.map(
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

    const updateSelected = () => {
      const current = this.container.table.cue.styleId
      options
        .querySelectorAll<HTMLElement>("[data-cue-style]")
        .forEach((button) => {
          const selected = button.dataset.cueStyle === current
          button.classList.toggle("is-selected", selected)
          button.setAttribute("aria-pressed", String(selected))
        })
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
      const button = (event.target as HTMLElement | null)?.closest(
        "[data-cue-style]"
      ) as HTMLElement | null
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
