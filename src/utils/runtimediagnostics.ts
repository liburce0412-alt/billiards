export interface RuntimeDiagnosticsSnapshot {
  averageFps: number
  worstFrameMs: number
  longTasks: number[]
  physicsRecoveries: number
  contextLosses: number
}

export class RuntimeDiagnostics {
  private lastFrame?: number
  private readonly frameTimes: number[] = []
  private readonly longTasks: number[] = []
  private physicsRecoveries = 0
  private contextLosses = 0

  constructor() {
    this.observeLongTasks()
  }

  recordFrame(timestamp: number): void {
    if (this.lastFrame !== undefined) {
      this.frameTimes.push(Math.max(0, timestamp - this.lastFrame))
      if (this.frameTimes.length > 180) this.frameTimes.shift()
    }
    this.lastFrame = timestamp
  }

  recordPhysicsRecovery(): void {
    this.physicsRecoveries++
  }

  recordContextLoss(): void {
    this.contextLosses++
  }

  snapshot(): RuntimeDiagnosticsSnapshot {
    const total = this.frameTimes.reduce((sum, frame) => sum + frame, 0)
    return {
      averageFps:
        total > 0 ? Math.round((1000 * this.frameTimes.length) / total) : 0,
      worstFrameMs: Math.round(Math.max(0, ...this.frameTimes)),
      longTasks: [...this.longTasks],
      physicsRecoveries: this.physicsRecoveries,
      contextLosses: this.contextLosses,
    }
  }

  private observeLongTasks(): void {
    if (typeof PerformanceObserver === "undefined") return
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          this.longTasks.push(Math.round(entry.duration))
          if (this.longTasks.length > 20) this.longTasks.shift()
        }
      })
      observer.observe({ entryTypes: ["longtask"] })
    } catch {
      // Long-task entries are optional and unsupported in some browsers.
    }
  }
}

export class MotionWatchdog {
  private movingSince?: number

  constructor(private readonly timeoutMs = 45_000) {}

  update(moving: boolean, now: number): boolean {
    if (!moving) {
      this.movingSince = undefined
      return false
    }
    this.movingSince ??= now
    return now - this.movingSince >= this.timeoutMs
  }
}
