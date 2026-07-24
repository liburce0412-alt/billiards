import { PerspectiveCamera, MathUtils, Vector3, Frustum, Matrix4 } from "three"
import { up, zero, unitAtAngle } from "../utils/three-utils"
import { AimEvent } from "../events/aimevent"
import { CameraTop } from "./cameratop"
import { R } from "../model/physics/constants"

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
  static defaultHeight = R * 8
  static defaultDistance = R * 18
  static defaultFovOffset = 0

  static configureForRule(ruleType: string) {
    Camera.defaultHeight = R * 8
    Camera.defaultDistance = R * 18
    Camera.defaultFovOffset = 0
    CameraTop.zoomFactor = 1

    if (ruleType === "threecushion" || ruleType === "sagu") {
      Camera.defaultHeight = R * 23
      Camera.defaultDistance = R * 22
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
    }
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
  private orbitAzimuth = Math.PI
  private orbitElevation = MathUtils.degToRad(48)
  private orbitDistance = R * 65
  private orbitInitialised = false

  elapsed: number = 1 / 60
  private t = 0

  private static savedMode(): "2d" | "3d" {
    if (typeof globalThis.location !== "undefined") {
      const queryMode = new URLSearchParams(globalThis.location.search).get(
        "camera"
      )
      if (queryMode === "2d" || queryMode === "top") return "2d"
      if (queryMode === "3d" || queryMode === "aim") return "3d"
    }
    try {
      return globalThis.localStorage?.getItem("billiards-camera-mode") === "3d"
        ? "3d"
        : "2d"
    } catch {
      return "2d"
    }
  }

  private rememberMode(mode: "2d" | "3d") {
    try {
      globalThis.localStorage?.setItem("billiards-camera-mode", mode)
    } catch {
      // Storage can be unavailable in private browsing or embedded views.
    }
  }

  private selectMode(mode) {
    if (mode !== this.aimView) {
      this.restoreSavedDistance()
    }
    this.mode = mode
    this.preferredMode = mode
    this.rememberMode(mode === this.topView ? "2d" : "3d")
  }

  update(elapsed, aim: AimEvent) {
    this.elapsed = elapsed
    this.t += elapsed
    this.mode(aim)
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

  topView(_: AimEvent) {
    this.camera.fov = CameraTop.fov
    this.camera.position.lerp(
      CameraTop.viewPoint(this.camera.aspect, this.camera.fov, this.tempVec),
      frameRateIndependentLerp(0.9, this.elapsed)
    )
    this.camera.up = up
    this.camera.lookAt(zero)
  }

  aimView(aim: AimEvent, fraction = 0.08) {
    const h = this.height
    const portrait = this.camera.aspect < 0.8
    this.camera.fov = (portrait ? 60 : 40) + this.fovOffset
    if (h < 10 * R) {
      const factor = 100 * (10 * R - h)
      this.camera.fov -= factor * (portrait ? 3 : 1)
    }
    this.target
      .copy(aim.pos)
      .addScaledVector(unitAtAngle(aim.angle, this.tempVec), -this.distance)
    this.camera.position.lerp(
      this.target,
      frameRateIndependentLerp(fraction, this.elapsed)
    )
    this.camera.position.z = h
    this.camera.up = up
    this.lookTarget.copy(aim.pos).addScaledVector(up, h / 2)
    this.camera.lookAt(this.lookTarget)
  }

  freeView(_: AimEvent) {
    const horizontalDistance =
      Math.cos(this.orbitElevation) * this.orbitDistance
    this.camera.fov = 45 + this.fovOffset
    this.camera.position.set(
      Math.sin(this.orbitAzimuth) * horizontalDistance,
      Math.cos(this.orbitAzimuth) * horizontalDistance,
      Math.sin(this.orbitElevation) * this.orbitDistance
    )
    this.camera.up.copy(up)
    this.camera.lookAt(zero)
  }

  private beginFreeOrbit() {
    if (!this.orbitInitialised) {
      const offset = this.tempVec.copy(this.camera.position)
      const currentDistance = offset.length()
      if (currentDistance >= R * 4) {
        this.orbitDistance = MathUtils.clamp(
          currentDistance,
          R * 14,
          R * 180
        )
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
    this.fovOffset = MathUtils.clamp(this.fovOffset + delta, -30, 60)
  }

  adjustDistance(delta: number) {
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
