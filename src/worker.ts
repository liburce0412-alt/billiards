import {
  calcMinWarpTime,
  ShotSimulationInput,
  simulateShotSync,
} from "./model/shotsimulator"
import { planBotShotSync, BotPlanRequest } from "./network/bot/shotplanner"

const isWorkerContext =
  typeof (globalThis as any).WorkerGlobalScope !== "undefined" &&
  self instanceof (globalThis as any).WorkerGlobalScope

function checkpoint(label: string, detail?: Record<string, unknown>) {
  if (!isWorkerContext) return
  self.postMessage({
    type: "CHECKPOINT",
    label,
    t: performance.now(),
    ...detail,
  })
}

export { calcMinWarpTime }

export function simulateSync(config: ShotSimulationInput) {
  return simulateShotSync(config, checkpoint)
}

if (isWorkerContext) {
  checkpoint("worker.js loaded")
  self.onmessage = (event) => {
    try {
      const result =
        event.data?.type === "BOT_PLAN"
          ? planBotShotSync(event.data as BotPlanRequest)
          : simulateShotSync(event.data, checkpoint)
      self.postMessage(result)
    } catch (error: any) {
      console.error("[worker] ERROR", error)
      self.postMessage({
        type: "ERROR",
        id: event.data?.id,
        error: error.message,
        stack: error.stack,
      })
    }
  }
} else {
  ;(self as any).simulateSync = simulateSync
}
