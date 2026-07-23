import {
  DataTexture,
  MeshStandardMaterial,
  Object3D,
  RepeatWrapping,
  RGBAFormat,
  UnsignedByteType,
  Vector2,
} from "three"
import { RenderQualityProfile } from "./renderquality"

const textureSize = 128
let feltNormal: DataTexture | undefined
let feltRoughness: DataTexture | undefined

function isCloth(name: string) {
  return name.includes("cloth") || name.includes("felt")
}

function isCushion(name: string) {
  return name.includes("cushion") || name.includes("rubber")
}

function configureMaterial(
  material: MeshStandardMaterial,
  name: string,
  quality: RenderQualityProfile,
  snooker: boolean
) {
  material.envMapIntensity = quality.name === "high" ? 1.15 : 0.8

  if (isCloth(name)) {
    const clothColor = snooker ? 0x17613e : 0x155f75
    const shadeColor = snooker ? 0x103e2a : 0x0e4050
    material.color.setHex(name.includes("shade") ? shadeColor : clothColor)
    material.metalness = 0
    material.roughness = 0.92
    if (quality.name !== "low") {
      material.normalMap ??= feltNormal!
      material.roughnessMap ??= feltRoughness!
      material.normalScale = new Vector2(0.18, 0.12)
    }
  } else if (isCushion(name)) {
    material.color.setHex(snooker ? 0x124d33 : 0x104e60)
    material.metalness = 0
    material.roughness = 0.68
  } else if (name.includes("wood") || name.includes("frame")) {
    material.color.setHex(0x3a2014)
    material.metalness = 0
    material.roughness = 0.38
  }
  material.needsUpdate = true
}

function createFeltTextures() {
  if (feltNormal && feltRoughness) return

  const normal = new Uint8Array(textureSize * textureSize * 4)
  const roughness = new Uint8Array(textureSize * textureSize * 4)
  let seed = 0x2f6e2b1
  const random = () => {
    seed = (1664525 * seed + 1013904223) >>> 0
    return seed / 0xffffffff
  }

  for (let y = 0; y < textureSize; y++) {
    for (let x = 0; x < textureSize; x++) {
      const i = y * textureSize + x
      const warp = Math.sin((x * Math.PI * 2) / 4)
      const weft = Math.sin((y * Math.PI * 2) / 7)
      const nap = Math.sin((y * Math.PI * 2) / textureSize)
      const fibreNoise = random() - 0.5
      const nx = Math.round(128 + warp * 5 + fibreNoise * 3)
      const ny = Math.round(128 + weft * 8 + nap * 3 + fibreNoise * 2)
      normal.set([nx, ny, 253, 255], i * 4)
      const value = Math.round(
        225 + Math.abs(warp) * 9 + Math.abs(weft) * 7 + fibreNoise * 4
      )
      roughness.set([value, value, value, 255], i * 4)
    }
  }

  feltNormal = new DataTexture(
    normal,
    textureSize,
    textureSize,
    RGBAFormat,
    UnsignedByteType
  )
  feltRoughness = new DataTexture(
    roughness,
    textureSize,
    textureSize,
    RGBAFormat,
    UnsignedByteType
  )
  for (const texture of [feltNormal, feltRoughness]) {
    texture.wrapS = texture.wrapT = RepeatWrapping
    texture.repeat.set(36, 18)
    texture.needsUpdate = true
  }
}

export function enhanceTableMaterials(
  root: Object3D,
  quality: RenderQualityProfile,
  ruleType: string
) {
  if (quality.name !== "low") createFeltTextures()
  const snooker = ruleType === "snooker"

  root.traverse((object: any) => {
    if (!object.isMesh) return

    const objectName = object.name?.toLowerCase() ?? ""
    object.receiveShadow = quality.dynamicShadows
    object.castShadow = quality.dynamicShadows

    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material]
    for (const material of materials) {
      if (!(material instanceof MeshStandardMaterial)) continue
      const name = `${objectName} ${material.name?.toLowerCase() ?? ""}`
      if (isCloth(name)) {
        object.castShadow = false
      }
      configureMaterial(material, name, quality, snooker)
    }
  })
}
