export type EnvironmentStyleId =
  | "spectra"
  | "galaxy"
  | "nebula"
  | "club"
  | "aurora-hall"
  | "sky-temple"
  | "abyss-palace"
  | "lunar-observatory"

export type EnvironmentArchitecture =
  | "spectral-ribs"
  | "observation-deck"
  | "prism-gallery"
  | "champion-gallery"
  | "ice-court"
  | "sky-temple"
  | "glass-palace"
  | "lunar-deck"

export interface EnvironmentStyle {
  id: EnvironmentStyleId
  name: string
  description: string
  background: number
  intensity: number
  starTint: [number, number, number]
  meteor: boolean
  swatches: string[]
  architecture: EnvironmentArchitecture
  zenith: number
  horizon: number
  floor: number
  structure: number
  accent: number
  energy: number
}

export const ENVIRONMENT_STYLE_STORAGE_KEY = "break-builder.environment-style"

export const ENVIRONMENT_STYLES: readonly EnvironmentStyle[] = [
  {
    id: "spectra",
    name: "SPECTRA 光谱空间",
    description: "三棱镜分光展厅、七色光路、接收光墙与 GLSL 虹彩天幕",
    background: 0xc9d7e4,
    intensity: 0.56,
    starTint: [0.52, 0.79, 1],
    meteor: false,
    swatches: ["#f8fafc", "#dff7fb", "#77d5e6", "#b38cff"],
    architecture: "spectral-ribs",
    zenith: 0xc7d7e5,
    horizon: 0xf1f7fb,
    floor: 0x789eac,
    structure: 0xe9f4f7,
    accent: 0x5bd7e7,
    energy: 0xffa85b,
  },
  {
    id: "galaxy",
    name: "深空银河",
    description: "环形观测舰桥、全景舷窗、银河尘带与远星",
    background: 0x02040c,
    intensity: 0.92,
    starTint: [0.76, 0.84, 1],
    meteor: true,
    swatches: ["#02040c", "#173067", "#8059a8", "#c6edff"],
    architecture: "observation-deck",
    zenith: 0x02040c,
    horizon: 0x19366e,
    floor: 0x071421,
    structure: 0xb9cad7,
    accent: 0x63d8f1,
    energy: 0xf0a76d,
  },
  {
    id: "nebula",
    name: "明亮星云",
    description: "开放科研栈桥、双侧观测仪与蓝紫发射星云",
    background: 0x0a1022,
    intensity: 1.26,
    starTint: [1, 0.82, 0.9],
    meteor: true,
    swatches: ["#0a1022", "#284b8f", "#b261a7", "#ffd59a"],
    architecture: "prism-gallery",
    zenith: 0x100d24,
    horizon: 0x623d72,
    floor: 0x172338,
    structure: 0xe4d7e7,
    accent: 0x56dbe8,
    energy: 0xffae72,
  },
  {
    id: "club",
    name: "冠军艺廊",
    description: "冠军奖杯展柜、木饰面休息区、金属徽章与暖光球厅",
    background: 0x8aa4aa,
    intensity: 0.82,
    starTint: [0.7, 0.88, 0.78],
    meteor: false,
    swatches: ["#e6ddca", "#8aa4aa", "#2d3b40", "#c1974f"],
    architecture: "champion-gallery",
    zenith: 0xbfd0d2,
    horizon: 0xe7e4db,
    floor: 0x29383e,
    structure: 0xeee8dc,
    accent: 0xffd8a3,
    energy: 0xdba85c,
  },
  {
    id: "aurora-hall",
    name: "极光冰庭",
    description: "冰雕拱廊、积雪山脊、冻结庭院与青紫极光幕",
    background: 0xbdd8e4,
    intensity: 0.9,
    starTint: [0.68, 0.93, 1],
    meteor: false,
    swatches: ["#effbff", "#9fe8ee", "#78a8ec", "#a58be9"],
    architecture: "ice-court",
    zenith: 0x081b38,
    horizon: 0x29475f,
    floor: 0x7aadb7,
    structure: 0xe8f8f8,
    accent: 0x58e4e8,
    energy: 0xc997ff,
  },
  {
    id: "sky-temple",
    name: "浮光神殿",
    description: "悬浮基岩、三层石阶、古典柱廊与云海中的金色山墙",
    background: 0xc8dce8,
    intensity: 1.04,
    starTint: [0.96, 0.98, 1],
    meteor: false,
    swatches: ["#fffaf0", "#d8edf5", "#88dce4", "#edb46f"],
    architecture: "sky-temple",
    zenith: 0x90b7d2,
    horizon: 0xfff4da,
    floor: 0x9eb4bb,
    structure: 0xf4efe3,
    accent: 0x65d6df,
    energy: 0xf1ad61,
  },
  {
    id: "abyss-palace",
    name: "深海玻璃宫",
    description: "玻璃穹廊中的干燥赛台，宫外珊瑚海床、鱼群与海水光束",
    background: 0x073343,
    intensity: 0.78,
    starTint: [0.36, 0.86, 0.9],
    meteor: false,
    swatches: ["#082f3d", "#0e6572", "#5dd7dd", "#d8f7ef"],
    architecture: "glass-palace",
    zenith: 0x021820,
    horizon: 0x0d6d78,
    floor: 0x062e39,
    structure: 0xa6e2df,
    accent: 0x4de4e5,
    energy: 0x7dd7b7,
  },
  {
    id: "lunar-observatory",
    name: "月海观测台",
    description: "陨石坑月壤、抛物面射电望远镜、太阳能阵列与地球升起",
    background: 0x050912,
    intensity: 0.86,
    starTint: [0.8, 0.88, 1],
    meteor: true,
    swatches: ["#050912", "#29364e", "#cfd7dc", "#6cbce8"],
    architecture: "lunar-deck",
    zenith: 0x02040a,
    horizon: 0x17243e,
    floor: 0x4f535b,
    structure: 0xc8d3da,
    accent: 0x62cce7,
    energy: 0xd8ecff,
  },
]

export function environmentStyleById(id?: string | null): EnvironmentStyle {
  return (
    ENVIRONMENT_STYLES.find((environment) => environment.id === id) ??
    ENVIRONMENT_STYLES[0]
  )
}

export function savedEnvironmentStyleId(): EnvironmentStyleId {
  try {
    return environmentStyleById(
      globalThis.localStorage?.getItem(ENVIRONMENT_STYLE_STORAGE_KEY)
    ).id
  } catch {
    return ENVIRONMENT_STYLES[0].id
  }
}

export function saveEnvironmentStyleId(id: string): EnvironmentStyleId {
  const styleId = environmentStyleById(id).id
  try {
    globalThis.localStorage?.setItem(ENVIRONMENT_STYLE_STORAGE_KEY, styleId)
  } catch {
    // The current scene can still change when storage is unavailable.
  }
  return styleId
}
