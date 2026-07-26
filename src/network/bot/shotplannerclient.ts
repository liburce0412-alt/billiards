import { BotPlanRequest, BotPlanResult } from "./shotplanner"

type PendingPlan = {
  resolve: (result: BotPlanResult) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

export class ShotPlannerClient {
  private worker?: Worker
  private readonly pending = new Map<string, PendingPlan>()

  available(): boolean {
    return typeof Worker !== "undefined"
  }

  plan(request: BotPlanRequest): Promise<BotPlanResult> {
    if (!this.available()) {
      return Promise.reject(new Error("Web Worker unavailable"))
    }
    const worker = this.getWorker()
    const timeoutMs =
      typeof navigator !== "undefined" &&
      /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent)
        ? 4000
        : 2500

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(request.id)
        reject(new Error("AI planning timed out"))
      }, timeoutMs)
      this.pending.set(request.id, { resolve, reject, timer })
      worker.postMessage(request)
    })
  }

  private getWorker(): Worker {
    if (this.worker) return this.worker
    this.worker = new Worker("worker.js")
    this.worker.addEventListener("message", (event) => {
      if (event.data?.type === "CHECKPOINT") return
      const pending = this.pending.get(event.data?.id)
      if (!pending) return
      clearTimeout(pending.timer)
      this.pending.delete(event.data.id)
      if (event.data.type === "BOT_PLAN_COMPLETE") {
        pending.resolve(event.data as BotPlanResult)
      } else {
        pending.reject(new Error(event.data?.error ?? "AI planning failed"))
      }
    })
    this.worker.addEventListener("error", () => {
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timer)
        pending.reject(new Error("AI worker crashed"))
      }
      this.pending.clear()
      this.worker?.terminate()
      this.worker = undefined
    })
    return this.worker
  }
}
