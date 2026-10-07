import {
  BufferGeometry,
  Float32BufferAttribute,
  Matrix4,
  Mesh,
  Object3D,
  Vector3,
} from "three"
import { R } from "../model/physics/constants"
import { TableGeometry } from "./tablegeometry"

/** Shorten the bed between its pockets, retaining the physical size of rails
 * and pocket mouths. A uniform scale would also shrink pockets below ball size. */
export function compactTableCoordinate(
  value: number,
  originalHalf: number,
  targetHalf: number,
  protectedRadius: number
) {
  const distance = Math.abs(value)
  const end = originalHalf - protectedRadius
  if (distance <= protectedRadius) return value
  if (distance >= end)
    return Math.sign(value) * (distance + targetHalf - originalHalf)
  const remaining = targetHalf - protectedRadius * 2
  return (
    Math.sign(value) *
    (protectedRadius +
      ((distance - protectedRadius) * remaining) / (end - protectedRadius))
  )
}

export function fitPocketTableModel(
  scene: Object3D,
  rule: string,
  size: number
) {
  if (rule === "snooker") removeOriginalSnookerSupports(scene)
  if (
    size === 10 ||
    !["eightball", "nineball", "fourball", "snooker"].includes(rule) ||
    scene.userData.fittedTableSize === size
  )
    return
  scene.updateMatrixWorld(true)
  const point = new Vector3()
  scene.traverse((object) => {
    if (!(object instanceof Mesh)) return
    const geometry = object.geometry.clone()
    const sourcePosition = geometry.getAttribute("position")
    const position = new Float32BufferAttribute(sourcePosition.count * 3, 3)
    for (let index = 0; index < sourcePosition.count; index++)
      position.setXYZ(
        index,
        sourcePosition.getX(index),
        sourcePosition.getY(index),
        sourcePosition.getZ(index)
      )
    geometry.setAttribute("position", position)
    const inverse = new Matrix4().copy(object.matrixWorld).invert()
    for (let index = 0; index < position.count; index++) {
      point
        .fromBufferAttribute(position, index)
        .applyMatrix4(object.matrixWorld)
      point.x = compactTableCoordinate(point.x, R * 44, TableGeometry.X, R * 3)
      point.y = compactTableCoordinate(point.y, R * 22, TableGeometry.Y, R * 3)
      point.applyMatrix4(inverse)
      position.setXYZ(index, point.x, point.y, point.z)
    }
    // The source GLTF stores normals in normalized Int8 attributes. Rebuilding
    // face sums into that buffer wraps large cross products before normalization.
    geometry.setAttribute(
      "normal",
      new Float32BufferAttribute(position.count * 3, 3)
    )
    geometry.computeVertexNormals()
    geometry.computeBoundingBox()
    geometry.computeBoundingSphere()
    object.geometry = geometry
  })
  scene.userData.fittedTableSize = size
}

/** The snooker wood primitive combines rails with two disconnected old leg
 * assemblies. Remove their triangles before adding the current support. */
function removeOriginalSnookerSupports(scene: Object3D) {
  if (scene.userData.snookerSupportsReplaced) return
  scene.traverse((object) => {
    if (
      !(object instanceof Mesh) ||
      Array.isArray(object.material) ||
      object.material.name !== "wood"
    )
      return
    const source = object.geometry
    const position = source.getAttribute("position")
    const indices = source.index
    if (!indices || indices.count !== 372 || position.count !== 220) return
    const retained: number[] = []
    for (let index = 0; index < indices.count; index += 3) {
      const triangle = [
        indices.getX(index),
        indices.getX(index + 1),
        indices.getX(index + 2),
      ]
      if (!triangle.every((vertex) => position.getZ(vertex) < 3500))
        retained.push(...triangle)
    }
    if (retained.length !== 252)
      throw new Error(
        "Unexpected snooker support geometry; refusing to remove rails"
      )
    const geometry = retainedGeometry(source, retained)
    object.geometry = geometry
    source.dispose()
  })
  scene.userData.snookerSupportsReplaced = true
}

function retainedGeometry(source: BufferGeometry, retained: number[]) {
  const vertices = [...new Set(retained)]
  const remap = new Map(vertices.map((vertex, index) => [vertex, index]))
  const geometry = new BufferGeometry()
  for (const name of Object.keys(source.attributes)) {
    const attribute = source.getAttribute(name)
    const data: number[] = []
    for (const vertex of vertices) {
      data.push(attribute.getX(vertex))
      if (attribute.itemSize > 1) data.push(attribute.getY(vertex))
      if (attribute.itemSize > 2) data.push(attribute.getZ(vertex))
      if (attribute.itemSize > 3) data.push(attribute.getW(vertex))
    }
    geometry.setAttribute(
      name,
      new Float32BufferAttribute(data, attribute.itemSize)
    )
  }
  geometry.setIndex(retained.map((vertex) => remap.get(vertex)!))
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  return geometry
}
