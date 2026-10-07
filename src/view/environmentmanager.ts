import {
  AdditiveBlending,
  BackSide,
  BoxGeometry,
  BufferGeometry,
  Color,
  DirectionalLight,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  Line,
  LineBasicMaterial,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PMREMGenerator,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  WebGLRenderer,
  WebGLRenderTarget,
} from "three"
import { R } from "../model/physics/constants"
import { TableGeometry } from "./tablegeometry"
import { EnvironmentStyle } from "./environmentstyle"
import { RenderQualityProfile } from "./renderquality"
import { SpectraEnvironment } from "./spectraenvironment"
import { createArchitecture } from "./environmentarchitecture"
import {
  disposeRefinedArt,
  loadRefinedArt,
  refinedArt,
  refinedArtSourceRadius,
} from "./refinedart"
import {
  backdropTheme,
  createCelestialBody,
  domeFragmentShader,
} from "./environmentbackdrop"

export interface EnvironmentFrame {
  elapsed: number
  width: number
  height: number
  cueX: number
  cueY: number
}

export interface EnvironmentInstance {
  readonly root: Group
  update(frame: EnvironmentFrame): void
  dispose(): void
}

export interface EnvironmentDiagnostics {
  styleId: string | null
  quality: RenderQualityProfile["name"]
  rootChildren: number
  drawBudget: number
  triangleBudget: number
  pmremSize: number
  animated: boolean
}

const geometryCache = new Map<string, BufferGeometry>()

function sharedGeometry<T extends BufferGeometry>(
  key: string,
  create: () => T
): T {
  let geometry = geometryCache.get(key)
  if (!geometry) {
    geometry = create()
    geometryCache.set(key, geometry)
  }
  return geometry as T
}

const domeVertexShader = /* glsl */ `
  varying vec3 vDirection;

  void main() {
    vDirection = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

class ProceduralEnvironment implements EnvironmentInstance {
  readonly root = new Group()
  private readonly domeMaterial: ShaderMaterial
  private readonly celestial?: Mesh
  private readonly meteor?: Line
  private readonly meteorMaterial?: LineBasicMaterial
  private readonly architecture: ReturnType<typeof createArchitecture>
  private time = 0

  constructor(
    style: EnvironmentStyle,
    private readonly quality: RenderQualityProfile
  ) {
    this.root.name = `${style.id}-environment`
    const domeGeometry = sharedGeometry(
      `environment-dome-${quality.environmentSegments}`,
      () =>
        new SphereGeometry(
          R * 760,
          quality.environmentSegments,
          Math.max(16, quality.environmentSegments / 2)
        )
    )
    this.domeMaterial = new ShaderMaterial({
      uniforms: {
        uZenith: { value: new Color(style.zenith) },
        uHorizon: { value: new Color(style.horizon) },
        uAccent: { value: new Color(style.accent) },
        uStarTint: {
          value: new Color(
            style.starTint[0],
            style.starTint[1],
            style.starTint[2]
          ),
        },
        uTime: { value: 0 },
        uTheme: { value: backdropTheme(style.id) },
        uStars: {
          value:
            style.architecture === "observation-deck" ||
            style.architecture === "lunar-deck" ||
            style.architecture === "prism-gallery"
              ? 1
              : 0.14,
        },
        uClouds: {
          value:
            style.architecture === "sky-temple" ||
            style.architecture === "ice-court"
              ? 1
              : 0.36,
        },
      },
      vertexShader: domeVertexShader,
      fragmentShader: domeFragmentShader,
      side: BackSide,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
    })
    const dome = new Mesh(domeGeometry, this.domeMaterial)
    dome.name = `${style.id}-dome`
    dome.frustumCulled = false
    dome.renderOrder = -10_000
    this.root.add(dome)

    const architecture = createArchitecture(style, quality)
    this.architecture = architecture
    this.root.add(architecture.root)

    this.celestial = createCelestialBody(style, quality)
    if (this.celestial) this.root.add(this.celestial)

    if (style.meteor && quality.name !== "low") {
      const geometry = new BufferGeometry()
      geometry.setAttribute(
        "position",
        new Float32BufferAttribute([0, 0, 0, -R * 42, -R * 13, R * 3], 3)
      )
      this.meteorMaterial = new LineBasicMaterial({
        color: style.accent,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        depthTest: false,
        blending: AdditiveBlending,
        toneMapped: false,
      })
      this.meteor = new Line(geometry, this.meteorMaterial)
      this.meteor.name = `${style.id}-meteor`
      this.meteor.frustumCulled = false
      this.root.add(this.meteor)
    }
  }

  update(frame: EnvironmentFrame): void {
    if (!this.root.visible || !this.quality.environmentMotion) return
    this.time += Math.min(Math.max(frame.elapsed, 0), 0.1)
    this.domeMaterial.uniforms.uTime.value = this.time
    if (!this.meteor || !this.meteorMaterial) return
    const activeSeconds = 1.15
    const cycleSeconds = 13
    const progress = (this.time % cycleSeconds) / activeSeconds
    if (progress >= 1) {
      this.meteorMaterial.opacity = 0
      return
    }
    const cycle = Math.floor(this.time / cycleSeconds)
    const angle = (cycle * 2.3999632297 + 0.55) % (Math.PI * 2)
    const radius = R * 285
    this.meteor.position.set(
      Math.cos(angle) * radius + Math.cos(angle + 0.7) * R * 52 * progress,
      Math.sin(angle) * radius + Math.sin(angle + 0.7) * R * 52 * progress,
      R * (125 - 24 * progress)
    )
    this.meteor.rotation.z = angle + 0.7
    this.meteorMaterial.opacity = Math.sin(progress * Math.PI) * 0.78
  }

  dispose(): void {
    this.domeMaterial.dispose()
    this.celestial?.geometry.dispose()
    if (this.celestial?.material instanceof ShaderMaterial)
      this.celestial.material.dispose()
    this.meteor?.geometry.dispose()
    this.meteorMaterial?.dispose()
    this.architecture.dispose()
  }
}

class SpectraEnvironmentInstance implements EnvironmentInstance {
  readonly root = new Group()
  private readonly spectra: SpectraEnvironment
  private readonly architecture: ReturnType<typeof createArchitecture>

  constructor(quality: RenderQualityProfile, style: EnvironmentStyle) {
    this.root.name = "spectra-environment-instance"
    this.spectra = new SpectraEnvironment(quality)
    const architecture = createArchitecture(style, quality)
    this.architecture = architecture
    this.root.add(this.spectra.root, architecture.root)
  }

  update(frame: EnvironmentFrame): void {
    this.spectra.update(
      frame.elapsed,
      frame.width,
      frame.height,
      frame.cueX,
      frame.cueY
    )
  }

  dispose(): void {
    this.spectra.dispose()
    this.architecture.dispose()
  }
}

function reflectionScene(style: EnvironmentStyle): Scene {
  const scene = new Scene()
  // A bright sky in every reflection flattens wood, resin and metal alike.
  // A dark studio with discrete softboxes produces readable highlight shapes.
  scene.background = new Color(0x18222e)
  const panelGeometry = new BoxGeometry(R * 55, R * 1.2, R * 32)
  const cool = new MeshBasicMaterial({ color: style.accent })
  const warm = new MeshBasicMaterial({ color: style.energy })
  const paper = new MeshBasicMaterial({ color: 0xffffff })
  const panels = [
    new Mesh(panelGeometry, cool),
    new Mesh(panelGeometry, warm),
    new Mesh(panelGeometry, paper),
  ]
  panels[0].position.set(-R * 48, R * 24, R * 34)
  panels[0].rotation.z = 0.34
  panels[1].position.set(R * 52, R * 10, R * 18)
  panels[1].rotation.z = -0.42
  panels[2].position.set(0, -R * 62, R * 52)
  scene.add(...panels)
  return scene
}

export class EnvironmentManager {
  private readonly environmentLayer = new Group()
  private active?: EnvironmentInstance
  private style?: EnvironmentStyle
  private quality: RenderQualityProfile
  private environmentTarget?: WebGLRenderTarget
  private refinedEnvironment?: Object3D
  private readonly fillLight = new HemisphereLight(0xf4fbff, 0x354353, 0.65)
  private readonly keyLight = new DirectionalLight(0xfff4e5, 2.4)

  constructor(
    private readonly scene: Scene,
    private readonly renderer: WebGLRenderer | undefined,
    quality: RenderQualityProfile
  ) {
    this.quality = quality
    this.environmentLayer.name = "environment-layer"
    this.keyLight.position.set(-R * 20, -R * 12, R * 65)
    this.fillLight.position.set(0, 0, 1)
    // WebGL object sorting is disabled for stable frame cost, so the authored
    // background must stay in a persistent scene layer before the table. A
    // style switch may replace children, but can never move the environment
    // in front of the playing surface again.
    this.scene.add(this.environmentLayer, this.fillLight, this.keyLight)
    this.configureLighting()
  }

  setStyle(style: EnvironmentStyle): void {
    this.style = style
    this.disposeActive()
    this.scene.background = new Color(style.background)
    this.scene.backgroundIntensity = style.intensity
    this.scene.backgroundRotation.set(0, 0, 0)
    this.scene.environmentIntensity = 0.8
    this.active =
      style.id === "spectra"
        ? new SpectraEnvironmentInstance(this.quality, style)
        : new ProceduralEnvironment(style, this.quality)
    this.environmentLayer.add(this.active.root)
    const instance = this.active
    const id = `environment-${style.id}`
    const cached = refinedArt(id)
    if (cached) this.adoptRefinedEnvironment(instance, cached)
    else
      void loadRefinedArt(id).then((art) => {
        if (!art) return
        if (this.active !== instance) disposeRefinedArt(art)
        else this.adoptRefinedEnvironment(instance, art)
      })
    this.rebuildEnvironmentLighting()
  }

  private adoptRefinedEnvironment(
    instance: EnvironmentInstance,
    art: Object3D
  ) {
    art.scale.setScalar(R / refinedArtSourceRadius())
    art.updateMatrixWorld(true)
    instance.root.updateMatrixWorld(true)
    const originals = new Map<string, Object3D>()
    const collect = (object: Object3D, parent: string) => {
      const route = `${parent}/${object.name || object.type}`
      originals.set(route, object)
      object.children.forEach((child) => collect(child, route))
    }
    collect(instance.root, "/environment-layer")
    art.traverse((object) => {
      if (!(object instanceof Mesh) && !(object instanceof Line)) return
      const original = originals.get(object.userData.legacyNode)
      if (object instanceof Line || original instanceof Line) {
        // Meteor movement is still driven by the existing time uniforms and
        // line object, so never render its frozen authoring-frame duplicate.
        object.visible = false
        return
      }
      if (!(original instanceof Mesh)) return
      const materials = Array.isArray(original.material)
        ? original.material
        : [original.material]
      if (materials.some((material) => material instanceof ShaderMaterial)) {
        // Restore refined geometry in the original shader object's local
        // space. Its material, uniforms, draw order and animation stay alive.
        const matrix = new Matrix4()
          .copy(original.matrixWorld)
          .invert()
          .multiply(object.matrixWorld)
        original.geometry = object.geometry.clone().applyMatrix4(matrix)
        object.visible = false
      } else original.visible = false
    })
    this.refinedEnvironment = art
    instance.root.add(art)
  }

  applyQuality(quality: RenderQualityProfile): void {
    if (quality.name === this.quality.name) return
    this.quality = quality
    this.configureLighting()
    if (this.style) this.setStyle(this.style)
  }

  update(frame: EnvironmentFrame): void {
    if (typeof document !== "undefined" && document.hidden) return
    this.active?.update(frame)
  }

  contextRestored(): void {
    this.rebuildEnvironmentLighting()
  }

  diagnostics(): EnvironmentDiagnostics {
    return {
      styleId: this.style?.id ?? null,
      quality: this.quality.name,
      rootChildren: this.active?.root.children.length ?? 0,
      drawBudget: this.quality.environmentDrawBudget,
      triangleBudget: this.quality.environmentTriangleBudget,
      pmremSize: this.quality.pmremSize,
      animated: this.quality.environmentMotion,
    }
  }

  dispose(): void {
    this.disposeActive()
    this.scene.remove(this.environmentLayer, this.fillLight, this.keyLight)
  }

  private configureLighting(): void {
    const quality = this.quality
    this.keyLight.castShadow = quality.dynamicShadows
    if (!quality.dynamicShadows) return
    const shadow = this.keyLight.shadow
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

  private rebuildEnvironmentLighting(): void {
    this.environmentTarget?.dispose()
    this.environmentTarget = undefined
    this.scene.environment = null
    if (
      !this.style ||
      !this.renderer ||
      !this.quality.environmentLighting ||
      this.quality.pmremSize <= 0
    ) {
      return
    }
    const pmrem = new PMREMGenerator(this.renderer)
    const source = reflectionScene(this.style)
    this.environmentTarget = pmrem.fromScene(source, 0.018, R, R * 180, {
      size: this.quality.pmremSize,
    })
    this.scene.environment = this.environmentTarget.texture
    source.traverse((object) => {
      if (!(object instanceof Mesh)) return
      object.geometry.dispose()
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material]
      materials.forEach((material) => material.dispose())
    })
    pmrem.dispose()
  }

  private disposeActive(): void {
    if (this.refinedEnvironment) {
      this.refinedEnvironment.removeFromParent()
      disposeRefinedArt(this.refinedEnvironment)
      this.refinedEnvironment = undefined
    }
    if (this.active) {
      this.environmentLayer.remove(this.active.root)
      this.active.dispose()
      this.active = undefined
    }
    this.environmentTarget?.dispose()
    this.environmentTarget = undefined
  }
}
