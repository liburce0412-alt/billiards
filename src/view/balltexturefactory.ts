import { CanvasTexture, Color, SRGBColorSpace } from "three"

export class BallTextureFactory {
  private static readonly textureCache: Map<string, CanvasTexture> = new Map()

  static getOrCreateTexture(
    label: number,
    color: Color,
    size = 256
  ): CanvasTexture {
    const key = `${label}_${color.getHex()}_${size}`
    if (this.textureCache.has(key)) {
      return this.textureCache.get(key)!
    }

    const texture = this.createNumberTexture(label, color, size)
    this.textureCache.set(key, texture)
    return texture
  }

  private static createNumberTexture(
    label: number,
    color: Color,
    size: number
  ): CanvasTexture {
    const scale = size / 256
    const canvas = document.createElement("canvas")
    canvas.width = size * 2
    canvas.height = size
    const ctx = canvas.getContext("2d")
    if (!ctx) return new CanvasTexture(canvas)

    const width = canvas.width
    const height = canvas.height
    const ballColor = `#${color.getHexString()}`

    ctx.fillStyle = label >= 9 || label === 0 ? "white" : ballColor
    ctx.fillRect(0, 0, width, height)
    if (label >= 9) {
      ctx.fillStyle = ballColor
      ctx.fillRect(0, height * 0.25, width, height * 0.5)
    }

    if (label > 0) {
      const centerY = height / 2
      const radius = Math.round(42 * scale)
      const border = Math.round(8 * scale)
      for (const centerX of [width * 0.25, width * 0.75]) {
        ctx.beginPath()
        ctx.arc(centerX, centerY, radius + border, 0, Math.PI * 2)
        ctx.fillStyle = "black"
        ctx.fill()
        ctx.beginPath()
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2)
        ctx.fillStyle = "white"
        ctx.fill()

        ctx.fillStyle = "black"
        ctx.strokeStyle = "black"
        const fontSize = Math.round(68 * scale)
        ctx.lineWidth = fontSize * 0.04
        ctx.font = `900 ${fontSize}px "Arial Black", Arial, sans-serif`
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        ctx.strokeText(label.toString(), centerX, centerY + 3 * scale)
        ctx.fillText(label.toString(), centerX, centerY + 3 * scale)
      }
    }

    const texture = new CanvasTexture(canvas)
    texture.flipY = false
    texture.colorSpace = SRGBColorSpace
    return texture
  }
}
