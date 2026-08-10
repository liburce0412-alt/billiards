import { Controller } from "../controller/controller"
import { EventType } from "./eventtype"
import { GameEvent } from "./gameevent"

export class RuleDecisionEvent extends GameEvent {
  constructor(
    public decision: string,
    public value = ""
  ) {
    super()
    this.type = EventType.RULE_DECISION
  }

  applyToController(controller: Controller): Controller {
    return (
      controller.container.rules.handleDecision?.(
        this.decision,
        this.value,
        controller
      ) ?? controller
    )
  }

  static fromJson(json): RuleDecisionEvent {
    return new RuleDecisionEvent(json.decision, json.value)
  }
}

