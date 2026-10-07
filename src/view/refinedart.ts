import { BufferGeometry, Group, Material, Mesh, Object3D, Texture } from "three"
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js"

export interface RefinedArtEntry {
  id: string
  file: string
  sha256: string
  category: string
  ballRadius?: number
  radius?: number
  length?: number
}

interface RefinedArtManifest {
  version: 1
  sourceBallRadius: number
  runtimeRootRotationX: number
  assets: RefinedArtEntry[]
}

const base = "/models/legacy-refined/"
const loaded = new Map<string, Object3D>()
const pending = new Map<string, Promise<void>>()
let manifest: RefinedArtManifest | undefined
let manifestRequest: Promise<RefinedArtManifest | undefined> | undefined
let generation = 0

/** Only the release manifest enables Blender art. Authoring and headless physics
 * never fetch resources or change their existing deterministic constructors. */
export function refinedArtManifest() {
  if (typeof window === "undefined" || typeof window.fetch !== "function")
    return Promise.resolve(undefined)
  if (manifestRequest) return manifestRequest
  const requestGeneration = generation
  manifestRequest = window
    .fetch(`${base}manifest.json`, { cache: "no-cache" })
    .then(async (response) => {
      if (!response.ok) throw new Error(`Art manifest HTTP ${response.status}`)
      const data = (await response.json()) as RefinedArtManifest
      if (requestGeneration !== generation) return undefined
      if (data.version !== 1 || !Array.isArray(data.assets))
        throw new Error("Unsupported refined art manifest")
      if (
        !Number.isFinite(data.sourceBallRadius) ||
        !Number.isFinite(data.runtimeRootRotationX) ||
        data.assets.some(
          (entry) =>
            !/^[a-z0-9-]+$/.test(entry.id) ||
            entry.file !== `${entry.id}.glb` ||
            !/^[a-f0-9]{64}$/.test(entry.sha256)
        )
      )
        throw new Error("Invalid refined art manifest")
      manifest = data
      return data
    })
    .catch((error) => {
      console.warn(
        "Refined art is unavailable; retaining current models",
        error
      )
      return undefined
    })
  return manifestRequest
}

export function refinedArtEntry(id: string) {
  return manifest?.assets.find((entry) => entry.id === id)
}

export function hasRefinedArt(id: string) {
  return loaded.has(id)
}

export function refinedArtSourceRadius() {
  return manifest?.sourceBallRadius ?? 0.03275
}

export async function preloadRefinedArt(ids: string[]) {
  const requestGeneration = generation
  await refinedArtManifest()
  if (requestGeneration !== generation) return
  await Promise.all(
    ids.map(async (id) => {
      const entry = refinedArtEntry(id)
      if (!entry || loaded.has(id)) return
      let request = pending.get(id)
      if (!request) {
        request = new GLTFLoader()
          .loadAsync(`${base}${entry.file}?v=${entry.sha256.slice(0, 12)}`)
          .then((gltf) => {
            if (requestGeneration !== generation) {
              disposeArtTemplates([gltf.scene])
              return
            }
            const group = new Group()
            group.name = `refined-${id}`
            // Exported art is glTF Y-up. Billiards retains its Z-up physics
            // coordinates and all authored local cue/robot pivots.
            group.rotation.x = manifest!.runtimeRootRotationX
            group.userData.refinedArtId = id
            group.add(gltf.scene)
            loaded.set(id, group)
          })
          .catch((error) => {
            console.warn(`Failed to load refined art ${id}`, error)
          })
        pending.set(id, request)
      }
      await request
    })
  )
}

/** Each consumer owns geometry and materials; cached texture images remain
 * shared. Scene changes can dispose their copies without invalidating others. */
export function refinedArt(id: string): Object3D | undefined {
  const template = loaded.get(id)
  if (!template) return undefined
  const copy = template.clone(true)
  const geometries = new Map<BufferGeometry, BufferGeometry>()
  const materials = new Map<Material, Material>()
  const copyMaterial = (source: Material) => {
    let material = materials.get(source)
    if (!material) {
      material = source.clone()
      materials.set(source, material)
    }
    return material
  }
  copy.traverse((object) => {
    if (!(object instanceof Mesh)) return
    let geometry = geometries.get(object.geometry)
    if (!geometry) {
      const cloned: BufferGeometry = object.geometry.clone()
      geometries.set(object.geometry, cloned)
      geometry = cloned
    }
    object.geometry = geometry
    object.material = Array.isArray(object.material)
      ? object.material.map(copyMaterial)
      : copyMaterial(object.material)
  })
  return copy
}

export async function loadRefinedArt(id: string) {
  await preloadRefinedArt([id])
  return refinedArt(id)
}

export function disposeRefinedArt(root: Object3D) {
  const geometries = new Set<BufferGeometry>()
  const materials = new Set<Material>()
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return
    geometries.add(object.geometry)
    for (const material of Array.isArray(object.material)
      ? object.material
      : [object.material])
      materials.add(material)
  })
  geometries.forEach((geometry) => geometry.dispose())
  materials.forEach((material) => material.dispose())
}

function disposeArtTemplates(roots: Object3D[]) {
  const textures = new Set<Texture>()
  const images = new Set<{ close?: () => void }>()
  for (const root of roots) {
    root.traverse((object) => {
      if (!(object instanceof Mesh)) return
      for (const material of Array.isArray(object.material)
        ? object.material
        : [object.material]) {
        for (const value of Object.values(material))
          if (value instanceof Texture) textures.add(value)
      }
    })
    disposeRefinedArt(root)
  }
  for (const texture of textures) {
    if (texture.image) images.add(texture.image)
    texture.dispose()
  }
  images.forEach((image) => image.close?.())
}

/** Called only after the game's consumers stop rendering and dispose their
 * copies. Invalidates in-flight loads as well as cached GPU/bitmap resources. */
export function clearRefinedArtCache() {
  generation++
  disposeArtTemplates([...loaded.values()])
  loaded.clear()
  pending.clear()
  manifest = undefined
  manifestRequest = undefined
}

/** Geometry-only seam for the existing animated robot instance matrices. */
export function refinedPrototype(id: string): BufferGeometry | undefined {
  const art = refinedArt(id)
  if (!art) return undefined
  art.updateMatrixWorld(true)
  let geometry: BufferGeometry | undefined
  art.traverse((object) => {
    if (geometry || !(object instanceof Mesh)) return
    const transformed: BufferGeometry = object.geometry
      .clone()
      .applyMatrix4(object.matrixWorld)
    transformed.userData.refinedArtId = id
    geometry = transformed
  })
  disposeRefinedArt(art)
  return geometry
}

export function refinedTableId(rule: string, size: number, style: string) {
  const geometryRule = ["eightball", "nineball", "fourball"].includes(rule)
    ? "eightball"
    : rule
  return `table-${geometryRule}-${size}-${style}`
}
