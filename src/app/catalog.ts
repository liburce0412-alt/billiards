/** Lightweight presentation catalog shared by every non-WebGL surface. */
import {
  CUE_APPEARANCE_CATALOG,
  ENVIRONMENT_APPEARANCE_CATALOG,
} from "../appearancecatalog"

export const cueOptions = CUE_APPEARANCE_CATALOG.map(
  ({ id, name }) => [id, name] as const
)

export const tableOptions = [
  ["american-ivory", "美式·光谱象牙"],
  ["american-walnut", "美式·胡桃蓝"],
  ["american-graphite", "美式·石墨竞技"],
  ["american-burgundy", "美式·勃艮第"],
  ["chinese-ebony", "中式·黑金大师"],
  ["chinese-ivory", "中式·冰瓷光谱"],
  ["chinese-jade", "中式·翡翠铜"],
  ["chinese-violet", "中式·星云紫"],
] as const

export const environmentOptions = ENVIRONMENT_APPEARANCE_CATALOG.map(
  ({ id, name }) => [id, name] as const
)
