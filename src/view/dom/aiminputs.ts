import { powerRatioFromControl } from "../powercontrol"
import { Color, Vector3 } from "three"
import { Container } from "../../container/container"
import { Input } from "../../events/input"
import { Session } from "../../network/client/session"
import { Overlap } from "../../utils/overlap"
import { unitAtAngle } from "../../utils/three-utils"
import { id } from "../../utils/dom"
import { TimeoutButton } from "../timeoutbutton"
import { AngleInput } from "./angleinput"
import { maxPower } from "../../model/physics/constants"
import { localizeText } from "../../utils/locale"
import { PowerArcRenderer } from "../powerarcrenderer"

export const DEFAULT_SHOT_CLOCK_MS = 35000
export const SHOT_CLOCK_CRITICAL_MS = 7000

export function shotClockDuration(search: string): number {
  const seconds = new URLSearchParams(search).get("shotClock")
  const duration = Number(seconds) * 1000
  return seconds && Number.isFinite(duration) && duration > 0
    ? duration
    : DEFAULT_SHOT_CLOCK_MS
}

export class AimInputs {
  readonly ballContainerWrapperElement
  readonly ballContainerElement
  readonly cueBallElement
  readonly cueTipElement
  readonly powerSliderContainerElement
  readonly cuePowerElement
  readonly tiltSliderContainerElement
  readonly openElevationElement
  readonly cueTiltElement: AngleInput
  /** Shared button for both "Hit" and "Place Ball" actions. */
  readonly cueHitElement
  readonly repositionCueBallElement
  readonly objectBallStyle: CSSStyleDeclaration | undefined
  readonly objectBallOverlap: HTMLElement | null
  readonly container: Container
  readonly overlap: Overlap

  ballWidth
  ballHeight
  tipRadius
  private static readonly TIP_SCALE = 1.3
  private controlsDisabled = true
  private readonly timeoutButton: TimeoutButton | undefined
  private sliderAnimId: number | null = null
  private readonly shotDockElement = id("panel")
  private readonly shotDockToggleElement = id(
    "shotDockToggle"
  ) as HTMLButtonElement | null
  private readonly cuePowerValueElement = id(
    "cuePowerValue"
  ) as HTMLOutputElement | null
  private powerPointerId?: number
  private powerBeforeGesture = 0
  private powerGestureStartY = 0
  private powerGestureArmed = false
  private powerGestureCancelled = false
  private readonly powerOrientationQuery = globalThis.matchMedia?.(
    "(orientation: landscape) and (pointer: coarse)"
  )
  private readonly powerArcRenderer: PowerArcRenderer | undefined
  private readonly listenerDisposers: Array<() => void> = []
  private tiltOpenAnimationId?: number
  private readonly gameOverflowToggle = id(
    "gameOverflowToggle"
  ) as HTMLButtonElement | null
  private readonly gameOverflowMenu = id("gameOverflowMenu")
  private readonly precisionAimButton =
    document.querySelector<HTMLButtonElement>("[data-precision-aim]")
  private readonly elevationValueElement = id(
    "elevationValue"
  ) as HTMLOutputElement | null
  private readonly elevationDownElement = id(
    "elevationDown"
  ) as HTMLButtonElement | null
  private readonly elevationUpElement = id(
    "elevationUp"
  ) as HTMLButtonElement | null

  constructor(container) {
    this.container = container
    this.ballContainerWrapperElement = id("ballContainerWrapper")
    this.ballContainerElement = id("ballContainer")
    this.cueBallElement = id("cueBall")
    this.cueTipElement = id("cueTip")
    this.powerSliderContainerElement = id("powerSliderContainer")
    this.cuePowerElement = id("cuePower")
    this.tiltSliderContainerElement = id("tiltSliderContainer")
    this.openElevationElement = id("openElevation") as HTMLButtonElement
    this.cueTiltElement = id("cueTilt") as AngleInput
    this.cueHitElement = id("cueHit") as HTMLButtonElement
    this.repositionCueBallElement = id("repositionCueBall") as HTMLButtonElement
    this.powerArcRenderer = PowerArcRenderer.mount(
      this.powerSliderContainerElement
    )
    this.syncPowerOrientation()
    if (this.cueHitElement) {
      this.timeoutButton = new TimeoutButton(this.cueHitElement, {
        duration: shotClockDuration(location.search),
        criticalMs: SHOT_CLOCK_CRITICAL_MS,
        onComplete: () => {
          if (this.controlsDisabled) return
          this.container.notifyLocal(
            {
              type: "Info",
              title: "击球时间提示",
              subtext: "请主动确认击球；系统不会代替你出杆",
            },
            2200
          )
        },
      })
    }
    this.objectBallStyle = id("objectBall")?.style
    this.objectBallOverlap = id("objectBallOverlap")
    this.overlap = new Overlap(this.container.table.balls)
    if (this.cuePowerElement) {
      this.container.table.cue.aim.power =
        powerRatioFromControl(Number(this.cuePowerElement.value)) * maxPower
      this.updatePowerProgress()
    }
    this.updateTiltSlider(this.container.table.cue.aim.elevation)
    this.restoreDockState()
    this.addListeners()
    this.updateVisualState(0, 0)
    if (Session.isSpectator()) {
      this.setDisabled(true)
    }
  }

  addListeners() {
    this.listen(this.cueBallElement, "pointermove", this.mousemove)
    this.listen(this.cueBallElement, "click", this.cueBallClick)
    this.listen(this.cueBallElement, "dblclick", this.toggleTiltControl)
    this.listen(this.openElevationElement, "click", this.toggleTiltControl)
    this.listen(this.cueHitElement, "click", this.hit)
    this.listen(this.cuePowerElement, "input", this.powerChanged)
    this.listen(
      this.powerSliderContainerElement,
      "pointerdown",
      this.powerPointerDown
    )
    this.listen(
      this.powerSliderContainerElement,
      "pointermove",
      this.powerPointerMove
    )
    this.listen(
      this.powerSliderContainerElement,
      "pointerup",
      this.powerPointerUp
    )
    this.listen(
      this.powerSliderContainerElement,
      "pointercancel",
      this.powerPointerCancel
    )
    this.listen(
      this.powerSliderContainerElement,
      "lostpointercapture",
      this.powerPointerLostCapture
    )
    this.listen(this.powerSliderContainerElement, "keydown", this.powerKeyDown)
    this.listen(this.shotDockToggleElement, "click", this.toggleDock)
    this.listen(this.gameOverflowToggle, "click", this.toggleGameOverflow)
    this.listen(this.precisionAimButton, "click", this.togglePrecisionAim)
    this.listen(this.elevationDownElement, "click", this.decreaseElevation)
    this.listen(this.elevationUpElement, "click", this.increaseElevation)
    document
      .querySelectorAll<HTMLElement>("[data-control-target]")
      .forEach((control) => {
        this.listen(control, "click", () => {
          if (control.dataset.precisionAim) return
          const target = control.dataset.controlTarget
          if (!target) return
          if (target === "ballContainer") {
            this.cueBallElement?.focus()
            return
          }
          id(target)?.click()
        })
      })
    this.listen(this.cueTiltElement, "input", this.tiltChanged)
    if (!("ontouchstart" in globalThis)) {
      this.listen(id("viewP1"), "dblclick", this.hit)
    }
    this.listen(document, "wheel", this.mousewheel, { passive: false })
    this.listen(globalThis, "blur", this.cancelActivePowerGesture)
    this.listen(document, "visibilitychange", this.cancelPowerGestureWhenHidden)
    this.listen(this.powerOrientationQuery, "change", this.syncPowerOrientation)
  }

  private listen<T extends Event>(
    target: EventTarget | null | undefined,
    type: string,
    listener: (event: T) => void,
    options?: boolean | AddEventListenerOptions
  ) {
    if (!target) return
    const eventListener = listener as EventListener
    target.addEventListener(type, eventListener, options)
    this.listenerDisposers.push(() =>
      target.removeEventListener(type, eventListener, options)
    )
  }

  private readonly cueBallClick = (event: Event) => this.adjustSpin(event)
  private readonly decreaseElevation = () => this.adjustElevationByDegrees(-1)
  private readonly increaseElevation = () => this.adjustElevationByDegrees(1)

  dispose() {
    this.controlsDisabled = true
    this.cancelPowerReturnAnimation()
    if (this.tiltOpenAnimationId !== undefined) {
      cancelAnimationFrame(this.tiltOpenAnimationId)
      this.tiltOpenAnimationId = undefined
    }
    this.finishPowerGesture()
    this.hideRepositionCueBall()
    this.timeoutButton?.dispose()
    this.listenerDisposers.splice(0).forEach((dispose) => dispose())
    this.powerArcRenderer?.dispose()
  }

  setButtonText(text) {
    if (!this.cueHitElement) return
    const placement = text === "Place\nBall" || text === "Confirm cue ball"
    this.shotDockElement?.setAttribute(
      "data-action-mode",
      placement ? "placement" : "shot"
    )
    this.cueHitElement.setAttribute(
      "aria-label",
      placement ? "确认母球位置并进入开球瞄准" : localizeText(text)
    )
    const label = this.cueHitElement.querySelector(".shot-label")
    if (label) {
      label.textContent = localizeText(text)
    } else {
      this.cueHitElement.innerText = localizeText(text)
    }
    const detail = this.cueHitElement.querySelector("small")
    if (detail) {
      detail.textContent = placement ? "确认后进入开球" : "点击确认"
    }
  }

  showRepositionCueBall(handler: () => void) {
    if (!this.repositionCueBallElement) return
    // Ball-in-hand is a required game action. Never leave it hidden behind a
    // previously persisted collapsed dock state on touch devices.
    this.setDockCollapsed(false)
    this.hideTiltControl()
    if (this.openElevationElement) this.openElevationElement.hidden = true
    this.repositionCueBallElement.onclick = handler
    this.repositionCueBallElement.hidden = false
  }

  hideRepositionCueBall() {
    if (!this.repositionCueBallElement) return
    this.repositionCueBallElement.hidden = true
    this.repositionCueBallElement.onclick = null
    if (this.openElevationElement) this.openElevationElement.hidden = false
  }

  setDisabled(disabled: boolean) {
    this.controlsDisabled = disabled || Session.isSpectator()
    this.shotDockElement?.setAttribute(
      "data-controls-state",
      this.controlsDisabled ? "waiting" : "ready"
    )
    if (this.controlsDisabled && this.powerPointerId !== undefined) {
      this.cancelPowerGesture()
    }
    this.updateHitButton()
    this.updatePowerElement()
    this.updateTiltElement()
    this.updateCueBall()
    this.updateBallContainer()
    if (this.objectBallStyle) {
      if (this.controlsDisabled) {
        this.objectBallStyle.visibility = "hidden"
      } else {
        this.showOverlap()
      }
    }
  }

  private updateBallContainer() {
    if (this.ballContainerWrapperElement) {
      this.ballContainerWrapperElement.classList.toggle(
        "is-disabled",
        this.controlsDisabled
      )
    }
    if (this.ballContainerElement) {
      this.ballContainerElement.classList.toggle(
        "is-disabled",
        this.controlsDisabled
      )
    }
  }

  private updateHitButton() {
    if (this.cueHitElement) {
      this.cueHitElement.disabled = this.controlsDisabled
      if (this.controlsDisabled) {
        this.timeoutButton?.cancel()
      } else {
        const useShotClock =
          !this.container.isSinglePlayer || Session.isBotMode()
        if (useShotClock) {
          this.timeoutButton?.startTimer()
        }
      }
    }
  }

  private updatePowerElement() {
    if (this.powerSliderContainerElement) {
      this.powerSliderContainerElement.classList.toggle(
        "is-disabled",
        this.controlsDisabled
      )
    }
    if (this.cuePowerElement) {
      this.cuePowerElement.disabled = this.controlsDisabled
      this.cuePowerElement.classList.toggle(
        "is-disabled",
        this.controlsDisabled
      )
    }
  }

  private updateTiltElement() {
    if (this.tiltSliderContainerElement) {
      this.tiltSliderContainerElement.classList.toggle(
        "is-disabled",
        this.controlsDisabled
      )
      if (this.controlsDisabled) {
        this.tiltSliderContainerElement.hidden = true
      }
    }
    if (this.cueTiltElement) {
      this.cueTiltElement.disabled = this.controlsDisabled
    }
    if (this.openElevationElement) {
      this.openElevationElement.disabled = this.controlsDisabled
    }
  }

  private updateCueBall() {
    if (this.cueBallElement) {
      this.cueBallElement.style.pointerEvents = this.controlsDisabled
        ? "none"
        : "auto"
      this.cueBallElement.classList.toggle("is-disabled", this.controlsDisabled)
    }
  }

  isDisabled(): boolean {
    return this.controlsDisabled
  }

  getPowerGestureState() {
    return {
      value: Number(this.cuePowerElement?.value ?? 0),
      armed: this.powerGestureArmed,
      cancelled: this.powerGestureCancelled,
      pointerActive: this.powerPointerId !== undefined,
      orientation: this.isVerticalPower() ? "vertical" : "horizontal",
    } as const
  }

  mousemove = (e) => {
    e.buttons === 1 && this.adjustSpin(e)
  }

  readDimensions() {
    this.ballWidth = this.cueBallElement?.offsetWidth
    this.ballHeight = this.cueBallElement?.offsetHeight
    this.tipRadius = this.cueTipElement?.offsetWidth / 2
  }

  adjustSpin(e) {
    if (this.controlsDisabled) {
      return
    }
    this.readDimensions()
    this.container.table.cue.setSpin(
      new Vector3(
        -(e.offsetX - this.ballWidth / 2) /
          (this.ballWidth / 2) /
          AimInputs.TIP_SCALE,
        -(e.offsetY - this.ballHeight / 2) /
          (this.ballHeight / 2) /
          AimInputs.TIP_SCALE
      ),
      this.container.table
    )
    this.container.lastEventTime = performance.now()
    this.container.sendAimPreview()
  }

  updateVisualState(x: number, y: number) {
    const elt = this.cueTipElement?.style
    if (elt) {
      // Use percentages so the tip scales automatically with the ball
      elt.left = ((-(x * AimInputs.TIP_SCALE) / 2 + 0.5) * 100).toString() + "%"
      elt.top = ((-(y * AimInputs.TIP_SCALE) / 2 + 0.5) * 100).toString() + "%"
      elt.transform = "translate(-50%, -50%)"
    }
    this.showOverlap()
  }

  showOverlap() {
    if (this.objectBallStyle) {
      const table = this.container.table
      if (table.cue) {
        const dir = unitAtAngle(table.cue.aim.angle)
        const closest = this.overlap.getOverlapOffset(table.cueball, dir)
        if (closest) {
          this.readDimensions()
          this.objectBallStyle.visibility = "visible"
          this.objectBallStyle.left =
            (closest.overlap * this.ballWidth) / 2 +
            this.cueBallElement.offsetLeft +
            "px"
          this.objectBallStyle.backgroundColor = new Color(0, 0, 0)
            .lerp(closest.ball.ballmesh.color, 0.5)
            .getStyle()
          if (this.objectBallOverlap) {
            const overlapPercent = Math.round(
              (1 - Math.min(Math.abs(closest.overlap) / 2, 1)) * 100
            )
            this.objectBallOverlap.innerText = overlapPercent + "%"
          }
        } else {
          this.objectBallStyle.visibility = "hidden"
          if (this.objectBallOverlap) {
            this.objectBallOverlap.innerText = ""
          }
        }
      }
    }
  }

  private updatePowerProgress() {
    if (this.cuePowerElement) {
      const value = Number(this.cuePowerElement.value)
      const percent = value * 100
      this.setPowerPresentation(value)
      this.powerSliderContainerElement?.setAttribute(
        "aria-valuenow",
        Math.round(percent).toString()
      )
    }
  }

  private setPowerPresentation(value: number) {
    const bounded = Math.max(0, Math.min(1, value))
    const percent = bounded * 100
    this.cuePowerElement?.style.setProperty("--p", percent + "%")
    this.powerSliderContainerElement?.style.setProperty(
      "--power",
      percent + "%"
    )
    if (this.cuePowerValueElement) {
      this.cuePowerValueElement.value = Math.round(percent).toString()
    }
    this.powerArcRenderer?.setValue(bounded)
  }

  powerChanged = (_) => {
    if (this.controlsDisabled) {
      return
    }
    this.container.table.cue.setControlPower(Number(this.cuePowerElement.value))
    this.updatePowerProgress()
    this.container.lastEventTime = performance.now()
    this.container.sendAimPreview()
  }

  tiltChanged = (_) => {
    if (this.controlsDisabled || !this.cueTiltElement) {
      return
    }
    this.container.table.cue.setElevation(this.cueTiltElement.elevation)
    this.updateElevationReadout()
    this.container.lastEventTime = performance.now()
    this.container.sendAimPreview()
  }

  updatePowerSlider(power) {
    if (this.cuePowerElement) {
      this.cancelPowerReturnAnimation()
      this.cuePowerElement.value = power
      this.updatePowerProgress()
    }
  }

  updateTiltSlider(elevation) {
    if (this.cueTiltElement) {
      this.cueTiltElement.elevation = elevation
      this.updateElevationReadout()
      if (this.controlsDisabled) {
        if (elevation > 0) {
          this.showTiltControl()
        } else {
          this.hideTiltControl()
        }
      }
    }
  }

  private togglePrecisionAim = () => {
    const enabled = document.body.dataset.precisionAim !== "true"
    document.body.dataset.precisionAim = String(enabled)
    this.precisionAimButton?.setAttribute("aria-pressed", String(enabled))
    this.precisionAimButton?.classList.toggle("is-active", enabled)
    this.cueBallElement?.focus()
  }

  private adjustElevationByDegrees(delta: number) {
    if (this.controlsDisabled || !this.cueTiltElement) return
    const degrees = this.cueTiltElement.elevation * (180 / Math.PI)
    this.cueTiltElement.elevation =
      Math.max(0, Math.min(72, degrees + delta)) * (Math.PI / 180)
    this.tiltChanged(undefined)
    this.updateElevationReadout()
  }

  private updateElevationReadout() {
    if (!this.elevationValueElement || !this.cueTiltElement) return
    this.elevationValueElement.value = `${Math.round(
      this.cueTiltElement.elevation * (180 / Math.PI)
    )}°`
  }

  showTiltControl() {
    if (!this.tiltSliderContainerElement) {
      return
    }
    this.tiltSliderContainerElement.hidden = false
    if (this.tiltOpenAnimationId !== undefined) {
      cancelAnimationFrame(this.tiltOpenAnimationId)
    }
    this.tiltOpenAnimationId = requestAnimationFrame(() => {
      this.tiltOpenAnimationId = undefined
      this.tiltSliderContainerElement?.classList.add("is-open")
    })
  }

  toggleTiltControl = (e?: any) => {
    if (this.controlsDisabled || !this.tiltSliderContainerElement) {
      return
    }
    e?.preventDefault?.()
    e?.stopPropagation?.()
    if (this.tiltSliderContainerElement.hidden) {
      this.showTiltControl()
      if (this.gameOverflowMenu) this.gameOverflowMenu.hidden = true
      this.gameOverflowToggle?.setAttribute("aria-expanded", "false")
    } else {
      this.hideTiltControl()
    }
  }

  hideTiltControl() {
    if (this.tiltSliderContainerElement) {
      this.tiltSliderContainerElement.classList.remove("is-open")
      this.tiltSliderContainerElement.hidden = true
    }
  }

  hit = (_) => {
    if (this.controlsDisabled) {
      return
    }
    this.container.table.cue.setControlPower(
      Number(this.cuePowerElement?.value)
    )
    this.container.sendAimPreview()
    this.hideTiltControl()
    this.container.inputQueue.push(new Input(0, "SpaceUp"))
  }

  /**
   * The "Hit" animation logic for the slider.
   * Reset the input after the strike has been consumed, while preserving the
   * recorded cue state used by physics/replays until the next Aim begins.
   */
  animateSliderHit() {
    this.cancelPowerReturnAnimation()
    const startValue = Number.parseFloat(this.cuePowerElement.value)
    this.cuePowerElement.value = "0"
    this.powerSliderContainerElement?.setAttribute("aria-valuenow", "0")
    const reduceMotion = globalThis.matchMedia?.(
      "(prefers-reduced-motion: reduce)"
    ).matches
    if (reduceMotion) {
      this.setPowerPresentation(0)
      return
    }
    const duration = 160
    let start: number | undefined

    const animate = (now: number) => {
      start ??= now
      const elapsed = now - start
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      this.setPowerPresentation(startValue * (1 - eased))

      if (progress < 1) {
        this.sliderAnimId = requestAnimationFrame(animate)
      } else {
        this.sliderAnimId = null
      }
    }
    this.sliderAnimId = requestAnimationFrame(animate)
  }

  private cancelPowerReturnAnimation() {
    if (this.sliderAnimId === null) return
    cancelAnimationFrame(this.sliderAnimId)
    this.sliderAnimId = null
  }

  private restoreDockState() {
    let collapsed = false
    try {
      collapsed =
        globalThis.localStorage?.getItem("break-builder.shot-dock") ===
        "collapsed"
    } catch {
      // Storage is optional; expanded is the accessible default.
    }
    this.setDockCollapsed(collapsed)
  }

  private toggleDock = () => {
    if (this.powerPointerId !== undefined) return
    const collapsed = this.shotDockElement?.dataset.dockState !== "collapsed"
    this.setDockCollapsed(collapsed)
    try {
      globalThis.localStorage?.setItem(
        "break-builder.shot-dock",
        collapsed ? "collapsed" : "expanded"
      )
    } catch {
      // The live control still works when storage is unavailable.
    }
  }

  private setDockCollapsed(collapsed: boolean) {
    document.body.classList.toggle("shot-dock-collapsed", collapsed)
    if (this.shotDockElement) {
      this.shotDockElement.dataset.dockState = collapsed
        ? "collapsed"
        : "expanded"
    }
    if (this.shotDockToggleElement) {
      this.shotDockToggleElement.setAttribute(
        "aria-expanded",
        String(!collapsed)
      )
      this.shotDockToggleElement.setAttribute(
        "aria-label",
        collapsed ? "展开击球操作" : "收起击球操作"
      )
      const label = this.shotDockToggleElement.querySelector("span")
      if (label) label.textContent = collapsed ? "展开操作" : "收起操作"
      const icon = this.shotDockToggleElement.querySelector("i")
      icon?.classList.toggle("ph-caret-up", collapsed)
      icon?.classList.toggle("ph-caret-down", !collapsed)
    }
  }

  private toggleGameOverflow = (event: Event) => {
    event.stopPropagation()
    if (!this.gameOverflowMenu || !this.gameOverflowToggle) return
    const opening = this.gameOverflowMenu.hidden
    this.gameOverflowMenu.hidden = !opening
    this.gameOverflowToggle.setAttribute("aria-expanded", String(opening))
  }

  private powerKeyDown = (event: KeyboardEvent) => {
    if (this.controlsDisabled || !this.cuePowerElement) return
    if (event.key === "Escape" && this.powerPointerId !== undefined) {
      event.preventDefault()
      this.cancelPowerGesture()
      return
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      if (Number(this.cuePowerElement.value) >= 0.01) {
        this.cueHitElement?.click()
      }
      return
    }
    const value = this.powerValueForKey(
      event,
      Number(this.cuePowerElement.value)
    )
    if (value === undefined) return
    event.preventDefault()
    this.cuePowerElement.value = value.toFixed(2)
    this.container.table.cue.setControlPower(value)
    this.updatePowerProgress()
    this.container.lastEventTime = performance.now()
    this.container.sendAimPreview()
  }

  private powerValueForKey(event: KeyboardEvent, current: number) {
    if (event.key === "Home") return 0
    if (event.key === "End") return 1
    const increase =
      event.key === "ArrowRight" ||
      event.key === "ArrowDown" ||
      event.key === "PageUp"
    const decrease =
      event.key === "ArrowLeft" ||
      event.key === "ArrowUp" ||
      event.key === "PageDown"
    if (!increase && !decrease) return
    let step = 0.01
    if (event.key === "PageUp" || event.key === "PageDown") step = 0.1
    else if (event.shiftKey) step = 0.05
    return Math.max(0, Math.min(1, current + (increase ? step : -step)))
  }

  private powerPointerDown = (event: PointerEvent) => {
    if (
      this.controlsDisabled ||
      this.powerPointerId !== undefined ||
      event.button !== 0 ||
      !this.powerSliderContainerElement
    ) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    this.cancelPowerReturnAnimation()
    this.powerPointerId = event.pointerId
    this.powerBeforeGesture = Number(this.cuePowerElement?.value ?? 0)
    this.powerGestureStartY = event.clientY
    this.powerGestureArmed = !this.isVerticalPower()
    this.powerGestureCancelled = false
    this.powerSliderContainerElement.dataset.gesture = this.powerGestureArmed
      ? "charging"
      : "pending"
    this.powerSliderContainerElement.setPointerCapture?.(event.pointerId)
    if (this.powerGestureArmed) this.updatePowerFromPointer(event)
  }

  private powerPointerMove = (event: PointerEvent) => {
    if (event.pointerId !== this.powerPointerId) return
    event.preventDefault()
    event.stopPropagation()
    if (
      this.isVerticalPower() &&
      !this.powerGestureArmed &&
      event.clientY - this.powerGestureStartY >= 8
    ) {
      this.powerGestureArmed = true
    }
    if (!this.powerGestureArmed) return
    this.updatePowerFromPointer(event)
  }

  private updatePowerFromPointer(event: PointerEvent) {
    const rect = this.powerSliderContainerElement?.getBoundingClientRect()
    if (!rect || !this.cuePowerElement) return
    if (this.isVerticalPower()) {
      if (this.powerGestureCancelled) {
        if (event.clientX >= rect.left - 32) {
          this.powerGestureCancelled = false
        }
      } else if (event.clientX < rect.left - 48) {
        this.powerGestureCancelled = true
      }
    } else {
      const cancellationMargin = 56
      this.powerGestureCancelled =
        event.clientY < rect.top - cancellationMargin ||
        event.clientY > rect.bottom + cancellationMargin
    }
    this.powerSliderContainerElement.dataset.gesture = this
      .powerGestureCancelled
      ? "cancel"
      : "charging"
    if (this.powerGestureCancelled) return
    const value =
      this.powerArcRenderer
        ?.getGeometry()
        .valueFromPointer(
          event.clientX - rect.left,
          event.clientY - rect.top
        ) ??
      Math.max(
        0,
        Math.min(
          1,
          this.isVerticalPower()
            ? (event.clientY - rect.top) / Math.max(1, rect.height)
            : (event.clientX - rect.left) / Math.max(1, rect.width)
        )
      )
    this.cuePowerElement.value = value.toFixed(2)
    this.container.table.cue.setControlPower(value)
    this.updatePowerProgress()
    this.container.lastEventTime = performance.now()
    this.container.sendAimPreview()
  }

  private powerPointerUp = (event: PointerEvent) => {
    if (event.pointerId !== this.powerPointerId) return
    event.preventDefault()
    event.stopPropagation()
    // Touch devices may coalesce the last move into pointerup. Commit the
    // release position, including cancellation, instead of the previous frame.
    if (this.powerGestureArmed) this.updatePowerFromPointer(event)
    const commit =
      this.powerGestureArmed &&
      !this.powerGestureCancelled &&
      Number(this.cuePowerElement?.value ?? 0) >= 0.01
    this.finishPowerGesture()
    if (!commit) {
      this.restorePowerBeforeGesture()
      return
    }
    this.cueHitElement?.click()
  }

  private powerPointerCancel = (event: PointerEvent) => {
    if (event.pointerId !== this.powerPointerId) return
    this.cancelPowerGesture()
  }

  private powerPointerLostCapture = (event: PointerEvent) => {
    if (event.pointerId === this.powerPointerId) this.cancelPowerGesture()
  }

  private cancelActivePowerGesture = () => {
    if (this.powerPointerId !== undefined) this.cancelPowerGesture()
  }

  private cancelPowerGestureWhenHidden = () => {
    if (document.visibilityState !== "visible") {
      this.cancelActivePowerGesture()
    }
  }

  private cancelPowerGesture() {
    this.finishPowerGesture()
    this.restorePowerBeforeGesture()
  }

  private restorePowerBeforeGesture() {
    if (!this.cuePowerElement) return
    this.cuePowerElement.value = this.powerBeforeGesture.toFixed(2)
    if (!this.controlsDisabled) {
      this.container.table.cue.setControlPower(this.powerBeforeGesture)
      this.container.sendAimPreview()
    }
    this.updatePowerProgress()
  }

  private finishPowerGesture() {
    const pointerId = this.powerPointerId
    this.powerPointerId = undefined
    this.powerGestureArmed = false
    this.powerGestureCancelled = false
    delete this.powerSliderContainerElement?.dataset.gesture
    if (
      pointerId !== undefined &&
      this.powerSliderContainerElement?.hasPointerCapture?.(pointerId)
    ) {
      this.powerSliderContainerElement?.releasePointerCapture?.(pointerId)
    }
  }

  private isVerticalPower() {
    return this.powerOrientationQuery?.matches === true
  }

  private syncPowerOrientation = () => {
    const orientation = this.isVerticalPower() ? "vertical" : "horizontal"
    this.powerSliderContainerElement?.setAttribute(
      "aria-orientation",
      orientation
    )
    this.powerSliderContainerElement?.setAttribute(
      "data-orientation",
      orientation
    )
    this.powerArcRenderer?.setOrientation(orientation)
  }

  mousewheel = (e) => {
    if (e.ctrlKey) {
      e.preventDefault()
      return
    }
    if (this.controlsDisabled) {
      return
    }
    if (this.cuePowerElement) {
      this.cuePowerElement.value = (
        Number(this.cuePowerElement.value) -
        Math.sign(e.deltaY) / 10
      ).toString()
      this.container.table.cue.setControlPower(
        Number(this.cuePowerElement.value)
      )
      this.updatePowerProgress()
      this.container.lastEventTime = performance.now()
      this.container.sendAimPreview()
    }
  }
}
