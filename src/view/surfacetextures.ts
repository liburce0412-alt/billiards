import {
  DataTexture,
  LinearMipmapLinearFilter,
  RepeatWrapping,
  RGBAFormat,
} from "three"

const textures = new Map<string, DataTexture>()

/** Small, tiled linear modulation maps; base colours remain owned by themes. */
export function surfaceTexture(
  kind: "wood" | "stone" | "limestone" | "metal"
): DataTexture {
  const cached = textures.get(kind)
  if (cached) return cached
  const size = 256
  const pixels = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const grain = Math.sin(
        (x * Math.PI) / 8 + Math.sin((y * Math.PI) / 128) * 1.5
      )
      const noise = ((x * 73 + y * 151 + x * y * 7) % 31) / 31
      const seam = x < 2 || y < 2
      const stone = seam ? 156 : 226 + noise * 12
      const values = {
        wood: 206 + grain * 24 + noise * 12,
        limestone: 232 + noise * 16 + Math.sin(x * 0.07 + y * 0.03) * 4,
        metal: 220 + Math.sin(y * 3.1) * 12 + noise * 8,
        stone,
      }
      const value = values[kind]
      const index = (y * size + x) * 4
      pixels[index] = pixels[index + 1] = pixels[index + 2] = value
      pixels[index + 3] = 255
    }
  }
  const texture = new DataTexture(pixels, size, size, RGBAFormat)
  texture.wrapS = texture.wrapT = RepeatWrapping
  const repeats = {
    wood: [2, 1],
    stone: [12, 12],
    limestone: [2, 2],
    metal: [2, 2],
  }
  texture.repeat.set(repeats[kind][0], repeats[kind][1])
  texture.generateMipmaps = true
  texture.minFilter = LinearMipmapLinearFilter
  texture.anisotropy = 4
  texture.needsUpdate = true
  textures.set(kind, texture)
  return texture
}
