import {
  Color,
  CubeTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  NoColorSpace,
} from "three"

export class BallCubeTextureFactory {
  private static readonly textureCache: Map<string, CubeTexture> = new Map()

  static getOrCreateTexture(color: Color, size = 256, dotScale = 0.1) {
    dotScale = color.getHexString() === "ff0000" ? 0.08 : dotScale
    const key = `${size}_${dotScale}`
    if (this.textureCache.has(key)) {
      return this.textureCache.get(key)!
    }

    const texture = this.createTexture(size, dotScale)
    this.textureCache.set(key, texture)
    return texture
  }

  private static createTexture(size: number, dotScale: number) {
    const canvas = document.createElement("canvas")
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext("2d")
    if (ctx) {
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = "high"
      ctx.fillStyle = "#000000"
      ctx.fillRect(0, 0, size, size)

      ctx.beginPath()
      ctx.arc(size / 2, size / 2, size * dotScale, 0, Math.PI * 2)
      ctx.fillStyle = "#ffffff"
      ctx.fill()
    }

    const texture = new CubeTexture(Array(6).fill(canvas))
    texture.colorSpace = NoColorSpace
    texture.generateMipmaps = true
    texture.minFilter = LinearMipmapLinearFilter
    texture.magFilter = LinearFilter
    texture.name = `ball-marker-mask-${size}-${dotScale}`
    texture.needsUpdate = true
    return texture
  }
}
