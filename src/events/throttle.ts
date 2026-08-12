import { EventType } from "./eventtype"
import { GameEvent } from "./gameevent"

/**
 * Throttle AIM events.
 */
export class Throttle {
  period: number
  sentTime: number = 0
  apply = (_) => {}
  private pending?: GameEvent
  private timer?: ReturnType<typeof setTimeout>

  constructor(period, apply) {
    this.period = period
    this.apply = apply
  }

  send(event: GameEvent) {
    if (event.type !== EventType.AIM) {
      this.flush()
      this.apply(event)
      return
    }

    const now = performance.now()
    const snapshot = this.copyEvent(event)
    if (now >= this.sentTime + this.period) {
      this.clearTimer()
      this.pending = undefined
      this.apply(snapshot)
      this.sentTime = now
      return
    }

    this.pending = snapshot
    if (!this.timer) {
      this.timer = setTimeout(
        () => {
          this.timer = undefined
          this.flush()
        },
        Math.max(0, this.sentTime + this.period - now)
      )
    }
  }

  flush() {
    if (!this.pending) return
    const pending = this.pending
    this.pending = undefined
    this.clearTimer()
    this.apply(pending)
    this.sentTime = performance.now()
  }

  private copyEvent(event: GameEvent): GameEvent {
    const copy = (event as GameEvent & { copy?: () => GameEvent }).copy
    return typeof copy === "function" ? copy.call(event) : event
  }

  private clearTimer() {
    if (!this.timer) return
    clearTimeout(this.timer)
    this.timer = undefined
  }
}
