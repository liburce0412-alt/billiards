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
    const key = `texturedDots_${color.getHex()}`
    if (this.materialCache.has(key)) {
      return this.materialCache.get(key) as MeshPhysicalMaterial
    }

    const cubeTexture = BallCubeTextureFactory.getOrCreateTexture(color)
    const material = new MeshPhysicalMaterial({
      color: color,
      roughness: 0.1,
      metalness: 0,
      clearcoat: 1.0,
      clearcoatRoughness: 0.02,
      reflectivity: 0.25,
    })

    material.onBeforeCompile = (shader: any) => {
      shader.uniforms.uCubeMap = { value: cubeTexture }

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
        varying vec3 vLocalPos;
        ${shader.fragmentShader}
      `.replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        diffuseColor.rgb = textureCube(uCubeMap, normalize(vLocalPos)).rgb;`
      )
    }

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
    const key = `projected_${label}_${color.getHex()}_${size}`
    if (this.materialCache.has(key)) {
      return this.materialCache.get(key) as MeshStandardMaterial
    }

    const numberTexture = BallTextureFactory.getOrCreateTexture(
      label,
      color,
      size
    )

    const material =
      getRenderQuality().name === "low"
        ? new MeshStandardMaterial({
            color: 0xffffff,
            map: numberTexture,
            roughness: 0.28,
            metalness: 0,
          })
        : new MeshPhysicalMaterial({
            color: 0xffffff,
            map: numberTexture,
            roughness: 0.16,
            metalness: 0,
            clearcoat: 0.9,
            clearcoatRoughness: 0.07,
            reflectivity: 0.35,
          })
    this.materialCache.set(key, material)
    return material
  }
}
