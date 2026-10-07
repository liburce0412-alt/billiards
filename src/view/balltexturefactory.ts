import {
  CanvasTexture,
  Color,
  LinearFilter,
  LinearMipmapLinearFilter,
  SRGBColorSpace,
} from "three"

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
    canvas.style.imageRendering = "auto"
    const ctx = canvas.getContext("2d")
    if (!ctx) return new CanvasTexture(canvas)

    const width = canvas.width
    const height = canvas.height
    const ballColor = `#${color.getHexString()}`

    const ivory = "#f5efe2"
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = "high"
    ctx.fillStyle = label >= 9 || label === 0 ? ivory : ballColor
    ctx.fillRect(0, 0, width, height)
    if (label >= 9) {
      ctx.fillStyle = ballColor
      ctx.fillRect(0, height * 0.275, width, height * 0.45)
      ctx.fillStyle = "rgba(255,255,255,0.16)"
      ctx.fillRect(0, height * 0.275, width, Math.max(1, scale * 2))
      ctx.fillStyle = "rgba(0,0,0,0.12)"
      ctx.fillRect(0, height * 0.725 - scale * 2, width, Math.max(1, scale * 2))
    }

    const resinLight = ctx.createLinearGradient(0, 0, 0, height)
    resinLight.addColorStop(0, "rgba(255,255,255,0.12)")
    resinLight.addColorStop(0.46, "rgba(255,255,255,0)")
    resinLight.addColorStop(1, "rgba(20,25,32,0.08)")
    ctx.fillStyle = resinLight
    ctx.fillRect(0, 0, width, height)

    if (label > 0) {
      const centerY = height / 2
      const radius = Math.round(43 * scale)
      const border = Math.max(2, Math.round(2.5 * scale))
      for (const centerX of [width * 0.25, width * 0.75]) {
        ctx.beginPath()
        ctx.arc(centerX, centerY, radius + border, 0, Math.PI * 2)
        ctx.fillStyle = "#20252a"
        ctx.fill()
        ctx.beginPath()
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2)
        ctx.fillStyle = ivory
        ctx.fill()

        ctx.fillStyle = "#111519"
        const fontSize = Math.round((label >= 10 ? 58 : 67) * scale)
        ctx.font = `900 ${fontSize}px "Arial Black", Inter, Arial, sans-serif`
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        ctx.lineJoin = "round"
        ctx.strokeStyle = "rgba(255,255,255,0.72)"
        ctx.lineWidth = Math.max(1, 1.2 * scale)
        ctx.strokeText(label.toString(), centerX, centerY + 1.5 * scale)
        ctx.fillText(label.toString(), centerX, centerY + 1.5 * scale)
      }
    }

    const texture = new CanvasTexture(canvas)
    // SphereGeometry uses a bottom-origin V coordinate; canvas rows start at
    // the top. Keep the usual canvas upload flip so labels are not mirrored.
    texture.flipY = true
    texture.colorSpace = SRGBColorSpace
    texture.generateMipmaps = true
    texture.minFilter = LinearMipmapLinearFilter
    texture.magFilter = LinearFilter
    texture.name = `ball-${label}-${color.getHexString()}-${size}`
    return texture
  }
}
