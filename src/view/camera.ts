import { PerspectiveCamera, MathUtils, Vector3, Frustum, Matrix4 } from "three"
import { up, zero, unitAtAngle } from "../utils/three-utils"
import { AimEvent } from "../events/aimevent"
import { CameraTop } from "./cameratop"
import { R } from "../model/physics/constants"

export type PlayerCameraFrame = {
  eye: Vector3
  position: Vector3
  walking: boolean
}

type CameraModePreference = "2d" | "3d" | "free"

export const SHOT_HOLD_SECONDS = 1
export const SHOT_RISE_SECONDS = 1.1

/** Preserve the feel of an old per-frame lerp while making it refresh-rate independent. */
export function frameRateIndependentLerp(
  fractionAt60Fps: number,
  elapsed: number
) {
  if (fractionAt60Fps >= 1) return 1
  if (fractionAt60Fps <= 0) return 0
  return 1 - Math.pow(1 - fractionAt60Fps, Math.max(0, elapsed) * 60)
}

export class Camera {
  static defaultHeight = R * 21
  static defaultDistance = R * 48
  static defaultFovOffset = 0

  static configureForRule(ruleType: string) {
    // Keep enough shaft and fore-end in the default shot composition that the
    // cue reads as a physical tool rather than a detached tip behind the ball.
    Camera.defaultHeight = R * 21
    Camera.defaultDistance = R * 48
    Camera.defaultFovOffset = 0
    CameraTop.zoomFactor = 1.13

    if (ruleType === "threecushion" || ruleType === "sagu") {
      Camera.defaultHeight = R * 25
      Camera.defaultDistance = R * 32
      Camera.defaultFovOffset = 6
      CameraTop.zoomFactor = 0.92
    }
  }

  constructor(aspectRatio) {
    this.camera = new PerspectiveCamera(45, aspectRatio, R, R * 1000)
    const savedMode = Camera.savedMode()
    if (savedMode === "3d") {
      this.mode = this.aimView
      this.preferredMode = this.aimView
    } else if (savedMode === "free") {
      this.mode = this.freeView
      this.preferredMode = this.freeView
      this.orbitInitialised = true
    }
    this.updateModeButton()
  }

  camera: PerspectiveCamera
  mode = this.topView
  private preferredMode = this.topView
  private height = Camera.defaultHeight

  private readonly target = new Vector3()
  private readonly lookTarget = new Vector3()
  private readonly tempVec = new Vector3()
  private readonly tempVec2 = new Vector3()

  private distance = Camera.defaultDistance
  private fovOffset = Camera.defaultFovOffset
  savedDistance?: number
  private orbitAzimuth = Math.PI * 1.08
  private orbitElevation = MathUtils.degToRad(28)
  private orbitDistance = R * 175
  private orbitInitialised = false
  private readonly orbitTarget = new Vector3(0, 0, R * 22)
  private cueBallPosition?: Vector3
  private playerFrame?: PlayerCameraFrame
  private shotView?: {
    elapsed: number
    position: Vector3
    lookAt: Vector3
    eyeOffset?: Vector3
  }
  private returningToAim = false
  opponentView = false

  setOpponentView(value: boolean) {
    if (value === this.opponentView) return
    this.finishShotView()
    this.opponentView = value
  }

  /** Watch the strike from the player's stance before standing up. The
   * observation point stays at the shot, rather than chasing the moving ball. */
  beginShot() {
    if (this.opponentView) return
    this.suggestMode(this.aimView)
    if (this.mode !== this.aimView) return
    this.returningToAim = false
    this.shotView = {
      elapsed: 0,
      position: this.camera.position.clone(),
      lookAt: this.lookTarget.clone(),
      eyeOffset: this.playerFrame
        ? this.camera.position.clone().sub(this.playerFrame.eye)
        : undefined,
    }
  }

  private finishShotView() {
    if (this.shotView) this.returningToAim = true
    this.shotView = undefined
  }

  private updateShotView() {
    const shot = this.shotView!
    shot.elapsed += Math.max(0, this.elapsed)
    // Hold for one second, then stand up over 1.1 seconds with zero speed
    // at either end. Neither phase depends on frame rate or ball position.
    const progress = MathUtils.clamp(
      (shot.elapsed - SHOT_HOLD_SECONDS) / SHOT_RISE_SECONDS,
      0,
      1
    )
    if (progress === 0) return
    const eased = progress * progress * (3 - 2 * progress)
    if (this.playerFrame && shot.eyeOffset) {
      this.camera.position
        .copy(this.playerFrame.eye)
        .addScaledVector(shot.eyeOffset, 1 - eased)
    } else {
      this.camera.position.copy(shot.position)
      this.camera.position.z += R * 15 * eased
    }
    this.camera.lookAt(shot.lookAt)
  }

  /** Free inspection is temporary on touch: each new turn returns behind the
   * current cue ball. An explicitly selected 2D overview remains 2D. */
  beginAimTurn(
    touch = globalThis.matchMedia?.("(pointer: coarse)").matches === true
  ) {
    this.finishShotView()
    if (touch && this.preferredMode !== this.topView) {
      this.restoreSavedDistance()
      this.height = Camera.defaultHeight
      this.distance = Camera.defaultDistance
      this.fovOffset = Camera.defaultFovOffset
      this.orbitInitialised = false
      this.selectMode(this.aimView)
    } else {
      this.suggestMode(this.aimView)
    }
  }

  elapsed: number = 1 / 60
  private t = 0

  private static savedMode(): CameraModePreference {
    if (typeof globalThis.location !== "undefined") {
      const queryMode = new URLSearchParams(globalThis.location.search).get(
        "camera"
      )
      if (queryMode === "2d" || queryMode === "top") return "2d"
      if (queryMode === "3d" || queryMode === "aim") return "3d"
      if (queryMode === "free") return "free"
    }
    try {
      const saved = globalThis.localStorage?.getItem("billiards-camera-mode")
      return saved === "3d" || saved === "free" ? saved : "2d"
    } catch {
      return "2d"
    }
  }

  private rememberMode(mode: CameraModePreference) {
    try {
      globalThis.localStorage?.setItem("billiards-camera-mode", mode)
    } catch {
      // Storage can be unavailable in private browsing or embedded views.
    }
  }

  private selectMode(mode) {
    this.finishShotView()
    if (mode !== this.aimView) {
      this.restoreSavedDistance()
    }
    this.mode = mode
    this.preferredMode = mode
    let storedMode: CameraModePreference = "3d"
    if (mode === this.topView) storedMode = "2d"
    else if (mode === this.freeView) storedMode = "free"
    this.rememberMode(storedMode)
    this.updateModeButton()
  }

  private updateModeButton() {
    if (typeof document === "undefined") return
    const button = document.getElementById("camera")
    const top = this.preferredMode === this.topView
    button?.setAttribute("data-camera-mode", top ? "2d" : "3d")
    button?.setAttribute(
      "aria-label",
      top ? "切换到 3D 视角" : "切换到 2D 俯视"
    )
  }

  adjustTouchPitch(deltaY: number) {
    if (!Number.isFinite(deltaY) || deltaY === 0) return
    if (this.shotView) this.beginFreeOrbit()
    if (this.preferredMode === this.freeView) {
      this.orbitByPixels(0, deltaY)
      return
    }
    if (this.preferredMode === this.topView) this.height = R * 100
    this.height = MathUtils.clamp(
      this.height - deltaY * R * 0.65,
      R * 6,
      R * 105
    )
    this.selectMode(this.aimView)
  }

  update(
    elapsed,
    aim: AimEvent,
    cueBallPosition?: Vector3,
    playerFrame?: PlayerCameraFrame
  ) {
    this.playerFrame = playerFrame
    this.cueBallPosition = cueBallPosition
    this.elapsed = elapsed
    this.t += elapsed
    if (this.opponentView && this.mode !== this.freeView)
      this.topView(aim, 0.08)
    else if (this.shotView) this.updateShotView()
    else this.mode(aim)
  }

  orbitView(_: AimEvent) {
    this.camera.fov = 45 + this.fovOffset
    const orbitR = R * 70
    const orbitH = R * 33
    this.target.set(
      Math.sin(this.t / 5) * orbitR,
      Math.cos(this.t / 5) * orbitR,
      orbitH + Math.sin(this.t / 19) * orbitH * 0.25
    )
    this.camera.position.lerp(
      this.target,
      frameRateIndependentLerp(0.004, this.elapsed)
    )
    this.camera.up = up
    this.camera.lookAt(zero)
  }

  spectatorView(aim: AimEvent) {
    const h = 25 * R
    const portrait = this.camera.aspect < 0.8
    this.camera.fov = (portrait ? 60 : 40) + this.fovOffset
    if (h < 10 * R) {
      const factor = 100 * (10 * R - h)
      this.camera.fov -= factor * (portrait ? 3 : 1)
    }
    this.target
      .copy(aim.pos)
      .addScaledVector(
        unitAtAngle(aim.angle, this.tempVec),
        -(this.distance + R * 12)
      )
    this.camera.position.lerp(
      this.target,
      frameRateIndependentLerp(0.1, this.elapsed)
    )
    this.camera.position.z = h
    this.camera.up = up
    this.lookTarget.lerp(
      this.tempVec2
        .copy(aim.pos)
        .addScaledVector(unitAtAngle(aim.angle, this.tempVec), R * 10),
      frameRateIndependentLerp(0.03, this.elapsed)
    )
    this.camera.lookAt(this.lookTarget)
  }

  topView(_: AimEvent, fraction = 0.9) {
    this.camera.fov = CameraTop.fov
    const targetPosition = CameraTop.viewPoint(
      this.camera.aspect,
      this.camera.fov,
      this.tempVec
    )
    if (this.camera.aspect > 1.18) {
      // The SPECTRA table is meant to read as a premium physical object, not a
      // flat plan view. Pull the eye towards the player and lower it just
      // enough to reveal the front silver/graphite skirt while preserving the
      // full-table aiming overview.
      targetPosition.y -= R * 11
      targetPosition.z *= 0.98
    }
    this.camera.position.lerp(
      targetPosition,
      frameRateIndependentLerp(fraction, this.elapsed)
    )
    this.camera.up = up
    this.camera.lookAt(this.lookTarget.set(0, R * 2.5, -R * 0.2))
  }

  private setPlayerViewPosition(
    cuePosition: Vector3,
    forward: Vector3,
    h: number
  ) {
    if (this.playerFrame) {
      if (this.playerFrame.walking) {
        const outward = this.tempVec2
          .copy(this.playerFrame.position)
          .setZ(0)
          .normalize()
        this.target
          .copy(this.playerFrame.position)
          .addScaledVector(outward, R * 60)
        this.target.z += R * 75
      } else {
        this.target
          .copy(this.playerFrame.eye)
          .addScaledVector(forward, -(this.distance - Camera.defaultDistance))
        this.target.z += h - Camera.defaultHeight
      }
    } else {
      this.target.copy(cuePosition).addScaledVector(forward, -this.distance)
      this.target.z = h
    }
  }

  aimView(aim: AimEvent, fraction = 0.08) {
    const cuePosition = this.cueBallPosition ?? aim.pos
    const h = this.height
    const portrait = this.camera.aspect < 0.8
    this.camera.fov = (portrait ? 60 : 44) + this.fovOffset
    if (h < 10 * R) {
      const factor = 100 * (10 * R - h)
      this.camera.fov -= factor * (portrait ? 3 : 1)
    }
    const forward = unitAtAngle(aim.angle, this.tempVec)
    this.setPlayerViewPosition(cuePosition, forward, h)
    this.camera.position.lerp(
      this.target,
      frameRateIndependentLerp(fraction, this.elapsed)
    )
    if (!this.returningToAim && !this.playerFrame) this.camera.position.z = h
    this.camera.up = up
    // Aim past the cue ball and into the playable table. Looking directly at
    // the cue ball left the wide desktop camera staring into the near apron,
    // so rails, balls and the shot line disappeared behind the environment.
    const lookAhead = Math.min(this.distance * 0.42, R * 22)
    if (this.playerFrame?.walking) {
      this.tempVec2
        .copy(this.playerFrame.position)
        .multiplyScalar(0.6)
        .addScaledVector(cuePosition, 0.4)
        .setZ(R * 8)
    } else {
      this.tempVec2
        .copy(cuePosition)
        .addScaledVector(forward, lookAhead)
        .addScaledVector(up, R * 2.25)
    }
    if (this.returningToAim) {
      this.lookTarget.lerp(
        this.tempVec2,
        frameRateIndependentLerp(fraction, this.elapsed)
      )
      if (
        this.camera.position.distanceTo(this.target) < 0.001 &&
        this.lookTarget.distanceTo(this.tempVec2) < 0.001
      )
        this.returningToAim = false
    } else this.lookTarget.copy(this.tempVec2)
    this.camera.lookAt(this.lookTarget)
  }

  freeView(_: AimEvent) {
    const horizontalDistance =
      Math.cos(this.orbitElevation) * this.orbitDistance
    this.camera.fov = 60 + this.fovOffset
    this.camera.position
      .set(
        Math.sin(this.orbitAzimuth) * horizontalDistance,
        Math.cos(this.orbitAzimuth) * horizontalDistance,
        Math.sin(this.orbitElevation) * this.orbitDistance
      )
      .add(this.orbitTarget)
    this.camera.up.copy(up)
    // Overview includes the themed architecture above the table. Aiming and
    // top cameras retain their close, gameplay-focused framing.
    this.camera.lookAt(this.lookTarget.copy(this.orbitTarget))
  }

  private beginFreeOrbit() {
    if (!this.orbitInitialised) {
      this.orbitTarget.copy(
        this.shotView
          ? this.lookTarget
          : (this.cueBallPosition ?? this.lookTarget)
      )
      const offset = this.tempVec
        .copy(this.camera.position)
        .sub(this.orbitTarget)
      const currentDistance = offset.length()
      if (currentDistance >= R * 4) {
        this.orbitDistance = MathUtils.clamp(currentDistance, R * 14, R * 180)
        this.orbitAzimuth = Math.atan2(offset.x, offset.y)
        this.orbitElevation = MathUtils.clamp(
          Math.asin(offset.z / currentDistance),
          MathUtils.degToRad(8),
          MathUtils.degToRad(88)
        )
      }
      this.orbitInitialised = true
    }
    this.selectMode(this.freeView)
  }

  orbitByPixels(deltaX: number, deltaY: number) {
    this.beginFreeOrbit()
    this.orbitAzimuth -= deltaX * 0.006
    this.orbitElevation = MathUtils.clamp(
      this.orbitElevation - deltaY * 0.005,
      MathUtils.degToRad(8),
      MathUtils.degToRad(88)
    )
  }

  zoomByWheel(deltaY: number) {
    this.beginFreeOrbit()
    this.orbitDistance = MathUtils.clamp(
      this.orbitDistance * Math.exp(deltaY * 0.0012),
      R * 14,
      R * 180
    )
  }

  adjustHeight(delta) {
    if (this.shotView) {
      this.orbitByPixels(0, -delta / R)
      return
    }
    delta = this.height < 10 * R ? delta / 8 : delta
    this.height = MathUtils.clamp(this.height + delta, R * 6, R * 120)
    if (this.height > R * 110) {
      this.selectMode(this.topView)
    }
    if (this.height < R * 105) {
      this.selectMode(this.aimView)
    }
  }

  adjustFov(delta: number) {
    if (this.shotView) this.beginFreeOrbit()
    this.fovOffset = MathUtils.clamp(this.fovOffset + delta, -30, 60)
  }

  adjustDistance(delta: number) {
    if (this.shotView) {
      this.zoomByWheel(delta * 100)
      return
    }
    delta = this.distance < 10 * R ? delta / 8 : delta
    this.distance = MathUtils.clamp(this.distance + delta, R * 2, R * 100)
  }

  restoreSavedDistance() {
    if (this.savedDistance !== undefined) {
      this.distance = this.savedDistance
      this.savedDistance = undefined
    }
  }

  private computeStepBackFov(h: number): number {
    const portrait = this.camera.aspect < 0.8
    const tempFov = (portrait ? 60 : 40) + this.fovOffset
    const closeViewFactor = portrait ? 3 : 1
    return h < 10 * R ? tempFov - 100 * (10 * R - h) * closeViewFactor : tempFov
  }

  private areAllBallsInFrustum(frustum: Frustum, balls: any[]): boolean {
    for (const b of balls) {
      if (!b.onTable()) continue
      const mesh = b.ballmesh?.mesh
      const inFrustum = mesh
        ? frustum.intersectsObject(mesh)
        : frustum.containsPoint(b.pos)
      if (!inFrustum) {
        return false
      }
    }
    return true
  }

  private tryDistanceFit(
    testDistance: number,
    h: number,
    aim: AimEvent,
    frustum: Frustum,
    projScreenMatrix: Matrix4,
    balls: any[]
  ): boolean {
    const targetPos = this.tempVec2
      .copy(aim.pos)
      .addScaledVector(unitAtAngle(aim.angle, this.tempVec), -testDistance)

    this.camera.position.copy(targetPos)
    this.camera.position.z = h
    this.camera.up.copy(up)

    const tempLookTarget = this.tempVec.copy(aim.pos).addScaledVector(up, h / 2)

    this.camera.lookAt(tempLookTarget)
    this.camera.updateMatrixWorld(true)
    this.camera.matrixWorldInverse.copy(this.camera.matrixWorld).invert()

    projScreenMatrix.multiplyMatrices(
      this.camera.projectionMatrix,
      this.camera.matrixWorldInverse
    )
    frustum.setFromProjectionMatrix(projScreenMatrix)

    return this.areAllBallsInFrustum(frustum, balls)
  }

  stepBackToFitAllBalls(balls: any[], aim: AimEvent) {
    const frustum = new Frustum()
    const projScreenMatrix = new Matrix4()

    const h = this.height
    const fov = this.computeStepBackFov(h)

    const originalPosition = this.camera.position.clone()
    const originalRotation = this.camera.rotation.clone()
    const originalMatrixWorld = this.camera.matrixWorld.clone()
    const originalMatrixWorldInverse = this.camera.matrixWorldInverse.clone()
    const originalProjectionMatrix = this.camera.projectionMatrix.clone()
    const originalFov = this.camera.fov

    this.camera.fov = fov
    this.camera.updateProjectionMatrix()

    let foundDistance = this.distance
    const maxDistance = R * 120
    const step = R

    for (let d = this.distance; d <= maxDistance; d += step) {
      if (this.tryDistanceFit(d, h, aim, frustum, projScreenMatrix, balls)) {
        foundDistance = d
        break
      }
    }

    // Restore original camera state
    this.camera.position.copy(originalPosition)
    this.camera.rotation.copy(originalRotation)
    this.camera.matrixWorld.copy(originalMatrixWorld)
    this.camera.matrixWorldInverse.copy(originalMatrixWorldInverse)
    this.camera.projectionMatrix.copy(originalProjectionMatrix)
    this.camera.fov = originalFov

    if (foundDistance !== this.distance) {
      if (this.savedDistance === undefined) {
        this.savedDistance = this.distance
      }
      this.distance = foundDistance
    }
  }

  suggestMode(_mode) {
    if (this.preferredMode !== this.aimView) {
      this.restoreSavedDistance()
    }
    this.mode = this.preferredMode
  }

  forceMode(mode) {
    this.finishShotView()
    if (mode !== this.aimView) {
      this.restoreSavedDistance()
    }
    this.mode = mode
  }

  forceMove(aim: AimEvent) {
    if (this.mode === this.aimView) {
      this.aimView(aim, 1)
    }
  }

  toggleMode() {
    this.restoreSavedDistance()
    if (this.preferredMode === this.topView) {
      this.selectMode(this.aimView)
    } else {
      this.selectMode(this.topView)
    }
  }
}
