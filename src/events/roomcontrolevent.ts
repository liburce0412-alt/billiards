import { Controller } from "../controller/controller"
import { EventType } from "./eventtype"
import { GameEvent } from "./gameevent"

export type RoomControlAction =
  | "CLAIM"
  | "JOIN"
  | "REJECT"
  | "HELLO"
  | "READY"
  | "START"
  | "STATE_REQUEST"
  | "REMATCH_OFFER"
  | "REMATCH_ACCEPT"
  | "REMATCH_DECLINE"
  | "MATCH_RESET"

export interface RoomSettings {
  ruleType: string
  tableSize?: string
  raceTo?: string
  physicalTable?: string
  targetScore?: string
  tournamentOptions?: Record<string, boolean>
}

export type RoomLifecycleState =
  "claiming" | "waiting" | "ready" | "playing" | "recovering" | "ended"

export interface RoomPresenceState {
  lifecycle: RoomLifecycleState
  hostClientId?: string
  guestClientId?: string
  readyClientIds: string[]
  network: "connected" | "offline" | "reconnecting"
}

export interface RoomControlPayload {
  hostClientId?: string
  matchId?: string
  rackNumber?: number
  winnerClientId?: string
  breakerClientId?: string
  targetClientId?: string
  reason?: string
  lifecycle?: RoomLifecycleState
  settings?: RoomSettings
}

export class RoomControlEvent extends GameEvent {
  constructor(
    public action: RoomControlAction,
    public roomInstanceId: string,
    public payload: RoomControlPayload = {}
  ) {
    super()
    this.type = EventType.ROOM_CONTROL
  }

  applyToController(controller: Controller): Controller {
    return controller
  }

  static fromJson(json): RoomControlEvent {
    return new RoomControlEvent(
      json.action,
      json.roomInstanceId,
      json.payload ?? {}
    )
  }
}
