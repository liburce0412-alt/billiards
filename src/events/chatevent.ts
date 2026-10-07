import { GameEvent } from "./gameevent"
import { EventType } from "./eventtype"
import { Controller } from "../controller/controller"

export interface LineData {
  p1: { x: number; y: number }
  p2: { x: number; y: number }
  colour: string
}

export class ChatEvent extends GameEvent {
  sender
  senderName?: string
  message
  line?: LineData
  clientMessageId?: string
  createdAt?: number

  constructor(
    sender,
    message,
    line?: LineData,
    metadata: {
      senderName?: string
      clientMessageId?: string
      createdAt?: number
    } = {}
  ) {
    super()
    this.sender = sender
    this.message = message
    this.line = line
    this.senderName = metadata.senderName
    this.clientMessageId = metadata.clientMessageId
    this.createdAt = metadata.createdAt
    this.type = EventType.CHAT
  }

  applyToController(controller: Controller) {
    return controller.handleChat(this)
  }

  static fromJson(json) {
    return new ChatEvent(json.sender, json.message, json.line, {
      senderName: json.senderName,
      clientMessageId: json.clientMessageId,
      createdAt: json.createdAt,
    })
  }
}
