import { Controller } from "./controller"
import { exportGltf } from "../utils/gltf"
import { ChatEvent } from "../events/chatevent"
import { NotificationEvent } from "../events/notificationevent"
import { ScoreEvent } from "../events/scoreevent"
import { ConcedeEvent } from "../events/concedeevent"
import { Outcome } from "../model/outcome"
import { Vector3 } from "three"
import { Session } from "../network/client/session"
import { RejoinEvent } from "../events/rejoinevent"
import { NotificationData } from "../view/notification"

const flipP1type = (t: number) => (t === 1 ? 2 : 1)

export abstract class ControllerBase extends Controller {
  readonly scale = 0.001
  private preparation?: {
    elapsed: number
    immediate: boolean
    onContact?: () => void
  }

  override get isPreparingShot() {
    return this.preparation !== undefined
  }

  override updatePresentation(elapsed: number) {
    const preparation = this.preparation
    if (!preparation) return
    const cue = this.container.table.cue
    if (!this.container.view.robotPlayers?.readyToStrike) {
      // Pause the same stroke instead of snapping back and drawing again.
      return
    }
    if (!preparation.immediate) {
      preparation.elapsed += Math.min(Math.max(elapsed, 0), 0.1)
      // Automatic players need a visible preparation before contact.
      cue.preStrokeProgress = Math.max(0, (preparation.elapsed - 0.45) / 0.65)
      if (cue.preStrokeProgress < 1) return
    }
    this.preparation = undefined
    cue.preStrokeProgress = undefined
    preparation.onContact?.()
    this.strike()
  }

  override dispose() {
    if (this.preparation) this.container.table.cue.preStrokeProgress = undefined
    this.preparation = undefined
  }

  constructor(container) {
    super(container)
    container.table.proximityIndicator.hide()
  }

  override handleChat(chatevent: ChatEvent): Controller {
    if (chatevent.message) {
      this.container.chat.showMessage({
        id: chatevent.clientMessageId,
        senderId: chatevent.sender,
        senderName: chatevent.senderName ?? chatevent.playername ?? "对手",
        body: chatevent.message,
        createdAt: chatevent.createdAt ?? Date.now(),
        isMine: chatevent.sender === Session.getInstance().clientId,
      })
    }
    if (chatevent.line) {
      this.container.view.addLine(chatevent.line)
    }
    return this
  }

  override handleNotification(event: NotificationEvent): Controller {
    const data: NotificationData | string =
      typeof event.data === "string"
        ? event.data.slice(0, 240)
        : {
            type: event.data.type,
            title: event.data.title.slice(0, 120),
            subtext: event.data.subtext?.slice(0, 240),
            matchScore: event.data.matchScore?.slice(0, 80),
            duration: event.data.duration,
            highBreaks: undefined,
          }
    if (
      typeof data !== "string" &&
      data.type === "GameOver" &&
      !data.highBreaks
    ) {
      data.highBreaks = this.container.ballTray
        .getTopBreaks(3)
        .map(({ score, hiScoreUri }) => ({ score, url: hiScoreUri }))
    }
    this.container.notification.show(data, event.duration)
    return this
  }

  override handleScore(event: ScoreEvent): Controller {
    const session = Session.getInstance()
    if (
      event.p1type !== undefined &&
      event.p1type !== 0 &&
      session.p1type === 0
    ) {
      session.p1type =
        session.playerIndex === 0 ? event.p1type : flipP1type(event.p1type)
    }
    this.container.updateScoreHud(event.p1, event.p2, event.b, event.active)

    const rulename = this.container.rules.rulename
    if (
      !this.container.replayMode &&
      (rulename === "threecushion" || rulename === "sagu") &&
      this.container.rules.isEndOfGame([]) &&
      this.name !== "End"
    ) {
      const myTarget = session.getRaceTargetForPlayer(session.clientId)
      const amIWinner = session.myScore() >= myTarget
      return this.container.rules.handleGameEnd(amIWinner)
    }

    return this
  }

  override handleConcede(_: ConcedeEvent): Controller {
    return this.container.rules.handleGameEnd(true, "opponent conceded")
  }

  override handleRejoin(event: RejoinEvent): Controller {
    return event.snapshot
      ? this.container.applyRejoinSnapshot(event.snapshot)
      : this
  }

  hit(onContact?: () => void, immediate = false) {
    const players = this.container.view.robotPlayers
    if (players && !(immediate && players.readyToStrike)) {
      // Human release is already the shot command: wait only for arrival if
      // needed, without resetting readiness or adding another aim/backswing.
      if (!immediate) players.prepareShot()
      this.preparation = { elapsed: 0, immediate, onContact }
      this.container.table.cue.aimMode()
      return
    }
    onContact?.()
    this.strike()
  }

  private strike() {
    this.container.sound.lastOutcomeTime = -1
    this.container.table.outcome = [
      Outcome.hit(
        this.container.table.cueball,
        this.container.table.cue.aim.power,
        0
      ),
    ]
    this.container.table.hit()
    this.container.shotDiagnostics.start(this.container.table)
    this.container.view.camera.beginShot()
    this.container.view.robotPlayers?.beginShot()
    this.container.table.cue.showHelper(false)
  }

  commonKeyHandler(input) {
    const cue = this.container.table.cue
    const delta = input.t * this.scale
    switch (input.key) {
      case "ArrowLeft":
        cue.rotateAim(-delta, this.container.table)
        return true
      case "ArrowRight":
        cue.rotateAim(delta, this.container.table)
        return true
      case "ArrowDown":
        cue.adjustSpin(new Vector3(0, -delta), this.container.table)
        return true
      case "ArrowUp":
        cue.adjustSpin(new Vector3(0, delta), this.container.table)
        return true
      case "ShiftArrowLeft":
        cue.adjustSpin(new Vector3(delta, 0), this.container.table)
        return true
      case "ShiftArrowRight":
        cue.adjustSpin(new Vector3(-delta, 0), this.container.table)
        return true
      case "KeyPUp":
        exportGltf(this.container.view.scene)
        return true
      case "KeyAUp":
        cue.toggleHelper()
        return true
      case "KeyMUp":
        this.container.table.cue.aimInputs?.toggleTiltControl()
        return true
      case "KeyHUp":
        this.container.menu.toggleHelpOverlay()
        return true
      case "movementXUp":
        cue.rotateAim(delta * 2, this.container.table)
        return true
      case "movementYUp":
      case "NumpadSubtract":
        this.container.view.camera.adjustHeight(delta * 8)
        return true
      case "NumpadAdd":
        this.container.view.camera.adjustHeight(-delta * 8)
        return true
      case "KeyOUp":
        this.container.view.camera.toggleMode()
        return true
      case "KeyZ":
      case "KeyZUp": {
        const camera = this.container.view.camera
        if (camera.mode === camera.aimView) {
          camera.stepBackToFitAllBalls(
            this.container.table.balls,
            this.container.table.cue.aim
          )
        }
        return true
      }
      case "KeyDUp":
        //this.togglePanel()
        return true
      case "KeyFUp":
        this.toggleFullscreen()
        return true
      case "KeyCUp":
        this.container.comment.openChat()
        return true
      case "Digit1":
        this.container.view.camera.adjustFov(-delta * 20)
        return true
      case "Digit2":
        this.container.view.camera.adjustFov(delta * 20)
        return true
      case "Digit3":
        this.container.view.camera.adjustDistance(-delta * 8)
        return true
      case "Digit4":
        this.container.view.camera.adjustDistance(delta * 8)
        return true
      default:
        return false
    }
  }

  private toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen()
    } else if (document.exitFullscreen) {
      document.exitFullscreen()
    }
  }
}
