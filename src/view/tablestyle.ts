import { MeshStandardMaterial, Object3D } from "three"

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
    ? "models/snooker.min.gltf"
    : defaultAsset
}

export function applyTableStyle(root: Object3D, styleId: string): TableStyle {
  const style = tableStyleById(styleId)
  root.traverse((object: any) => {
    if (!object.isMesh) return
    const objectName = object.name?.toLowerCase() ?? ""
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material]
    for (const material of materials) {
      if (!(material instanceof MeshStandardMaterial)) continue
      const name = `${objectName} ${material.name?.toLowerCase() ?? ""}`
      if (name.includes("clothshade")) {
        configure(material, style.clothShade, 0, 0.94)
      } else if (name.includes("cloth") || name.includes("felt")) {
        configure(material, style.cloth, 0, 0.92)
      } else if (name.includes("cushion") || name.includes("rubber")) {
        configure(material, style.cushion, 0, 0.68)
      } else if (name.includes("pocket")) {
        configure(material, style.pocket, 0.05, 0.82)
      } else if (name.includes("diamond")) {
        configure(material, style.accent, 0.65, 0.24)
      } else if (
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
  })
  return style
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
