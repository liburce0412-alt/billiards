import {
  Color,
  MeshPhongMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
} from "three"
import { BallTextureFactory } from "./balltexturefactory"
import { BallCubeTextureFactory } from "./ballcubetexturefactory"
import { getRenderQuality } from "./renderquality"

export class BallMaterialFactory {
  private static readonly materialCache: Map<
    string,
    MeshStandardMaterial | MeshPhongMaterial | MeshPhysicalMaterial
  > = new Map()

  static createTexturedDotsMaterial(color: Color): MeshPhysicalMaterial {
    const quality = getRenderQuality()
    const key = `texturedDots_${color.getHex()}_${quality.name}`
    if (this.materialCache.has(key)) {
      return this.materialCache.get(key) as MeshPhysicalMaterial
    }

    const cubeTexture = BallCubeTextureFactory.getOrCreateTexture(color, 256)
    cubeTexture.anisotropy = quality.maxAnisotropy
    const markerColour = new Color(
      color.getHexString() === "ff0000" ? 0xffffff : 0xcc2c32
    )
    const material = new MeshPhysicalMaterial({
      color: color,
      roughness: 0.17,
      metalness: 0,
      clearcoat: 0.72,
      clearcoatRoughness: 0.065,
      ior: 1.53,
      reflectivity: 0.45,
      envMapIntensity: quality.name === "low" ? 0.68 : 0.88,
    })

    material.onBeforeCompile = (shader: any) => {
      shader.uniforms.uCubeMap = { value: cubeTexture }
      shader.uniforms.uMarkerColour = { value: markerColour }

      shader.vertexShader = `
        varying vec3 vLocalPos;
        ${shader.vertexShader}
      `.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vLocalPos = position;`
      )

      shader.fragmentShader = `
        uniform samplerCube uCubeMap;
        uniform vec3 uMarkerColour;
        varying vec3 vLocalPos;
        ${shader.fragmentShader}
      `.replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float markerMask = textureCube(uCubeMap, normalize(vLocalPos)).r;
        diffuseColor.rgb = mix(diffuseColor.rgb, uMarkerColour, markerMask);`
      )
    }
    material.customProgramCacheKey = () => "shared-ball-marker-mask-v2"

    this.materialCache.set(key, material)
    return material
  }

  static createDottedMaterial(color: Color): MeshPhongMaterial {
    const key = `dotted_${color.getHex()}`
    if (this.materialCache.has(key)) {
      return this.materialCache.get(key) as MeshPhongMaterial
    }

    const material = new MeshPhongMaterial({
      emissive: 0,
      flatShading: true,
      vertexColors: true,
      forceSinglePass: true,
      shininess: 25,
      specular: 0x555533,
      transparent: false,
      depthWrite: true,
    })
    this.materialCache.set(key, material)
    return material
  }

  static createProjectedMaterial(
    label: number,
    color: Color,
    size = 256
  ): MeshStandardMaterial {
    const quality = getRenderQuality()
    const key = `projected_${label}_${color.getHex()}_${size}_${quality.name}`
    if (this.materialCache.has(key)) {
      return this.materialCache.get(key) as MeshStandardMaterial
    }

    const numberTexture = BallTextureFactory.getOrCreateTexture(
      label,
      color,
      size
    )
    numberTexture.anisotropy = quality.maxAnisotropy

    const material =
      quality.name === "low"
        ? new MeshStandardMaterial({
            color: 0xffffff,
            map: numberTexture,
            roughness: 0.3,
            metalness: 0,
            envMapIntensity: 0.68,
          })
        : new MeshPhysicalMaterial({
            color: 0xffffff,
            map: numberTexture,
            roughness: 0.17,
            metalness: 0,
            clearcoat: 0.72,
            clearcoatRoughness: 0.065,
            ior: 1.53,
            reflectivity: 0.45,
            envMapIntensity: 0.88,
          })
    this.materialCache.set(key, material)
    return material
  }
}
