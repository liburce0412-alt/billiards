import {
  BoxGeometry,
  ExtrudeGeometry,
  CanvasTexture,
  Group,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  RepeatWrapping,
  SRGBColorSpace,
  Shape,
  TorusGeometry,
} from "three"
import { R } from "../model/physics/constants"
import { TableGeometry } from "./tablegeometry"
import { surfaceTexture } from "./surfacetextures"

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
    description: "象牙白倒角台框、深青精纺台呢与冷银刻度",
    cloth: 0x16798d,
    clothShade: 0x115261,
    cushion: 0x12596a,
    frame: 0xdbe2e8,
    accent: 0x9eb8c5,
    pocket: 0x101820,
    frameMetalness: 0.18,
    swatches: ["#dbe2e8", "#16798d", "#12596a", "#9eb8c5"],
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
  removeGeneratedObject(root, "spectra-ivory-table-details")
  removeGeneratedObject(root, "break-builder-table-support")
  if (style.profile !== "chinese") {
    removeGeneratedObject(root, "chinese-steel-cushion-details")
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
    removeGeneratedObject(root, "spectra-ivory-table-body")
  }
  if (style.profile === "chinese") addChineseTableDetails(root, style)
  addTableSupport(root, style)
  return style
}

function removeGeneratedObject(root: Object3D, name: string) {
  const generated = root.getObjectByName(name)
  if (!generated) return
  generated.removeFromParent()
  const materials = new Set<{ dispose?: () => void }>()
  generated.traverse((object: any) => {
    object.geometry?.dispose?.()
    const objectMaterials = Array.isArray(object.material)
      ? object.material
      : [object.material]
    for (const material of objectMaterials) {
      if (material) materials.add(material)
    }
  })
  for (const material of materials) material.dispose?.()
}

function preserveGeneratedWorldScale(root: Object3D, generated: Object3D) {
  const inverse = (value: number) =>
    Math.abs(value) > Number.EPSILON ? 1 / value : 1
  generated.scale.set(
    inverse(root.scale.x),
    inverse(root.scale.y),
    inverse(root.scale.z)
  )
}

function bevelledBox(width: number, height: number, depth: number) {
  const bevel = Math.min(R * 0.16, width / 5, height / 5, depth / 5)
  const x = width / 2 - bevel
  const y = height / 2 - bevel
  const outline = new Shape()
  outline.moveTo(-x, -y)
  outline.lineTo(x, -y)
  outline.lineTo(x, y)
  outline.lineTo(-x, y)
  outline.closePath()
  const geometry = new ExtrudeGeometry(outline, {
    depth: depth - bevel * 2,
    steps: 1,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
  })
  geometry.translate(0, 0, -depth / 2 + bevel)
  return geometry
}

function addTableSupport(root: Object3D, style: TableStyle) {
  const support = new Group()
  support.name = "break-builder-table-support"
  const { metal, footMaterial, collarMaterial } = tableSupportMaterials(style)

  const legTop = -R * 4.15
  const legHeight = R * 16.2
  const legWidth = R * 4.8
  const legDepth = R * 4.2
  // Keep the front supports near the apron so it cannot conceal the entire
  // leg in the overview camera. Leave enough clearance for the pocket wells.
  const xOffset = TableGeometry.X - R * 8
  const yOffset = TableGeometry.Y - R * 4.8
  for (const x of [-xOffset, xOffset]) {
    for (const y of [-yOffset, yOffset]) {
      const collar = new Mesh(
        bevelledBox(legWidth * 1.34, legDepth * 1.34, R * 1.45),
        collarMaterial
      )
      collar.position.set(x, y, legTop + R * 0.25)
      collar.castShadow = true
      collar.receiveShadow = true
      support.add(collar)

      const leg = new Mesh(bevelledBox(legWidth, legDepth, legHeight), metal)
      leg.position.set(x, y, legTop - legHeight / 2)
      leg.rotation.y = x > 0 ? -0.045 : 0.045
      leg.rotation.x = y > 0 ? 0.045 : -0.045
      leg.castShadow = true
      leg.receiveShadow = true
      support.add(leg)

      const foot = new Mesh(
        bevelledBox(R * 7.2, R * 6.2, R * 0.9),
        footMaterial
      )
      foot.position.set(x, y, legTop - legHeight - R * 0.45)
      foot.castShadow = true
      foot.receiveShadow = true
      support.add(foot)
    }
  }

  const longBrace = new Mesh(
    new BoxGeometry(xOffset * 1.72, R * 1.8, R * 2.1),
    metal
  )
  longBrace.position.set(0, 0, -R * 11.6)
  longBrace.castShadow = true
  support.add(longBrace)
  for (const x of [-xOffset, xOffset]) {
    const sideBrace = new Mesh(
      new BoxGeometry(R * 1.8, yOffset * 1.48, R * 1.65),
      metal
    )
    sideBrace.position.set(x, 0, -R * 10.2)
    sideBrace.castShadow = true
    support.add(sideBrace)
  }
  preserveGeneratedWorldScale(root, support)
  root.add(support)
}

function tableSupportMaterials(style: TableStyle) {
  const ivory = style.id.includes("ivory")
  const metal = new MeshPhysicalMaterial({
    color: ivory ? 0x40556a : style.frame,
    metalness: ivory ? 0.45 : Math.max(0.25, style.frameMetalness),
    roughness: 0.36,
    clearcoat: 0.58,
    clearcoatRoughness: 0.16,
  })
  metal.name = "table-support-metal"
  const footMaterial = new MeshStandardMaterial({
    color: ivory ? 0x536674 : style.pocket,
    metalness: 0.55,
    roughness: 0.42,
  })
  footMaterial.name = "table-support-foot"

  const collarMaterial = new MeshPhysicalMaterial({
    color: ivory ? 0xe7f3f7 : style.accent,
    emissive: ivory ? 0x0a5261 : 0x1e1208,
    emissiveIntensity: 0.14,
    metalness: 0.74,
    roughness: 0.18,
    clearcoat: 0.7,
  })
  collarMaterial.name = "table-support-collar"
  return { metal, footMaterial, collarMaterial }
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
    configure(material, style.pocket, 0, 0.9)
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
    const wood = ["walnut", "burgundy", "jade"].some((id) =>
      style.id.includes(id)
    )
    material.map = wood ? surfaceTexture("wood") : null
    material.bumpMap = wood ? surfaceTexture("wood") : null
    material.bumpScale = 0.00008
  }
}

function styleClothMaterial(material: MeshStandardMaterial, style: TableStyle) {
  configure(material, style.cloth, 0, 0.84)
  if (style.id === "american-ivory" && !material.userData.snookerMarkings) {
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
    context.fillStyle = "#16798d"
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.globalAlpha = 0.045
    for (let y = 0; y < canvas.height; y += 4) {
      context.fillStyle = y % 8 === 0 ? "#d7fbff" : "#0d6478"
      context.fillRect(0, y, canvas.width, 1)
    }
    context.globalAlpha = 0.025
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
  clothTexture.minFilter = LinearMipmapLinearFilter
  clothTexture.generateMipmaps = true
  clothTexture.userData.spectraCloth = true
  return clothTexture
}

function addSpectraTableBody(root: Object3D) {
  removeGeneratedObject(root, "spectra-ivory-table-body")
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
  // Perimeter aprons leave the pocket wells open. The old solid slabs filled
  // all six holes just below the cloth and made them look like painted dots.
  for (const side of [-1, 1]) {
    for (const [w, h, x, y] of [
      [width, R * 1.6, 0, side * (height / 2 - R * 0.8)],
      [R * 1.6, height - R * 3.2, side * (width / 2 - R * 0.8), 0],
    ]) {
      const apron = new Mesh(bevelledBox(w, h, R * 3.4), graphite)
      apron.position.set(x, y, -R * 3.2)
      apron.castShadow = apron.receiveShadow = true
      body.add(apron)
      const trim = new Mesh(bevelledBox(w, h, R * 0.38), silver)
      trim.position.set(x, y, -R * 1.55)
      body.add(trim)
    }
  }
  preserveGeneratedWorldScale(root, body)
  root.add(body)
}

function addSpectraTableDetails(root: Object3D, style: TableStyle) {
  removeGeneratedObject(root, "spectra-ivory-table-details")
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

  preserveGeneratedWorldScale(root, details)
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
    for (const [x, y] of TableGeometry.hasPockets ? pocketPositions : []) {
      const collar = new Mesh(
        new TorusGeometry(R * 1.28, R * 0.1, 8, 28),
        material
      )
      collar.position.set(x, y, -R * 0.08)
      details.add(collar)
    }
    preserveGeneratedWorldScale(root, details)
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
