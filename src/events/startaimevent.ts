import { GameEvent } from "./gameevent"
import { EventType } from "./eventtype"
import { Controller } from "../controller/controller"

export class StartAimEvent extends GameEvent {
  readonly allowLetStroke: boolean

  constructor(allowLetStroke = true) {
    super()
    this.type = EventType.STARTAIM
    this.allowLetStroke = allowLetStroke
  }

  applyToController(controller: Controller) {
    return controller.handleStartAim(this)
  }

  static fromJson(json?: { allowLetStroke?: boolean }) {
    return new StartAimEvent(json?.allowLetStroke ?? true)
  }
}
