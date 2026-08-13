import {
  BoxGeometry,
  CanvasTexture,
  Group,
  LinearFilter,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  RingGeometry,
  RepeatWrapping,
  SRGBColorSpace,
  TorusGeometry,
} from "three"
import { R } from "../model/physics/constants"
import { TableGeometry } from "./tablegeometry"

export type TableProfile = "american" | "chinese"

export interface TableStyle {
  id: string
  name: string
  profile: TableProfile
  description: string
  cloth: number
  clothShade: number
  cushion: number
  frame: number
  accent: number
  pocket: number
  frameMetalness: number
  swatches: string[]
}

export const TABLE_STYLE_STORAGE_KEY = "break-builder.table-style"

export const TABLE_STYLES: readonly TableStyle[] = [
  {
    id: "american-ivory",
    name: "美式·光谱象牙",
    profile: "american",
    description: "象牙白悬浮台框、冰川青台呢与冷银刻度",
    cloth: 0x31a9c0,
    clothShade: 0x187d96,
    cushion: 0x16758c,
    frame: 0xdbe2e8,
    accent: 0x9eb8c5,
    pocket: 0x101820,
    frameMetalness: 0.18,
    swatches: ["#dbe2e8", "#31a9c0", "#16758c", "#9eb8c5"],
  },
  {
    id: "american-walnut",
    name: "美式·胡桃蓝",
    profile: "american",
    description: "经典直袋口、比赛蓝台呢与深胡桃木围框",
    cloth: 0x176e85,
    clothShade: 0x0e4555,
    cushion: 0x12586b,
    frame: 0x3b2015,
    accent: 0xc5a66b,
    pocket: 0x090b0d,
    frameMetalness: 0.03,
    swatches: ["#176e85", "#12586b", "#3b2015", "#c5a66b"],
  },
  {
    id: "american-graphite",
    name: "美式·石墨竞技",
    profile: "american",
    description: "冷蓝台呢、石墨台框与拉丝银色刻度",
    cloth: 0x19788c,
    clothShade: 0x104956,
    cushion: 0x115b69,
    frame: 0x1c2228,
    accent: 0xaeb8c2,
    pocket: 0x050607,
    frameMetalness: 0.28,
    swatches: ["#19788c", "#115b69", "#1c2228", "#aeb8c2"],
  },
  {
    id: "american-burgundy",
    name: "美式·勃艮第",
    profile: "american",
    description: "酒红台呢、黑檀台框与暖铜装饰",
    cloth: 0x722b37,
    clothShade: 0x451923,
    cushion: 0x57202a,
    frame: 0x181112,
    accent: 0xb87a4f,
    pocket: 0x080708,
    frameMetalness: 0.08,
    swatches: ["#722b37", "#57202a", "#181112", "#b87a4f"],
  },
  {
    id: "chinese-ebony",
    name: "中式·黑金大师",
    profile: "chinese",
    description: "圆角窄袋口、钢库轮廓与黑金比赛台框",
    cloth: 0x176b7a,
    clothShade: 0x0d414b,
    cushion: 0x124f59,
    frame: 0x111315,
    accent: 0xc69a4b,
    pocket: 0x030405,
    frameMetalness: 0.46,
    swatches: ["#176b7a", "#124f59", "#111315", "#c69a4b"],
  },
  {
    id: "chinese-ivory",
    name: "中式·冰瓷光谱",
    profile: "chinese",
    description: "窄袋口中式台型、冰瓷白台框与流光银钢库",
    cloth: 0x5fc3d3,
    clothShade: 0x399dae,
    cushion: 0x288fa2,
    frame: 0xeff4f6,
    accent: 0x9ab6c4,
    pocket: 0x0d151c,
    frameMetalness: 0.32,
    swatches: ["#eff4f6", "#5fc3d3", "#288fa2", "#9ab6c4"],
  },
  {
    id: "chinese-jade",
    name: "中式·翡翠铜",
    profile: "chinese",
    description: "墨绿精纺台呢、深木台框与古铜钢库饰边",
    cloth: 0x176044,
    clothShade: 0x0c3b2a,
    cushion: 0x114c36,
    frame: 0x2e1b15,
    accent: 0xb78049,
    pocket: 0x050706,
    frameMetalness: 0.22,
    swatches: ["#176044", "#114c36", "#2e1b15", "#b78049"],
  },
  {
    id: "chinese-violet",
    name: "中式·星云紫",
    profile: "chinese",
    description: "深紫台呢、枪灰钢库与冰银装饰",
    cloth: 0x593d72,
    clothShade: 0x352443,
    cushion: 0x45305a,
    frame: 0x171820,
    accent: 0xa7b8c7,
    pocket: 0x040406,
    frameMetalness: 0.38,
    swatches: ["#593d72", "#45305a", "#171820", "#a7b8c7"],
  },
]

export function tableStyleById(id?: string | null): TableStyle {
  return TABLE_STYLES.find((style) => style.id === id) ?? TABLE_STYLES[0]
}

export function savedTableStyleId(): string {
  if (typeof globalThis.localStorage === "undefined") {
    return TABLE_STYLES[0].id
  }
  try {
    return tableStyleById(
      globalThis.localStorage.getItem(TABLE_STYLE_STORAGE_KEY)
    ).id
  } catch {
    return TABLE_STYLES[0].id
  }
}

export function saveTableStyleId(id: string): string {
  const styleId = tableStyleById(id).id
  if (typeof globalThis.localStorage !== "undefined") {
    try {
      globalThis.localStorage.setItem(TABLE_STYLE_STORAGE_KEY, styleId)
    } catch {
      // Storage can be disabled; the live table selection still works.
    }
  }
  return styleId
}

export function tableAssetForStyle(
  ruleName: string,
  defaultAsset: string,
  styleId: string
): string {
  const poolRule = ["eightball", "nineball", "fourball"].includes(ruleName)
  const style = tableStyleById(styleId)
  return poolRule && style.profile === "chinese"
    ? "models/chinese-pool.min.gltf"
    : defaultAsset
}

export function applyTableStyle(root: Object3D, styleId: string): TableStyle {
  const style = tableStyleById(styleId)
  // Remove generated trim before traversing the imported table. Otherwise the
  // generic material pass sees "pocket" in our detail material names and turns
  // the silver/cyan collars into the same black material as the pocket void.
  root.getObjectByName("spectra-ivory-table-details")?.removeFromParent()
  if (style.profile !== "chinese") {
    root.getObjectByName("chinese-steel-cushion-details")?.removeFromParent()
  }
  root.traverse((object: any) => {
    if (!object.isMesh) return
    const objectName = object.name?.toLowerCase() ?? ""
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material]
    for (const material of materials) {
      if (!(material instanceof MeshStandardMaterial)) continue
      const name = `${objectName} ${material.name?.toLowerCase() ?? ""}`
      styleTableMaterial(material, name, style)
    }
  })
  if (style.id === "american-ivory") {
    addSpectraTableBody(root)
    addSpectraTableDetails(root, style)
  } else {
    root.getObjectByName("spectra-ivory-table-body")?.removeFromParent()
  }
  if (style.profile === "chinese") addChineseTableDetails(root, style)
  return style
}

function styleTableMaterial(
  material: MeshStandardMaterial,
  name: string,
  style: TableStyle
) {
  if (name.includes("clothshade")) {
    configure(material, style.clothShade, 0, 0.9)
    return
  }
  if (name.includes("cloth") || name.includes("felt")) {
    styleClothMaterial(material, style)
    return
  }
  if (name.includes("cushion") || name.includes("rubber")) {
    configure(material, style.cushion, 0, 0.68)
    return
  }
  if (name.includes("pocket")) {
    if (style.id === "american-ivory") {
      configure(material, 0x263d4d, 0.54, 0.3)
    } else {
      configure(material, style.pocket, 0.05, 0.82)
    }
    return
  }
  if (name.includes("diamond")) {
    configure(material, style.accent, 0.65, 0.24)
    return
  }
  if (
    name.includes("wood") ||
    name.includes("frame") ||
    name.includes("material.001")
  ) {
    configure(
      material,
      style.frame,
      style.frameMetalness,
      style.profile === "chinese" ? 0.28 : 0.38
    )
  }
}

function styleClothMaterial(material: MeshStandardMaterial, style: TableStyle) {
  configure(material, style.cloth, 0, 0.84)
  if (style.id === "american-ivory") {
    material.map = spectraClothTexture()
    material.userData.spectraCloth = true
    material.color.setHex(0xffffff)
    material.map.needsUpdate = true
    return
  }
  if (material.userData.spectraCloth) {
    material.map = null
    delete material.userData.spectraCloth
  }
}

let clothTexture: CanvasTexture | undefined

function spectraClothTexture(): CanvasTexture {
  if (clothTexture) return clothTexture
  const canvas = document.createElement("canvas")
  canvas.width = 256
  canvas.height = 256
  const context = canvas.getContext("2d")
  if (context) {
    context.fillStyle = "#31a9c0"
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.globalAlpha = 0.16
    for (let y = 0; y < canvas.height; y += 4) {
      context.fillStyle = y % 8 === 0 ? "#d7fbff" : "#0d6478"
      context.fillRect(0, y, canvas.width, 1)
    }
    context.globalAlpha = 0.08
    for (let x = 0; x < canvas.width; x += 6) {
      context.fillStyle = x % 12 === 0 ? "#ffffff" : "#07566a"
      context.fillRect(x, 0, 1, canvas.height)
    }
  }
  clothTexture = new CanvasTexture(canvas)
  clothTexture.colorSpace = SRGBColorSpace
  clothTexture.wrapS = clothTexture.wrapT = RepeatWrapping
  clothTexture.repeat.set(8, 4)
  clothTexture.magFilter = LinearFilter
  clothTexture.minFilter = LinearFilter
  clothTexture.userData.spectraCloth = true
  return clothTexture
}

function addSpectraTableBody(root: Object3D) {
  root.getObjectByName("spectra-ivory-table-body")?.removeFromParent()
  const body = new Group()
  body.name = "spectra-ivory-table-body"

  const graphite = new MeshPhysicalMaterial({
    color: 0x506473,
    metalness: 0.7,
    roughness: 0.28,
    clearcoat: 0.5,
  })
  graphite.name = "spectra-body-graphite"
  const silver = new MeshPhysicalMaterial({
    color: 0xcbd7e0,
    metalness: 0.86,
    roughness: 0.2,
    clearcoat: 0.62,
  })
  silver.name = "spectra-body-silver"

  const width = TableGeometry.X * 2 + R * 6.2
  const height = TableGeometry.Y * 2 + R * 6.2
  const lower = new Mesh(new BoxGeometry(width, height, R * 1.65), graphite)
  lower.position.z = -R * 2.3
  lower.receiveShadow = true
  body.add(lower)
  const skirt = new Mesh(
    new BoxGeometry(width - R * 0.8, height - R * 0.8, R * 0.48),
    silver
  )
  skirt.position.z = -R * 1.34
  skirt.receiveShadow = true
  body.add(skirt)
  root.add(body)
}

function addSpectraTableDetails(root: Object3D, style: TableStyle) {
  root.getObjectByName("spectra-ivory-table-details")?.removeFromParent()
  const details = new Group()
  details.name = "spectra-ivory-table-details"

  const silver = new MeshPhysicalMaterial({
    color: 0xcbd5df,
    metalness: 0.94,
    roughness: 0.18,
    clearcoat: 0.62,
    clearcoatRoughness: 0.14,
  })
  silver.name = "spectra-brushed-silver"
  const graphite = new MeshPhysicalMaterial({
    color: 0x5d6e7d,
    metalness: 0.62,
    roughness: 0.32,
    clearcoat: 0.34,
  })
  graphite.name = "spectra-graphite-seam"
  const ice = new MeshPhysicalMaterial({
    color: style.frame,
    metalness: 0.12,
    roughness: 0.22,
    clearcoat: 0.8,
    clearcoatRoughness: 0.15,
  })
  ice.name = "spectra-ivory-inlay"
  const pocketIce = new MeshPhysicalMaterial({
    color: 0x91c5d3,
    metalness: 0.36,
    roughness: 0.24,
    clearcoat: 0.9,
    clearcoatRoughness: 0.1,
  })
  pocketIce.name = "spectra-pocket-ice"
  const pocketGraphite = new MeshPhysicalMaterial({
    color: 0x344858,
    metalness: 0.74,
    roughness: 0.3,
    clearcoat: 0.46,
  })
  pocketGraphite.name = "spectra-pocket-graphite"

  const longLength = TableGeometry.X * 2 + R * 5.8
  const shortLength = TableGeometry.Y * 2 + R * 5.8
  const railThickness = R * 0.16
  const railHeight = R * 0.12
  addDetailRail(
    details,
    longLength,
    railThickness,
    railHeight,
    0,
    -TableGeometry.Y - R * 2.08,
    silver
  )
  addDetailRail(
    details,
    longLength,
    railThickness,
    railHeight,
    0,
    TableGeometry.Y + R * 2.08,
    silver
  )
  addDetailRail(
    details,
    railThickness,
    shortLength,
    railHeight,
    -TableGeometry.X - R * 2.08,
    0,
    silver
  )
  addDetailRail(
    details,
    railThickness,
    shortLength,
    railHeight,
    TableGeometry.X + R * 2.08,
    0,
    silver
  )

  for (const [inset, material] of [
    [1.68, graphite],
    [1.82, ice],
  ] as const) {
    addDetailRail(
      details,
      longLength - R * 1.2,
      R * 0.075,
      R * 0.06,
      0,
      -TableGeometry.Y - R * inset,
      material
    )
    addDetailRail(
      details,
      longLength - R * 1.2,
      R * 0.075,
      R * 0.06,
      0,
      TableGeometry.Y + R * inset,
      material
    )
    addDetailRail(
      details,
      R * 0.075,
      shortLength - R * 1.2,
      R * 0.06,
      -TableGeometry.X - R * inset,
      0,
      material
    )
    addDetailRail(
      details,
      R * 0.075,
      shortLength - R * 1.2,
      R * 0.06,
      TableGeometry.X + R * inset,
      0,
      material
    )
  }

  for (const [x, y] of [
    [-TableGeometry.X, -TableGeometry.Y],
    [-TableGeometry.X, TableGeometry.Y],
    [TableGeometry.X, -TableGeometry.Y],
    [TableGeometry.X, TableGeometry.Y],
    [0, -TableGeometry.Y],
    [0, TableGeometry.Y],
  ]) {
    const silverPlate = new Mesh(
      new RingGeometry(R * 0.82, R * 2.15, 48),
      silver
    )
    silverPlate.position.set(x, y, R * 0.15)
    silverPlate.renderOrder = 3
    details.add(silverPlate)
    const graphitePlate = new Mesh(
      new RingGeometry(R * 0.72, R * 1.75, 48),
      pocketGraphite
    )
    graphitePlate.position.set(x, y, R * 0.18)
    graphitePlate.renderOrder = 4
    details.add(graphitePlate)
    const collar = new Mesh(
      new TorusGeometry(R * 1.52, R * 0.28, 12, 40),
      silver
    )
    collar.position.set(x, y, R * 0.2)
    collar.renderOrder = 5
    details.add(collar)
    const seam = new Mesh(
      new TorusGeometry(R * 1.12, R * 0.18, 10, 36),
      pocketIce
    )
    seam.position.set(x, y, R * 0.24)
    seam.renderOrder = 6
    details.add(seam)
  }
  root.add(details)
}

function addDetailRail(
  root: Group,
  width: number,
  height: number,
  depth: number,
  x: number,
  y: number,
  material: MeshPhysicalMaterial
) {
  const rail = new Mesh(new BoxGeometry(width, height, depth), material)
  rail.position.set(x, y, R * 0.16)
  rail.receiveShadow = true
  root.add(rail)
}

function addChineseTableDetails(root: Object3D, style: TableStyle) {
  let details = root.getObjectByName("chinese-steel-cushion-details") as
    Group | undefined
  if (!details) {
    details = new Group()
    details.name = "chinese-steel-cushion-details"
    const material = new MeshPhysicalMaterial({
      color: style.accent,
      metalness: 0.82,
      roughness: 0.22,
      clearcoat: 0.5,
    })
    material.name = "chinese-steel-trim"
    const railWidth = R * 0.16
    const railHeight = R * 0.12
    const horizontal = new BoxGeometry(
      TableGeometry.X * 2 + R * 5,
      railWidth,
      railHeight
    )
    const vertical = new BoxGeometry(
      railWidth,
      TableGeometry.Y * 2 + R * 5,
      railHeight
    )
    for (const y of [-TableGeometry.Y - R * 1.45, TableGeometry.Y + R * 1.45]) {
      const rail = new Mesh(horizontal, material)
      rail.position.set(0, y, R * 0.44)
      details.add(rail)
    }
    for (const x of [-TableGeometry.X - R * 1.45, TableGeometry.X + R * 1.45]) {
      const rail = new Mesh(vertical, material)
      rail.position.set(x, 0, R * 0.44)
      details.add(rail)
    }
    const pocketPositions = [
      [-TableGeometry.X, -TableGeometry.Y],
      [-TableGeometry.X, TableGeometry.Y],
      [TableGeometry.X, -TableGeometry.Y],
      [TableGeometry.X, TableGeometry.Y],
      [0, -TableGeometry.Y],
      [0, TableGeometry.Y],
    ]
    for (const [x, y] of pocketPositions) {
      const collar = new Mesh(
        new TorusGeometry(R * 1.28, R * 0.1, 8, 28),
        material
      )
      collar.position.set(x, y, -R * 0.08)
      details.add(collar)
    }
    root.add(details)
  }
  details.traverse((object: any) => {
    if (object.material?.name === "chinese-steel-trim") {
      object.material.color.setHex(style.accent)
      object.material.needsUpdate = true
    }
  })
}

function configure(
  material: MeshStandardMaterial,
  color: number,
  metalness: number,
  roughness: number
) {
  material.color.setHex(color)
  material.metalness = metalness
  material.roughness = roughness
  material.envMapIntensity = metalness > 0.2 ? 1.25 : 0.9
  material.needsUpdate = true
}
