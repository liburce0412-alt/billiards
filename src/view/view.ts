import {
  BufferGeometry,
  Color,
  DirectionalLight,
  Float32BufferAttribute,
  Frustum,
  HemisphereLight,
  Matrix4,
  PMREMGenerator,
  Points,
  PointsMaterial,
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
  private primaryCameraOrbit = false
  private orbitPointerId?: number
  private orbitPointerX = 0
  private orbitPointerY = 0
  onCameraInteraction?: () => void

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
    this.addCameraControls()
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

  setPrimaryCameraOrbit(enabled: boolean) {
    this.primaryCameraOrbit = enabled
  }

  private addCameraControls() {
    const canvas = this.renderer?.domElement
    if (!canvas) return

    canvas.addEventListener("contextmenu", (event) => event.preventDefault())
    canvas.addEventListener("pointerdown", (event) => {
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
      canvas.setPointerCapture?.(event.pointerId)
      this.element?.classList.add("is-camera-orbiting")
    })
    canvas.addEventListener("pointermove", (event) => {
      if (event.pointerId !== this.orbitPointerId) return
      event.preventDefault()
      event.stopPropagation()
      const deltaX = event.clientX - this.orbitPointerX
      const deltaY = event.clientY - this.orbitPointerY
      this.orbitPointerX = event.clientX
      this.orbitPointerY = event.clientY
      this.camera.orbitByPixels(deltaX, deltaY)
      this.onCameraInteraction?.()
    })
    const stopOrbit = (event: PointerEvent) => {
      if (event.pointerId !== this.orbitPointerId) return
      this.orbitPointerId = undefined
      canvas.releasePointerCapture?.(event.pointerId)
      this.element?.classList.remove("is-camera-orbiting")
    }
    canvas.addEventListener("pointerup", stopOrbit)
    canvas.addEventListener("pointercancel", stopOrbit)
    canvas.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault()
        event.stopPropagation()
        this.camera.zoomByWheel(event.deltaY)
        this.onCameraInteraction?.()
      },
      { passive: false }
    )
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
    this.scene.background = new Color(0x02040c)
    this.scene.add(this.createStarfield(quality.name === "low" ? 420 : 1200))
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

  private createStarfield(count: number): Points {
    const positions = new Float32Array(count * 3)
    const colors = new Float32Array(count * 3)
    let seed = 0x51f15e
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0
      return seed / 0x100000000
    }

    for (let i = 0; i < count; i++) {
      const azimuth = random() * Math.PI * 2
      const z = random() * 2 - 1
      const radius = R * (360 + random() * 430)
      const horizontal = Math.sqrt(1 - z * z)
      positions[i * 3] = Math.cos(azimuth) * horizontal * radius
      positions[i * 3 + 1] = Math.sin(azimuth) * horizontal * radius
      positions[i * 3 + 2] = z * radius

      const warmth = random()
      colors[i * 3] = 0.72 + warmth * 0.28
      colors[i * 3 + 1] = 0.78 + warmth * 0.18
      colors[i * 3 + 2] = 1
    }

    const geometry = new BufferGeometry()
    geometry.setAttribute("position", new Float32BufferAttribute(positions, 3))
    geometry.setAttribute("color", new Float32BufferAttribute(colors, 3))
    const material = new PointsMaterial({
      size: R * 0.5,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      vertexColors: true,
    })
    const stars = new Points(geometry, material)
    stars.name = "starfield"
    stars.frustumCulled = false
    return stars
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
