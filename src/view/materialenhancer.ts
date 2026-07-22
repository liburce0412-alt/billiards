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

const textureSize = 64
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
    const clothColor = snooker ? 0x1d7049 : 0x176d88
    const shadeColor = snooker ? 0x12452f : 0x10485b
    material.color.setHex(name.includes("shade") ? shadeColor : clothColor)
    material.metalness = 0
    material.roughness = 0.88
    if (quality.name !== "low") {
      material.normalMap ??= feltNormal!
      material.roughnessMap ??= feltRoughness!
      material.normalScale = new Vector2(0.12, 0.12)
    }
  } else if (isCushion(name)) {
    material.color.setHex(snooker ? 0x15563a : 0x135a70)
    material.metalness = 0
    material.roughness = 0.62
  } else if (name.includes("wood") || name.includes("frame")) {
    material.color.setHex(0x3b2115)
    material.metalness = 0
    material.roughness = 0.34
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

  for (let i = 0; i < textureSize * textureSize; i++) {
    const noiseX = Math.round((random() - 0.5) * 18)
    const noiseY = Math.round((random() - 0.5) * 18)
    normal.set([128 + noiseX, 128 + noiseY, 252, 255], i * 4)
    const value = Math.round(205 + random() * 35)
    roughness.set([value, value, value, 255], i * 4)
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
    texture.repeat.set(12, 24)
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
