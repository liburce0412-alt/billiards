import { Frustum, Matrix4, Scene, WebGLRenderer } from "three"
import { Camera } from "./camera"
import { Drawing } from "./drawing"
import { LineData } from "../events/chatevent"
import { AimEvent } from "../events/aimevent"
import { Table } from "../model/table"
import { Grid } from "./grid"
import { renderer } from "../utils/webgl"
import { Assets } from "./assets"
import { Snooker } from "../controller/rules/snooker"
import {
  AdaptiveRenderQuality,
  getRenderQuality,
  pixelRatioForViewport,
  renderQualityControllerFor,
  renderQualityDiagnostics,
} from "./renderquality"
import {
  environmentStyleById,
  saveEnvironmentStyleId,
  savedEnvironmentStyleId,
} from "./environmentstyle"
import { EnvironmentManager } from "./environmentmanager"
import { RobotPlayers } from "./robotplayers"
import { disposeRefinedArt } from "./refinedart"
import { mountGlassOverlay } from "../../packages/table-tennis/src/browser/glass"
import {
  mobileCameraMetrics,
  MobileGestureCoordinator,
  MobileGestureState,
} from "../events/mobilegesturecoordinator"

export function touchCameraMetrics(points: Iterable<{ x: number; y: number }>) {
  const metrics = mobileCameraMetrics(points)
  if (!metrics) return
  return {
    centroidX: metrics.x,
    centroidY: metrics.y,
    distance: metrics.distance,
  }
}

export class View {
  readonly scene = new Scene()
  private readonly renderer: WebGLRenderer | undefined
  camera: Camera
  windowWidth = 1
  windowHeight = 1
  private cachedWidth = 1
  private cachedHeight = 1
  private lastFov = 0
  readonly element
  table: Table
  loadAssets = true
  assets: Assets
  drawing: Drawing
  private readonly environmentManager: EnvironmentManager
  readonly robotPlayers?: RobotPlayers
  private readonly renderQualityController?: AdaptiveRenderQuality
  private disposeQualityListener?: () => void
  private resizeObserver?: ResizeObserver
  private controlCanvas?: HTMLCanvasElement
  private primaryCameraOrbit = false
  private orbitPointerId?: number
  private orbitPointerX = 0
  private orbitPointerY = 0
  private mobileGestureCoordinator?: MobileGestureCoordinator
  environmentStyleId = savedEnvironmentStyleId()
  onCameraInteraction?: () => void
  onPrimaryTouchDrag?: (dx: number, dy: number) => void
  onContextLost?: () => void
  onContextRestored?: () => void
  private contextLost = false
  private glass?: ReturnType<typeof mountGlassOverlay>

  // Reuse objects to reduce garbage collection pressure in high-frequency rendering
  private readonly frustum = new Frustum()
  private readonly projScreenMatrix = new Matrix4()

  constructor(element, table, assets) {
    this.element = element
    this.table = table
    this.assets = assets
    this.renderer = renderer(element)
    if (this.renderer) {
      this.robotPlayers = new RobotPlayers()
    }
    this.renderQualityController = renderQualityControllerFor(this.renderer)
    this.environmentManager = new EnvironmentManager(
      this.scene,
      this.renderer,
      this.renderQualityController?.profile ?? getRenderQuality()
    )
    this.disposeQualityListener = this.renderQualityController?.onChange(
      (quality) => {
        this.environmentManager.applyQuality(quality)
        this.warmup()
        this.render()
      }
    )

    if (element) {
      this.cachedWidth = element.offsetWidth
      this.cachedHeight = element.offsetHeight
      this.windowWidth = element.offsetWidth
      this.windowHeight = element.offsetHeight

      if (typeof ResizeObserver !== "undefined") {
        this.resizeObserver = new ResizeObserver(() => {
          this.cachedWidth = element.offsetWidth
          this.cachedHeight = element.offsetHeight
        })
        this.resizeObserver.observe(element)
      }
    }

    this.camera = new Camera(
      element ? element.offsetWidth / element.offsetHeight : 1
    )
    this.drawing = new Drawing(
      this.scene,
      this.element as HTMLCanvasElement,
      () => this.camera.camera
    )
    this.addCameraControls()
    this.initialiseScene()
    // The sky uses depthTest=false with insertion-order rendering. Add actors
    // after the environment, otherwise its dome paints over their colours.
    if (this.robotPlayers) this.scene.add(this.robotPlayers.root)
  }

  addLine(data: LineData) {
    this.drawing.addLine(data)
  }

  clearLines() {
    this.drawing.clear()
  }

  undoLine() {
    this.drawing.undo()
  }

  set onLineDrawn(callback: (line: LineData) => void) {
    this.drawing.onLineDrawn = callback
  }

  update(elapsed, aim: AimEvent) {
    if (this.robotPlayers) {
      this.robotPlayers.root.visible = !this.table.cue.placerMesh.visible
      this.robotPlayers.update(
        elapsed,
        this.table.cue,
        this.camera.camera,
        this.table.allStationary(),
        this.camera.mode === this.camera.aimView && !this.camera.opponentView
      )
    }
    this.camera.update(
      elapsed,
      aim,
      this.table.cueball.onTable() ? this.table.cueball.pos : undefined,
      this.robotPlayers?.root.visible
        ? this.robotPlayers.cameraFrame
        : undefined
    )
    this.robotPlayers?.updateChalkView(this.camera.camera, this.table.cue)
    this.renderQualityController?.observeFrame(
      elapsed * 1000,
      this.table.allStationary()
    )
    this.environmentManager.update({
      elapsed,
      width: this.windowWidth,
      height: this.windowHeight,
      cueX: this.table.cueball.pos.x,
      cueY: this.table.cueball.pos.y,
    })
  }

  getRenderDiagnostics() {
    return {
      quality: renderQualityDiagnostics(this.renderer),
      environment: this.environmentManager.diagnostics(),
    }
  }

  setPrimaryCameraOrbit(enabled: boolean) {
    this.primaryCameraOrbit = enabled
  }

  getMobileInputState() {
    return (
      this.mobileGestureCoordinator?.getSnapshot() ?? {
        state: "idle" as const,
        pointerCount: 0,
        aimSensitivity: {
          normal: 0.003,
          precision: 0.00065,
        },
      }
    )
  }

  private addCameraControls() {
    const canvas = this.renderer?.domElement
    if (!canvas) return
    this.controlCanvas = canvas

    this.mobileGestureCoordinator = new MobileGestureCoordinator(canvas, {
      onPrimaryDrag: (dx, dy) => this.onPrimaryTouchDrag?.(dx, dy),
      onCameraDrag: ({ x, y, distance }) => {
        this.camera.orbitByPixels(x, y)
        this.camera.zoomByWheel(distance * 2.4)
        this.onCameraInteraction?.()
      },
      onStateChange: (state) => this.setMobileGestureState(state),
      onReset: () => this.setMobileGestureState("idle"),
    })

    canvas.addEventListener("contextmenu", this.preventContextMenu)
    canvas.addEventListener("webglcontextlost", this.handleContextLost)
    canvas.addEventListener("webglcontextrestored", this.handleContextRestored)
    canvas.addEventListener("pointerdown", this.handleOrbitStart)
    canvas.addEventListener("pointermove", this.handleOrbitMove)
    canvas.addEventListener("pointerup", this.handleOrbitStop)
    canvas.addEventListener("pointercancel", this.handleOrbitStop)
    canvas.addEventListener("wheel", this.handleWheel, { passive: false })
  }

  private readonly preventContextMenu = (event: Event) => event.preventDefault()

  private readonly handleContextLost = (event: Event) => {
    event.preventDefault()
    this.contextLost = true
    this.renderQualityController?.emergencyFallback()
    this.onContextLost?.()
  }

  private readonly handleContextRestored = () => {
    this.contextLost = false
    this.environmentManager.contextRestored()
    this.warmup()
    this.onContextRestored?.()
    this.render()
  }

  private readonly handleOrbitStart = (event: PointerEvent) => {
    if (event.pointerType === "touch") return
    const isOrbitButton =
      event.button === 1 ||
      event.button === 2 ||
      (event.button === 0 && this.primaryCameraOrbit)
    if (!isOrbitButton) return
    event.preventDefault()
    event.stopPropagation()
    this.orbitPointerId = event.pointerId
    this.orbitPointerX = event.clientX
    this.orbitPointerY = event.clientY
    this.controlCanvas?.setPointerCapture?.(event.pointerId)
    this.element?.classList.add("is-camera-orbiting")
  }

  private readonly handleOrbitMove = (event: PointerEvent) => {
    if (event.pointerType === "touch") return
    if (event.pointerId !== this.orbitPointerId) return
    event.preventDefault()
    event.stopPropagation()
    const deltaX = event.clientX - this.orbitPointerX
    const deltaY = event.clientY - this.orbitPointerY
    this.orbitPointerX = event.clientX
    this.orbitPointerY = event.clientY
    this.camera.orbitByPixels(deltaX, deltaY)
    this.onCameraInteraction?.()
  }

  private readonly handleOrbitStop = (event: PointerEvent) => {
    if (event.pointerType === "touch") return
    if (event.pointerId !== this.orbitPointerId) return
    this.orbitPointerId = undefined
    this.controlCanvas?.releasePointerCapture?.(event.pointerId)
    this.element?.classList.remove("is-camera-orbiting")
  }

  private readonly handleWheel = (event: WheelEvent) => {
    event.preventDefault()
    event.stopPropagation()
    this.camera.zoomByWheel(event.deltaY)
    this.onCameraInteraction?.()
  }

  private setMobileGestureState(state: MobileGestureState) {
    const camera = state === "camera" || state === "cameraDrain"
    this.element?.classList.toggle("is-camera-orbiting", camera)
    this.element?.classList.toggle("is-touch-camera", camera)
  }

  sizeChanged() {
    // Avoid reading offsetWidth/offsetHeight in high-frequency loops when ResizeObserver is supported.
    // This prevents layout thrashing.
    if (typeof ResizeObserver === "undefined") {
      return (
        this.windowWidth != this.element?.offsetWidth ||
        this.windowHeight != this.element?.offsetHeight
      )
    }
    return (
      this.windowWidth !== this.cachedWidth ||
      this.windowHeight !== this.cachedHeight
    )
  }

  updateSize() {
    const hasChanged = this.sizeChanged()
    if (hasChanged) {
      if (typeof ResizeObserver === "undefined") {
        this.windowWidth = this.element?.offsetWidth
        this.windowHeight = this.element?.offsetHeight
      } else {
        this.windowWidth = this.cachedWidth
        this.windowHeight = this.cachedHeight
      }
    }
    return hasChanged
  }

  render() {
    if (this.isInMotionNotVisible()) {
      this.camera.suggestMode(this.camera.topView)
    }
    this.renderCamera(this.camera)
  }

  renderCamera(cam) {
    if (this.contextLost) return
    const sizeChanged = this.updateSize()
    if (sizeChanged) {
      const width = this.windowWidth
      const height = this.windowHeight

      if (this.renderer) {
        const quality =
          this.renderQualityController?.profile ?? getRenderQuality()
        this.renderer.setPixelRatio(
          pixelRatioForViewport(quality, width, height)
        )
      }
      this.renderer?.setSize(width, height)
      this.renderer?.setViewport(0, 0, width, height)
      this.renderer?.setScissor(0, 0, width, height)
      this.renderer?.setScissorTest(true)

      cam.camera.aspect = width / height
    }

    if (sizeChanged || cam.camera.fov !== this.lastFov) {
      cam.camera.updateProjectionMatrix()
      this.lastFov = cam.camera.fov
    }

    this.renderer?.render(this.scene, cam.camera)
    if (this.renderer && this.element?.id === "viewP1") {
      if (!this.glass) {
        document
          .querySelectorAll<HTMLElement>(
            ".tray-score-container,#gameSettingsDrawer"
          )
          .forEach((panel) => {
            panel.dataset.glass = "optical"
          })
        document
          .querySelector<HTMLElement>("#panel")
          ?.setAttribute("data-glass", "ambient")
        this.glass = mountGlassOverlay(
          document.body,
          this.renderer.domElement,
          {
            quality: getRenderQuality().name,
            inGame: true,
            selector:
              "[data-glass],.game-settings button,.shot-dock button,.tray-score-container button,.game-overflow-menu button",
          }
        )
      }
      this.glass.render()
    }
  }

  warmup() {
    this.configureTextureFiltering()
    this.renderer
      ?.compileAsync(this.scene, this.camera.camera)
      .catch(() => undefined)
  }

  private configureTextureFiltering() {
    if (!this.renderer) return
    const quality = this.renderQualityController?.profile ?? getRenderQuality()
    const hardwareLimit = this.renderer.capabilities.getMaxAnisotropy()
    const anisotropy = Math.min(hardwareLimit, quality.maxAnisotropy)
    this.scene.traverse((object: any) => {
      if (!object.isMesh) return
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material]
      for (const material of materials) {
        for (const key of [
          "map",
          "normalMap",
          "roughnessMap",
          "metalnessMap",
        ]) {
          const texture = material[key]
          if (texture) texture.anisotropy = anisotropy
        }
      }
    })
  }

  private initialiseScene() {
    const quality = this.renderQualityController?.profile ?? getRenderQuality()
    const requestedEnvironment = new URLSearchParams(
      globalThis.location?.search ?? ""
    ).get("environment")
    const style = environmentStyleById(
      requestedEnvironment ?? this.environmentStyleId
    )
    this.environmentStyleId = style.id
    this.environmentManager.setStyle(style)
    this.scene.add(this.assets.table)
    if (this.assets.sound?.listener) {
      this.camera.camera.add(this.assets.sound.listener)
      this.scene.add(this.assets.sound.root)
    }
    this.table.mesh = this.assets.table
    const showGrid =
      quality.name === "low" ||
      new URLSearchParams(globalThis.location?.search ?? "").get("grid") ===
        "true"
    if (this.assets.rules.asset !== Snooker.tablemodel && showGrid) {
      this.scene.add(new Grid().generateLineSegments())
    }
  }

  setEnvironmentStyle(id: string, persist = true): string {
    const style = environmentStyleById(id)
    this.environmentStyleId = persist
      ? saveEnvironmentStyleId(style.id)
      : style.id
    this.environmentManager.setStyle(style)
    this.warmup()
    this.render()
    return this.environmentStyleId
  }

  ballToCheck = 0

  isInMotionNotVisible() {
    const frustum = this.viewFrustum()
    const b = this.table.balls[this.ballToCheck++ % this.table.balls.length]
    return b.inMotion() && !frustum.intersectsObject(b.ballmesh.mesh)
  }

  viewFrustum() {
    const c = this.camera.camera
    this.frustum.setFromProjectionMatrix(
      this.projScreenMatrix.multiplyMatrices(
        c.projectionMatrix,
        c.matrixWorldInverse
      )
    )
    return this.frustum
  }

  dispose(): void {
    this.glass?.dispose()
    this.glass = undefined
    document
      .querySelectorAll<HTMLElement>(
        ".tray-score-container,#gameSettingsDrawer,#panel"
      )
      .forEach((panel) => panel.removeAttribute("data-glass"))
    this.mobileGestureCoordinator?.dispose()
    this.mobileGestureCoordinator = undefined
    this.resizeObserver?.disconnect()
    this.resizeObserver = undefined
    this.disposeQualityListener?.()
    this.disposeQualityListener = undefined
    const canvas = this.controlCanvas
    if (canvas) {
      canvas.removeEventListener("contextmenu", this.preventContextMenu)
      canvas.removeEventListener("webglcontextlost", this.handleContextLost)
      canvas.removeEventListener(
        "webglcontextrestored",
        this.handleContextRestored
      )
      canvas.removeEventListener("pointerdown", this.handleOrbitStart)
      canvas.removeEventListener("pointermove", this.handleOrbitMove)
      canvas.removeEventListener("pointerup", this.handleOrbitStop)
      canvas.removeEventListener("pointercancel", this.handleOrbitStop)
      canvas.removeEventListener("wheel", this.handleWheel)
      canvas.remove()
    }
    this.controlCanvas = undefined
    this.element?.classList.remove("is-camera-orbiting", "is-touch-camera")
    this.drawing.dispose()
    this.environmentManager.dispose()
    this.robotPlayers?.dispose()
    if (this.table.cue.cueBody?.userData.refinedCueStyle)
      disposeRefinedArt(this.table.cue.cueBody)
    for (const ball of this.table.balls) {
      const mesh = ball.ballmesh?.mesh
      if (!mesh?.userData.refinedArtId) continue
      mesh.geometry.dispose()
      if (ball.label !== undefined) {
        const materials = Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material]
        materials.forEach((material) => material.dispose())
      }
    }
    this.renderer?.dispose()
    this.onCameraInteraction = undefined
    this.onPrimaryTouchDrag = undefined
    this.onContextLost = undefined
    this.onContextRestored = undefined
  }
}
