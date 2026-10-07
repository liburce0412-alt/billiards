export type MobileGestureState =
  "idle" | "pendingAim" | "aiming" | "camera" | "cameraDrain"

export const MOBILE_AIM_SENSITIVITY = {
  normal: 0.003,
  precision: 0.00065,
} as const

export interface MobileGesturePoint {
  x: number
  y: number
}

export interface MobileGestureCameraDelta {
  x: number
  y: number
  distance: number
}

export interface MobileGestureHandlers {
  onPrimaryDrag: (dx: number, dy: number) => void
  onCameraDrag: (delta: MobileGestureCameraDelta) => void
  onStateChange?: (state: MobileGestureState) => void
  onReset?: () => void
}

export function mobileCameraMetrics(
  points: Iterable<MobileGesturePoint>
): (MobileGesturePoint & { distance: number }) | undefined {
  const [first, second] = [...points]
  if (!first || !second) return
  return {
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
    distance: Math.hypot(second.x - first.x, second.y - first.y),
  }
}

/**
 * Owns every touch pointer that begins on the Three canvas. A two-finger
 * camera gesture drains all remaining pointers before a new one-finger aim
 * can begin, so D1 -> D2 -> U1 -> U2 cannot leak back into the aim handler.
 */
export class MobileGestureCoordinator {
  private readonly pointers = new Map<number, MobileGesturePoint>()
  private stateValue: MobileGestureState = "idle"
  private primaryPointerId?: number
  private cameraMetrics?: MobileGesturePoint & { distance: number }

  constructor(
    private readonly element: HTMLElement,
    private readonly handlers: MobileGestureHandlers
  ) {
    element.addEventListener("pointerdown", this.pointerDown)
    element.addEventListener("pointermove", this.pointerMove)
    element.addEventListener("pointerup", this.pointerEnd)
    element.addEventListener("pointercancel", this.pointerEnd)
    element.addEventListener("lostpointercapture", this.pointerLostCapture)
    globalThis.addEventListener("blur", this.reset)
    document.addEventListener("visibilitychange", this.visibilityChanged)
  }

  get state(): MobileGestureState {
    return this.stateValue
  }

  get pointerCount(): number {
    return this.pointers.size
  }

  getSnapshot() {
    return {
      state: this.stateValue,
      pointerCount: this.pointers.size,
      aimSensitivity: { ...MOBILE_AIM_SENSITIVITY },
    }
  }

  private setState(state: MobileGestureState) {
    if (this.stateValue === state) return
    this.stateValue = state
    this.handlers.onStateChange?.(state)
  }

  private pointerDown = (event: PointerEvent) => {
    if (event.pointerType !== "touch") return
    event.preventDefault()
    event.stopPropagation()
    this.element.setPointerCapture?.(event.pointerId)
    this.pointers.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    })

    if (this.stateValue === "cameraDrain") return
    if (this.pointers.size === 1) {
      this.primaryPointerId = event.pointerId
      this.setState("pendingAim")
      return
    }

    this.primaryPointerId = undefined
    this.cameraMetrics = mobileCameraMetrics(this.pointers.values())
    this.setState("camera")
  }

  private pointerMove = (event: PointerEvent) => {
    if (event.pointerType !== "touch") return
    const previous = this.pointers.get(event.pointerId)
    if (!previous) return
    event.preventDefault()
    event.stopPropagation()
    const next = { x: event.clientX, y: event.clientY }
    this.pointers.set(event.pointerId, next)

    if (this.stateValue === "camera") {
      const metrics = mobileCameraMetrics(this.pointers.values())
      const last = this.cameraMetrics
      if (!metrics || !last) return
      this.cameraMetrics = metrics
      this.handlers.onCameraDrag({
        x: metrics.x - last.x,
        y: metrics.y - last.y,
        distance: last.distance - metrics.distance,
      })
      return
    }

    if (
      this.stateValue === "cameraDrain" ||
      event.pointerId !== this.primaryPointerId
    ) {
      return
    }

    const dx = next.x - previous.x
    const dy = next.y - previous.y
    if (this.stateValue === "pendingAim" && Math.hypot(dx, dy) >= 1) {
      this.setState("aiming")
    }
    if (this.stateValue === "aiming") {
      this.handlers.onPrimaryDrag(dx, dy)
    }
  }

  private pointerEnd = (event: PointerEvent) => {
    if (event.pointerType !== "touch" || !this.pointers.has(event.pointerId)) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    this.pointers.delete(event.pointerId)
    if (this.element.hasPointerCapture?.(event.pointerId)) {
      this.element.releasePointerCapture?.(event.pointerId)
    }

    if (this.stateValue === "camera" || this.stateValue === "cameraDrain") {
      this.cameraMetrics = undefined
      if (this.pointers.size > 0) {
        this.setState("cameraDrain")
      } else {
        this.primaryPointerId = undefined
        this.setState("idle")
      }
      return
    }

    if (event.pointerId === this.primaryPointerId) {
      this.primaryPointerId = undefined
      this.setState("idle")
    }
  }

  private pointerLostCapture = (event: PointerEvent) => {
    if (event.pointerType === "touch" && this.pointers.has(event.pointerId)) {
      this.reset()
    }
  }

  private visibilityChanged = () => {
    if (document.visibilityState !== "visible") this.reset()
  }

  reset = () => {
    if (this.pointers.size === 0 && this.stateValue === "idle") return
    const capturedPointerIds = [...this.pointers.keys()]
    // Clear our bookkeeping before releasing captures. Some browsers dispatch
    // lostpointercapture synchronously from releasePointerCapture(); keeping a
    // stale pointer in the map there would recursively enter reset().
    this.pointers.clear()
    this.primaryPointerId = undefined
    this.cameraMetrics = undefined
    this.setState("idle")
    for (const pointerId of capturedPointerIds) {
      if (this.element.hasPointerCapture?.(pointerId)) {
        this.element.releasePointerCapture?.(pointerId)
      }
    }
    this.handlers.onReset?.()
  }

  dispose() {
    this.reset()
    this.element.removeEventListener("pointerdown", this.pointerDown)
    this.element.removeEventListener("pointermove", this.pointerMove)
    this.element.removeEventListener("pointerup", this.pointerEnd)
    this.element.removeEventListener("pointercancel", this.pointerEnd)
    this.element.removeEventListener(
      "lostpointercapture",
      this.pointerLostCapture
    )
    globalThis.removeEventListener("blur", this.reset)
    document.removeEventListener("visibilitychange", this.visibilityChanged)
  }
}
