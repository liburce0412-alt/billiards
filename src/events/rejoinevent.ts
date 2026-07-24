import { GameEvent } from "./gameevent"
import { EventType } from "./eventtype"
import { Controller } from "../controller/controller"

export interface RejoinSnapshot {
  table: any
  scores: { p1: number; p2: number; breakScore: number }
  p1ClientId: string
  p1Name?: string
  p2Name?: string
  activeClientId?: string
  phase: "aim" | "place-ball" | "end"
  p1type: number
  currentBreak: number
  previousBreak: number
  ruleState?: unknown
}

export class RejoinEvent extends GameEvent {
  clientResendFrom
  serverResendFrom
  snapshot?: RejoinSnapshot

  constructor(
    clientResendFrom = "",
    serverResendFrom = "",
    snapshot?: RejoinSnapshot
  ) {
    super()
    this.type = EventType.REJOIN
    this.clientResendFrom = clientResendFrom
    this.serverResendFrom = serverResendFrom
    this.snapshot = snapshot
  }

  applyToController(controller: Controller): Controller {
    return controller.handleRejoin(this)
  }

  static fromJson(json) {
    const event = new RejoinEvent(
      json.clientResendFrom,
      json.serverResendFrom,
      json.snapshot
    )
    return event
  }
}
