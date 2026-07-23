import {
  Mesh,
  TextureLoader,
  RepeatWrapping,
  Float32BufferAttribute,
  BufferGeometry,
  Group,
  Object3D,
} from "three"
import { RuleFactory } from "../controller/rules/rulefactory"
import { importGltf } from "../utils/gltf"
import { Rules } from "../controller/rules/rules"
import { Sound } from "./sound"
import { TableMesh } from "./tablemesh"
import { TableGeometry } from "./tablegeometry"
import { enhanceTableMaterials } from "./materialenhancer"
import { getRenderQuality } from "./renderquality"
import {
  applyTableStyle,
  savedTableStyleId,
  saveTableStyleId,
  tableAssetForStyle,
  tableStyleById,
} from "./tablestyle"

export class Assets {
  private static readonly tableCustomization = {
    texturePath: "assets/wave.jpg",
    textureRepeatU: 1,
    textureRepeatV: 2,
    clothColor: 0xdac39e,
    cushionColor: 0xba934e,
    clothshadeColor: 0x896e42,
  }

  ready
  rules: Rules
  background: Mesh
  table: Object3D
  tableStyleId = savedTableStyleId()

  sound: Sound
  private tableScene?: Object3D
  private readonly tableVariants = new Map<string, Object3D>()
  private tableReady = false
  private tableLoadToken = 0
  private localMesh = false

  constructor(ruletype) {
    this.rules = RuleFactory.create(ruletype, null)
    this.rules.tableGeometry()
  }

  loadFromWeb(ready) {
    this.ready = ready
    this.sound = new Sound(true)
    this.table = new Group()
    importGltf("models/background.gltf", (m) => {
      this.background = m.scene
      this.done()
    })
    this.loadTableVariant(this.tableStyleId, () => {
      this.tableReady = true
      this.done()
    })
  }

  createLocal() {
    this.sound = new Sound(false)
    this.localMesh = true
    const tableMesh = new TableMesh().generateTable(TableGeometry.hasPockets)
    TableMesh.mesh = tableMesh
    enhanceTableMaterials(tableMesh, getRenderQuality(), this.rules.rulename)
    this.table = tableMesh
    this.tableScene = tableMesh
    applyTableStyle(tableMesh, this.tableStyleId)
    this.tableReady = true
  }

  static localAssets(ruletype = "") {
    const assets = new Assets(ruletype)
    assets.createLocal()
    return assets
  }

  setTableStyle(styleId: string, ready: () => void = () => {}): string {
    this.tableStyleId = saveTableStyleId(styleId)
    if (this.localMesh) {
      if (this.tableScene) {
        applyTableStyle(this.tableScene, this.tableStyleId)
      }
      ready()
      return this.tableStyleId
    }

    this.loadTableVariant(this.tableStyleId, ready)
    return this.tableStyleId
  }

  private loadTableVariant(styleId: string, ready: () => void) {
    const normalizedStyleId = tableStyleById(styleId).id
    const asset = tableAssetForStyle(
      this.rules.rulename,
      this.rules.asset,
      normalizedStyleId
    )
    const token = ++this.tableLoadToken
    const cached = this.tableVariants.get(asset)
    if (cached) {
      this.activateTableVariant(cached, normalizedStyleId)
      ready()
      return
    }

    importGltf(asset, (m) => {
      this.rules.scaleTableModel?.(m.scene)
      if (this.isTableSize5()) {
        this.customizeTableScene(m.scene)
      }
      enhanceTableMaterials(m.scene, getRenderQuality(), this.rules.rulename)
      this.tableVariants.set(asset, m.scene)
      if (token !== this.tableLoadToken) return
      this.activateTableVariant(m.scene, normalizedStyleId)
      ready()
    })
  }

  private activateTableVariant(scene: Object3D, styleId: string) {
    if (this.tableScene !== scene) {
      if (this.tableScene) {
        this.table.remove(this.tableScene)
      }
      this.table.add(scene)
      this.tableScene = scene
      TableMesh.mesh = scene.children[0]
    }
    applyTableStyle(scene, styleId)
  }

  private isTableSize5(): boolean {
    const urlParams = new URLSearchParams(globalThis.location?.search ?? "")
    return parseFloat(urlParams.get("tableSize") || "10") === 5
  }

  private customizeTableScene(scene): void {
    const cfg = Assets.tableCustomization

    // Sync pass: fix cloth UVs, recolor cushions
    scene.traverse((child) => {
      if (!child.isMesh) return
      const materials = Array.isArray(child.material)
        ? child.material
        : [child.material]
      for (const mat of materials) {
        const name = mat.name?.toLowerCase() ?? ""
        if (name.includes("clothshade")) {
          mat.color.set(cfg.clothshadeColor)
          mat.needsUpdate = true
        } else if (name.includes("cloth")) {
          this.fixClothUVs(child)
        } else if (name.includes("cushion")) {
          mat.color.set(cfg.cushionColor)
          mat.needsUpdate = true
        }
      }
    })

    // Async pass: load and apply cloth texture
    new TextureLoader().load(
      cfg.texturePath,
      (texture) => {
        texture.wrapS = texture.wrapT = RepeatWrapping
        texture.repeat.set(cfg.textureRepeatU, cfg.textureRepeatV)
        scene.traverse((child) => {
          if (!child.isMesh) return
          const materials = Array.isArray(child.material)
            ? child.material
            : [child.material]
          for (const mat of materials) {
            if (mat.name?.toLowerCase() === "cloth") {
              mat.map = texture
              mat.color.set(cfg.clothColor)
              mat.needsUpdate = true
            }
          }
        })
      },
      undefined,
      () => console.warn("Failed to load table cloth texture")
    )
  }

  private fixClothUVs(mesh): void {
    const geometry = mesh.geometry as BufferGeometry
    if (!geometry) return
    if (geometry.attributes.uv && !this.uvsAreCollapsed(geometry)) return
    this.generatePlanarUVs(geometry)
  }

  private uvsAreCollapsed(geometry: BufferGeometry): boolean {
    const uv = geometry.attributes.uv
    if (!uv) return false
    const u0 = uv.getX(0)
    const v0 = uv.getY(0)
    for (let i = 1; i < uv.count; i++) {
      if (uv.getX(i) !== u0 || uv.getY(i) !== v0) return false
    }
    return true
  }

  private generatePlanarUVs(geometry: BufferGeometry): void {
    const pos = geometry.attributes.position
    const count = pos.count

    let minX = Infinity,
      maxX = -Infinity
    let minY = Infinity,
      maxY = -Infinity

    for (let i = 0; i < count; i++) {
      const x = pos.getX(i)
      const y = pos.getY(i)
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }

    const rangeX = maxX - minX
    const rangeV = maxY - minY
    const scale = Math.max(rangeX, rangeV)

    const uvs = new Float32Array(count * 2)
    for (let i = 0; i < count; i++) {
      uvs[i * 2] = (pos.getX(i) - minX) / scale
      uvs[i * 2 + 1] = (pos.getY(i) - minY) / scale
    }

    geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2))
  }

  private done() {
    if (this.background && this.table && this.tableReady) {
      this.ready()
    }
  }
}
