import {
  DirectionalLight,
  Frustum,
  HemisphereLight,
  Matrix4,
  PMREMGenerator,
  Scene,
  WebGLRenderer,
  WebGLRenderTarget,
} from "three"
import { Camera } from "./camera"
import { Drawing } from "./drawing"
import { LineData } from "../events/chatevent"
import { AimEvent } from "../events/aimevent"
import { Table } from "../model/table"
import { Grid } from "./grid"
import { renderer } from "../utils/webgl"
import { Assets } from "./assets"
import { Snooker } from "../controller/rules/snooker"
import { getRenderQuality } from "./renderquality"
import { R } from "../model/physics/constants"
import { TableGeometry } from "./tablegeometry"

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
  private environmentTarget?: WebGLRenderTarget

  // Reuse objects to reduce garbage collection pressure in high-frequency rendering
  private readonly frustum = new Frustum()
  private readonly projScreenMatrix = new Matrix4()

  constructor(element, table, assets) {
    this.element = element
    this.table = table
    this.assets = assets
    this.renderer = renderer(element)

    if (element) {
      this.cachedWidth = element.offsetWidth
      this.cachedHeight = element.offsetHeight
      this.windowWidth = element.offsetWidth
      this.windowHeight = element.offsetHeight

      if (typeof ResizeObserver !== "undefined") {
        const observer = new ResizeObserver(() => {
          this.cachedWidth = element.offsetWidth
          this.cachedHeight = element.offsetHeight
        })
        observer.observe(element)
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
    this.initialiseScene()
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
    this.camera.update(elapsed, aim)
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
    const sizeChanged = this.updateSize()
    if (sizeChanged) {
      const width = this.windowWidth
      const height = this.windowHeight

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
  }

  warmup() {
    this.configureTextureFiltering()
    this.renderer
      ?.compileAsync(this.scene, this.camera.camera)
      .catch(() => undefined)
  }

  private configureTextureFiltering() {
    if (!this.renderer) return
    const quality = getRenderQuality()
    const hardwareLimit = this.renderer.capabilities.getMaxAnisotropy()
    let qualityLimit = 4
    if (quality.name === "high") qualityLimit = 8
    else if (quality.name === "low") qualityLimit = 1
    const anisotropy = Math.min(hardwareLimit, qualityLimit)
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
    const quality = getRenderQuality()
    this.scene.add(new HemisphereLight(0xfff4df, 0x18202c, 0.45))

    const keyLight = new DirectionalLight(0xfff1d6, 1.6)
    keyLight.position.set(-R * 20, -R * 12, R * 65)
    keyLight.castShadow = quality.dynamicShadows
    if (quality.dynamicShadows) {
      const shadow = keyLight.shadow
      shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize)
      shadow.camera.left = -TableGeometry.X
      shadow.camera.right = TableGeometry.X
      shadow.camera.top = TableGeometry.Y
      shadow.camera.bottom = -TableGeometry.Y
      shadow.camera.near = R
      shadow.camera.far = R * 140
      shadow.bias = -0.00008
      shadow.normalBias = R * 0.015
    }
    this.scene.add(keyLight)

    if (quality.environmentLighting && this.renderer) {
      const pmrem = new PMREMGenerator(this.renderer)
      import("three/addons/environments/RoomEnvironment.js").then(
        ({ RoomEnvironment }) => {
          this.environmentTarget = pmrem.fromScene(new RoomEnvironment(), 0.04)
          this.scene.environment = this.environmentTarget.texture
          pmrem.dispose()
          this.warmup()
        }
      )
    }

    if (this.assets.background) {
      this.scene.add(this.assets.background)
    }
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
}
