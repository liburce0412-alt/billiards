import {
  BoxGeometry,
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  LatheGeometry,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
} from "three"
import { R } from "../model/physics/constants"
import { EnvironmentStyle } from "./environmentstyle"
import { RenderQualityProfile } from "./renderquality"
import { surfaceTexture } from "./surfacetextures"

type Point = [number, number, number]
const FLOOR = -0.6143625
const TAU = Math.PI * 2

function mergeSurfaces(parts: BufferGeometry[]): BufferGeometry {
  const result = new BufferGeometry()
  const names = ["position", "normal", "uv"]
  if (parts[0].getAttribute("color")) names.push("color")
  for (const name of names) {
    const attributes = parts.map((part) => part.getAttribute(name))
    const data = new Float32Array(
      attributes.reduce((size, attribute) => size + attribute.array.length, 0)
    )
    let offset = 0
    for (const attribute of attributes) {
      data.set(attribute.array, offset)
      offset += attribute.array.length
    }
    result.setAttribute(
      name,
      new Float32BufferAttribute(data, attributes[0].itemSize)
    )
  }
  return result
}

/** Author in metres, then batch static pieces by surface. Every theme owns its
 * geometry; switching scenes releases the batches rather than growing a cache. */
class SetBuilder {
  readonly root = new Group()
  readonly segments: number
  readonly low: boolean
  private readonly pieces = new Map<Material, BufferGeometry[]>()
  readonly floor: MeshStandardMaterial
  readonly stone: MeshStandardMaterial
  readonly metal: MeshStandardMaterial
  readonly light: MeshBasicMaterial
  readonly dark: MeshStandardMaterial

  constructor(
    readonly style: EnvironmentStyle,
    readonly quality: RenderQualityProfile
  ) {
    this.low = quality.name === "low"
    this.segments = this.low ? 8 : 24
    this.root.name = `${style.id}-architecture`
    this.root.scale.setScalar(R / 0.028575)
    this.floor = new MeshStandardMaterial({
      color: style.floor,
      roughness: 0.8,
      map: style.id === "lunar-observatory" ? null : surfaceTexture("stone"),
    })
    this.stone = new MeshStandardMaterial({
      color: style.structure,
      roughness: 0.48,
      map: surfaceTexture("limestone"),
      bumpMap: surfaceTexture("limestone"),
      bumpScale: 0.003,
    })
    this.metal = new MeshStandardMaterial({
      color: ["spectra", "galaxy", "nebula", "lunar-observatory"].includes(
        style.id
      )
        ? 0x8299ab
        : style.energy,
      metalness: 0.7,
      roughness: 0.3,
      roughnessMap: surfaceTexture("metal"),
    })
    this.light = new MeshBasicMaterial({ color: style.accent })
    this.dark = new MeshStandardMaterial({ color: 0x182630, roughness: 0.65 })
  }

  add(
    geometry: BufferGeometry,
    material: Material,
    position: Point = [0, 0, 0],
    rotation: Point = [0, 0, 0],
    scale: Point = [1, 1, 1]
  ) {
    const mesh = new Mesh(geometry)
    mesh.position.set(...position)
    mesh.rotation.set(...rotation)
    mesh.scale.set(...scale)
    mesh.updateMatrix()
    const plain = geometry.index ? geometry.toNonIndexed() : geometry
    plain.applyMatrix4(mesh.matrix)
    if (!plain.getAttribute("uv"))
      plain.setAttribute(
        "uv",
        new Float32BufferAttribute(
          new Float32Array(plain.getAttribute("position").count * 2),
          2
        )
      )
    if (material.userData.vertexTint !== undefined) {
      const tint = new Color(material.userData.vertexTint)
      const count = plain.getAttribute("position").count
      const colours = new Float32Array(count * 3)
      for (let i = 0; i < count; i++) tint.toArray(colours, i * 3)
      plain.setAttribute("color", new Float32BufferAttribute(colours, 3))
    }
    if (plain !== geometry) geometry.dispose()
    const group = this.pieces.get(material) ?? []
    group.push(plain)
    this.pieces.set(material, group)
  }

  box(
    size: Point,
    at: Point,
    material: Material = this.stone,
    rotation: Point = [0, 0, 0]
  ) {
    this.add(new BoxGeometry(...size), material, at, rotation)
  }

  cylinder(
    radius: number,
    height: number,
    at: Point,
    material: Material = this.stone,
    top = radius
  ) {
    this.add(
      new CylinderGeometry(top, radius, height, this.segments),
      material,
      at,
      [Math.PI / 2, 0, 0]
    )
  }

  ball(
    radius: number,
    at: Point,
    material: Material,
    scale: Point = [1, 1, 1]
  ) {
    this.add(
      new SphereGeometry(radius, this.segments, this.low ? 6 : 12),
      material,
      at,
      [0, 0, 0],
      scale
    )
  }

  tube(points: Point[], radius: number, material: Material, closed = false) {
    this.add(
      new TubeGeometry(
        new CatmullRomCurve3(
          points.map((p) => new Vector3(...p)),
          closed
        ),
        this.low ? 12 : 32,
        radius,
        this.low ? 4 : 6,
        closed
      ),
      material
    )
  }

  ring(
    radius: number,
    thickness: number,
    at: Point,
    material: Material,
    rotation: Point = [0, 0, 0]
  ) {
    this.add(
      new TorusGeometry(radius, thickness, this.low ? 4 : 6, this.segments * 2),
      material,
      at,
      rotation
    )
  }

  lathe(profile: [number, number][], at: Point, material: Material) {
    this.add(
      new LatheGeometry(
        profile.map((p) => new Vector2(...p)),
        this.segments
      ),
      material,
      at,
      [Math.PI / 2, 0, 0]
    )
  }

  label(name: string) {
    const marker = new Group()
    marker.name = name
    this.root.add(marker)
  }

  finish() {
    const landmark = new Group()
    landmark.name = `${this.style.architecture}-landmark`
    let triangles = 0
    for (const [material, geometries] of this.pieces) {
      const merged = mergeSurfaces(geometries)
      geometries.forEach((geometry) => geometry.dispose())
      merged.computeBoundingSphere()
      triangles += merged.getAttribute("position").count / 3
      const mesh = new Mesh(merged, material)
      mesh.name = `${this.style.id}-${landmark.children.length}-surface`
      mesh.castShadow = this.quality.dynamicShadows
      mesh.receiveShadow = this.quality.dynamicShadows
      landmark.add(mesh)
    }
    this.root.add(landmark)
    this.root.userData.environmentBudget = {
      drawCalls: landmark.children.length,
      triangles,
    }
    const materials = new Set<Material>([
      this.floor,
      this.stone,
      this.metal,
      this.light,
      this.dark,
      ...this.pieces.keys(),
    ])
    return {
      root: this.root,
      dispose: () => {
        landmark.children.forEach((mesh) => {
          if (mesh instanceof Mesh) mesh.geometry.dispose()
        })
        materials.forEach((material) => material.dispose())
      },
    }
  }
}

function rectangularDeck(
  b: SetBuilder,
  width: number,
  length: number,
  material: Material = b.floor
) {
  b.box([width, length, 0.22], [0, 0, FLOOR - 0.11], material)
}

function railing(b: SetBuilder, points: Point[]) {
  b.tube(
    points.map(([x, y]) => [x, y, FLOOR + 0.72]),
    0.035,
    b.metal
  )
  for (const [x, y] of points)
    b.cylinder(0.025, 0.7, [x, y, FLOOR + 0.35], b.metal)
}

function spectra(b: SetBuilder) {
  b.label("spectra-prism-and-dispersion-gallery")
  rectangularDeck(b, 8.2, 7.8)
  // A split optical gallery: a triangular prism takes white light on the left,
  // and seven physically distinct rays fan across a curved receiver on the right.
  b.box([8.2, 0.18, 2.65], [0, 3.75, FLOOR + 1.325])
  for (const side of [-1, 1]) {
    b.box([0.22, 5.6, 2.65], [side * 4, 0.9, FLOOR + 1.325])
    for (let i = 0; i < 9; i++)
      b.box(
        [0.05, 0.08, 2.5],
        [side * 3.86, -1.6 + i * 0.6, FLOOR + 1.3],
        b.metal
      )
  }
  b.cylinder(0.5, 0.3, [-2, 2.4, FLOOR + 0.15], b.dark)
  const prism = b.low
    ? b.stone
    : new MeshPhysicalMaterial({
        color: 0xd1effa,
        roughness: 0.08,
        metalness: 0.05,
        transmission: 0.65,
        thickness: 0.45,
        ior: 1.5,
      })
  b.add(new CylinderGeometry(0.8, 0.8, 0.55, 3), prism, [-2, 2.4, FLOOR + 0.7])
  const spectrum = [
    0xff695c, 0xffad50, 0xffda70, 0x70e4b1, 0x6ed7fc, 0x8d9dff, 0xc491ed,
  ]
  const paint = new MeshBasicMaterial({ vertexColors: true })
  spectrum.forEach((color, index) => {
    paint.userData.vertexTint = color
    const endZ = FLOOR + 0.3 + index * 0.27
    b.tube(
      [
        [-1.6, 2.45, FLOOR + 1.1],
        [-0.3, 2.58, FLOOR + 0.7 + index * 0.14],
        [2.65, 2.9, endZ],
      ],
      0.017,
      paint
    )
    b.box([0.08, 0.025, 0.18], [2.65, 3.62, endZ], paint)
  })
  b.box([1.3, 0.07, 0.07], [-3.1, 2.4, FLOOR + 1.1], b.light)
  for (let i = 0; i < 5; i++) {
    b.box([0.72, 0.14, 0.05], [-1.5 + i * 0.76, 3.62, FLOOR + 2.3], b.light)
  }
  for (const x of [-2.9, 2.9]) {
    b.box([0.65, 1.6, 0.22], [x, -0.2, FLOOR + 0.2], b.dark)
    b.box([0.02, 1.58, 0.015], [x - 0.2, -0.2, FLOOR + 0.32], b.light)
  }
}

function galaxy(b: SetBuilder) {
  b.label("galaxy-panorama-observation-bridge")
  b.cylinder(3.8, 0.28, [0, 0, FLOOR - 0.14], b.dark)
  b.cylinder(3.55, 0.045, [0, 0, FLOOR - 0.02], b.floor)
  b.ring(3.6, 0.027, [0, 0, FLOOR + 0.015], b.light)
  // Panoramic hull window with radial ribs, each attached to the deck's outer rim.
  for (let i = 0; i <= 8; i++) {
    const a = Math.PI * (0.08 + i * 0.105)
    const x = Math.cos(a) * 3.65,
      y = Math.sin(a) * 3.65
    b.tube(
      [
        [x, y, FLOOR],
        [x * 1.04, y * 1.04, 0.8],
        [x * 0.9, y * 0.9, 2.25],
      ],
      0.07,
      b.stone
    )
  }
  const arc: Point[] = Array.from({ length: 13 }, (_, i) => {
    const a = Math.PI * (0.08 + i * 0.07)
    return [Math.cos(a) * 3.65, Math.sin(a) * 3.65, FLOOR]
  })
  railing(b, arc)
  b.tube(
    arc.map(([x, y]) => [x * 0.9, y * 0.9, 2.25]),
    0.095,
    b.stone
  )
  b.tube(
    arc.map(([x, y]) => [x * 0.9, y * 0.9, 2.18]),
    0.025,
    b.light
  )
  for (const x of [-2.6, 2.6]) {
    b.box([0.85, 0.6, 0.65], [x, 1.1, FLOOR + 0.325], b.dark)
    b.box([0.77, 0.46, 0.035], [x, 1.1, FLOOR + 0.69], b.light, [0.2, 0, 0])
    for (let i = 0; i < 3; i++)
      b.box(
        [0.07, 0.12, 0.025],
        [x - 0.22 + i * 0.22, 0.96, FLOOR + 0.74],
        b.metal
      )
  }
  b.box([1.2, 3, 0.16], [0, -4.5, FLOOR - 0.08], b.dark)
  railing(b, [
    [-0.58, -5.8, FLOOR],
    [-0.58, -3.7, FLOOR],
  ])
  railing(b, [
    [0.58, -5.8, FLOOR],
    [0.58, -3.7, FLOOR],
  ])
}

function nebula(b: SetBuilder) {
  b.label("nebula-stellar-nursery-research-platform")
  rectangularDeck(b, 5.6, 4.6, b.dark)
  b.box([5.2, 4.2, 0.035], [0, 0, FLOOR], b.floor)
  // Two side observatories and a bridge, exposed to a luminous stellar nursery.
  for (const side of [-1, 1]) {
    const x = side * 3.3
    b.cylinder(0.8, 0.25, [x, 2.1, FLOOR - 0.12], b.stone)
    b.ring(0.76, 0.035, [x, 2.1, FLOOR + 0.03], b.light)
    b.box([1.3, 0.8, 0.15], [side * 2.6, 1.65, FLOOR - 0.08], b.stone)
    b.cylinder(0.16, 0.7, [x, 2.1, FLOOR + 0.35], b.metal)
    b.ball(0.35, [x, 2.1, FLOOR + 0.85], b.dark)
    b.ring(0.48, 0.04, [x, 2.1, FLOOR + 0.85], b.light, [Math.PI / 2, 0.3, 0])
    // A barrel and objective on the gimbal make the instrument readable as a telescope.
    b.add(
      new CylinderGeometry(0.22, 0.27, 0.85, b.segments),
      b.stone,
      [x, 2.33, FLOOR + 1.07],
      [Math.PI / 5, 0, 0]
    )
    b.add(
      new CylinderGeometry(0.225, 0.225, 0.12, b.segments),
      b.dark,
      [x, 2.65, FLOOR + 1.3],
      [Math.PI / 5, 0, 0]
    )
    b.add(
      new CylinderGeometry(0.19, 0.19, 0.015, b.segments),
      b.light,
      [x, 2.71, FLOOR + 1.34],
      [Math.PI / 5, 0, 0]
    )
    railing(b, [
      [side * 2.68, -1.9, FLOOR],
      [side * 2.68, -0.2, FLOOR],
      [side * 2.68, 1.1, FLOOR],
    ])
  }
  for (let i = 0; i < 5; i++) {
    b.box([0.7, 0.2, 0.04], [-1.6 + i * 0.8, 2.12, FLOOR + 0.035], b.light)
    b.box([0.15, 0.5, 0.04], [-1.6 + i * 0.8, -1.9, FLOOR + 0.035], b.metal)
  }
}

function trophy(b: SetBuilder, x: number, y: number, z: number, size = 1) {
  b.box([0.38 * size, 0.34 * size, 0.12 * size], [x, y, z], b.dark)
  const profile: [number, number][] = [
    [0, 0],
    [0.16, 0],
    [0.16, 0.04],
    [0.06, 0.08],
    [0.035, 0.22],
    [0.15, 0.32],
    [0.2, 0.48],
    [0.19, 0.51],
    [0.165, 0.48],
    [0.12, 0.34],
    [0, 0.29],
  ]
  b.lathe(
    profile.map(([r, h]) => [r * size, h * size]),
    [x, y, z + 0.06 * size],
    b.metal
  )
  for (const side of [-1, 1])
    b.tube(
      [
        [x + side * 0.17 * size, y, z + 0.48 * size],
        [x + side * 0.29 * size, y, z + 0.44 * size],
        [x + side * 0.2 * size, y, z + 0.24 * size],
      ],
      0.02 * size,
      b.metal
    )
}

function club(b: SetBuilder) {
  b.label("champion-gallery-trophy-cabinets-and-lounge")
  rectangularDeck(b, 8.8, 8.4)
  const wood = b.dark
  wood.color.setHex(0x36221a)
  wood.map = surfaceTexture("wood")
  const upholstery = b.low
    ? b.stone
    : new MeshStandardMaterial({
        color: 0x8e6c46,
        roughness: 0.86,
      })
  b.box([8.8, 0.25, 3.1], [0, 3.9, FLOOR + 1.55])
  for (const x of [-4.25, 4.25]) b.box([0.25, 6.2, 3.1], [x, 0.9, FLOOR + 1.55])
  // Central championship medallion, two recessed display cabinets, and timber wainscot.
  b.box([2.2, 0.12, 2.55], [0, 3.7, FLOOR + 1.37], wood)
  b.add(new CylinderGeometry(0.67, 0.67, 0.06, b.segments), b.metal, [
    0,
    3.55,
    FLOOR + 1.75,
  ])
  b.ring(0.68, 0.028, [0, 3.48, FLOOR + 1.75], b.light, [Math.PI / 2, 0, 0])
  trophy(b, 0, 3.25, FLOOR + 0.82, 1.4)
  b.box([0.75, 0.7, 0.75], [0, 3.25, FLOOR + 0.375], wood)
  b.box([0.83, 0.75, 0.07], [0, 3.25, FLOOR + 0.78], b.metal)
  for (const side of [-1, 1]) {
    const x = side * 2.6
    b.box([1.95, 0.55, 2.6], [x, 3.57, FLOOR + 1.32], wood)
    b.box([1.7, 0.025, 2.3], [x, 3.28, FLOOR + 1.38], b.floor)
    for (let row = 0; row < 3; row++) {
      const z = FLOOR + 0.35 + row * 0.77
      b.box([1.78, 0.46, 0.055], [x, 3.1, z], b.metal)
      b.box([1.7, 0.025, 0.018], [x, 2.9, z + 0.05], b.light)
      for (const offset of [-0.45, 0.45])
        trophy(b, x + offset, 3.08, z + 0.09, 0.83)
    }
    b.box([0.045, 6, 1.1], [side * 4.09, 0.9, FLOOR + 0.55], wood)
    b.box([0.11, 6, 0.06], [side * 4.04, 0.9, FLOOR + 1.12], b.metal)
    for (let i = 0; i < 12; i++)
      b.box([0.07, 0.1, 1.1], [side * 4.08, -1.7 + i * 0.4, FLOOR + 0.55], wood)
    b.box([0.72, 2, 0.32], [side * 3.25, -0.6, FLOOR + 0.34], wood)
    for (let seat = 0; seat < 3; seat++) {
      b.box(
        [0.65, 0.61, 0.15],
        [side * 3.22, -1.24 + seat * 0.64, FLOOR + 0.55],
        upholstery
      )
      b.box(
        [0.12, 0.61, 0.48],
        [side * 3.46, -1.24 + seat * 0.64, FLOOR + 0.85],
        upholstery
      )
    }
    b.box([0.14, 2, 0.8], [side * 3.58, -0.6, FLOOR + 0.75], wood)
    for (const y of [-1.6, 0.4])
      b.box([0.75, 0.13, 0.28], [side * 3.22, y, FLOOR + 0.72], upholstery)
    b.cylinder(0.31, 0.05, [side * 3.2, -2.1, FLOOR + 0.61], b.metal)
    b.cylinder(0.045, 0.6, [side * 3.2, -2.1, FLOOR + 0.3], b.metal)
  }
  // Coherent cornice and picture lights, kept off the playable centre.
  b.box([8.5, 0.24, 0.15], [0, 3.65, FLOOR + 2.95], wood)
  for (const x of [-2.6, 0, 2.6])
    b.box([0.8, 0.22, 0.05], [x, 3.25, FLOOR + 2.83], b.light)
}

function mountains(b: SetBuilder, material: Material) {
  const terrain = new PlaneGeometry(34, 16, b.low ? 30 : 90, b.low ? 14 : 40)
  const vertices = terrain.getAttribute("position")
  for (let i = 0; i < vertices.count; i++) {
    const x = vertices.getX(i),
      y = vertices.getY(i) + 12
    let height = 0
    for (let peak = 0; peak < 9; peak++) {
      const px = -15 + peak * 3.8,
        py = 9 + Math.sin(peak * 2.3) * 2.1
      height = Math.max(
        height,
        2.1 +
          Math.sin(peak * 1.7) * 0.8 -
          Math.hypot(x - px, (y - py) * 0.85) * 0.74
      )
    }
    height +=
      (Math.sin(x * 4.1 + y * 2.3) + Math.sin(x * 7.7 - y * 3.1)) * 0.055
    vertices.setZ(i, height)
  }
  terrain.computeVertexNormals()
  b.add(terrain, material, [0, 12, FLOOR - 0.03])
}

function aurora(b: SetBuilder) {
  b.label("aurora-glacial-courtyard-carved-ice-arches")
  b.floor.map = null
  b.floor.roughness = 0.3
  b.box([34, 28, 0.12], [0, 8, FLOOR - 0.13], b.stone)
  b.cylinder(3.65, 0.22, [0, 0, FLOOR - 0.11], b.floor)
  mountains(b, b.stone)
  const ice = b.low
    ? b.stone
    : new MeshPhysicalMaterial({
        color: 0xb8e7f1,
        roughness: 0.14,
        metalness: 0.05,
        transmission: 0.15,
        thickness: 0.3,
        ior: 1.31,
        clearcoat: 0.6,
      })
  // Arches are continuous carved ice, rooted in snow banks, not upright cones.
  for (let i = 0; i < 4; i++) {
    const y = 2.5 + i * 0.75
    const width = 3.3 - i * 0.16
    b.tube(
      [
        [-width, y, FLOOR],
        [-width * 0.96, y, 1.2],
        [-width * 0.62, y, 2.8],
        [0, y, 3.3],
        [width * 0.62, y, 2.8],
        [width * 0.96, y, 1.2],
        [width, y, FLOOR],
      ],
      0.15 - i * 0.017,
      ice
    )
  }
  for (const side of [-1, 1]) {
    for (let i = 0; i < 7; i++) {
      b.add(
        new IcosahedronGeometry(0.6, 0),
        b.stone,
        [side * (3.15 + (i % 2) * 0.2), -2.3 + i * 0.68, FLOOR - 0.08],
        [0, 0, i],
        [1, 0.8, 0.35]
      )
    }
    b.tube(
      [
        [side * 2.9, -2, FLOOR + 0.02],
        [side * 3.1, 0, FLOOR + 0.04],
        [side * 2.8, 2.4, FLOOR + 0.03],
      ],
      0.015,
      b.light
    )
  }
}

function templeColumn(b: SetBuilder, x: number, y: number) {
  b.box([0.52, 0.52, 0.15], [x, y, FLOOR + 0.075])
  b.lathe(
    [
      [0, 0],
      [0.24, 0],
      [0.24, 0.12],
      [0.17, 0.22],
      [0.145, 2.05],
      [0.24, 2.1],
      [0.24, 2.23],
      [0, 2.23],
    ],
    [x, y, FLOOR + 0.15],
    b.stone
  )
  for (let i = 0; i < (b.low ? 0 : 10); i++) {
    const a = (i / 10) * TAU
    b.cylinder(
      0.012,
      1.8,
      [x + Math.cos(a) * 0.151, y + Math.sin(a) * 0.151, FLOOR + 1.28],
      b.metal
    )
  }
}

function temple(b: SetBuilder) {
  b.label("sky-temple-colonnade-pediment-and-floating-foundation")
  for (let i = 0; i < 3; i++)
    b.box(
      [8.4 - i * 0.35, 7.8 - i * 0.35, 0.16],
      [0, 0, FLOOR - 0.38 + i * 0.15]
    )
  b.add(
    new IcosahedronGeometry(1, 1),
    b.floor,
    [0, 0, FLOOR - 1.3],
    [0, 0, 0.2],
    [3.8, 3.4, 1.1]
  )
  for (const x of [-3.25, 3.25]) {
    for (const y of [-1.9, 0, 1.9, 3]) templeColumn(b, x, y)
    b.box([0.6, 5.7, 0.26], [x, 0.55, FLOOR + 2.56])
    b.box([0.62, 5.74, 0.045], [x, 0.55, FLOOR + 2.72], b.metal)
  }
  for (const x of [-1.1, 1.1]) templeColumn(b, x, 3)
  b.box([7.05, 0.7, 0.3], [0, 3, FLOOR + 2.56])
  // Triangular pediment built as a prism across the rear colonnade.
  const pediment = new BufferGeometry()
  pediment.setAttribute(
    "position",
    new Float32BufferAttribute(
      [
        -3.6, 2.6, 2.1, 3.6, 2.6, 2.1, 0, 2.6, 3.15, -3.6, 2.9, 2.1, 0, 2.9,
        3.15, 3.6, 2.9, 2.1,
      ],
      3
    )
  )
  pediment.computeVertexNormals()
  b.add(pediment, b.stone)
  b.tube(
    [
      [-3.6, 2.55, 2.1],
      [0, 2.55, 3.15],
      [3.6, 2.55, 2.1],
    ],
    0.055,
    b.metal
  )
  b.cylinder(0.6, 0.18, [0, 2.1, FLOOR + 0.09], b.metal)
  for (let i = 0; i < 5; i++) {
    const x = -7 + i * 3.6,
      y = 9 + (i % 2) * 2,
      z = -1.2 - (i % 3) * 0.3
    b.cylinder(1.4, 0.16, [x, y, z], b.stone)
    b.cylinder(0, 1.9, [x, y, z - 1.02], b.floor, 1.4)
    b.cylinder(0.13, 1.1, [x - 0.7, y, z + 0.63], b.stone)
    b.cylinder(0.13, 1.1, [x + 0.7, y, z + 0.63], b.stone)
    b.box([1.8, 0.32, 0.16], [x, y, z + 1.24], b.stone)
  }
}

function fish(b: SetBuilder, x: number, y: number, z: number, size: number) {
  b.ball(size, [x, y, z], b.light, [1, 0.23, 0.45])
  b.add(
    new CylinderGeometry(0, size * 0.5, size * 0.65, 3),
    b.light,
    [x - size, y, z],
    [0, 0, -Math.PI / 2],
    [1, 0.3, 1]
  )
}

function abyss(b: SetBuilder) {
  b.label("abyss-glass-vault-coral-and-fish")
  b.cylinder(3.2, 0.45, [0, 0, FLOOR - 0.225], b.stone)
  b.cylinder(3.02, 0.045, [0, 0, FLOOR], b.floor)
  b.ring(3.04, 0.045, [0, 0, FLOOR + 0.03], b.metal)
  // Pressure ribs form a recognisable glazed palace vault; the clear viewing
  // bays stay open in front of the table so they cannot mask a ball or cue.
  for (let i = 0; i < 7; i++) {
    const a = (i / 6) * Math.PI
    const x = Math.cos(a) * 3.1,
      y = Math.sin(a) * 3.1
    b.tube(
      [
        [x, y, FLOOR],
        [x * 1.06, y * 1.06, 1.2],
        [x * 0.95, y * 0.95, 2.2],
        [x * 0.72, y * 0.72, 2.9],
      ],
      0.055,
      b.stone
    )
  }
  b.tube(
    Array.from({ length: 17 }, (_, i): Point => {
      const a = (i / 16) * Math.PI
      return [Math.cos(a) * 3.1 * 0.72, Math.sin(a) * 3.1 * 0.72, 2.9]
    }),
    0.065,
    b.stone
  )
  railing(
    b,
    Array.from({ length: 9 }, (_, i): Point => [
      Math.cos((i / 8) * Math.PI) * 3.1,
      Math.sin((i / 8) * Math.PI) * 3.1,
      FLOOR,
    ])
  )
  b.box([22, 20, 0.2], [0, 3, -1.65], b.dark)
  for (const side of [-1, 1]) {
    for (let i = 0; i < 7; i++) {
      const x = side * (3.6 + (i % 3) * 0.5),
        y = -1.2 + i * 0.9
      const h = 0.75 + (i % 3) * 0.35
      b.tube(
        [
          [x, y, -1.5],
          [x + 0.15, y, -0.9],
          [x - 0.16, y + 0.1, -1.5 + h],
        ],
        0.045,
        b.metal
      )
      b.tube(
        [
          [x, y, -1.1],
          [x + 0.3, y + 0.1, -0.8],
          [x + 0.42, y + 0.1, -0.68],
        ],
        0.027,
        b.metal
      )
      b.add(
        new IcosahedronGeometry(0.55, 0),
        b.floor,
        [x, y, -1.45],
        [0, 0, i],
        [1, 0.7, 0.5]
      )
    }
  }
  for (let i = 0; i < (b.low ? 8 : 22); i++)
    fish(
      b,
      -3.8 + (i % 7) * 1.2,
      4.8 + Math.sin(i) * 0.8,
      0.2 + (i % 4) * 0.5,
      0.09 + (i % 3) * 0.025
    )
  if (!b.low) {
    const glass = new MeshPhysicalMaterial({
      color: 0x3eabb7,
      transparent: true,
      opacity: 0.12,
      roughness: 0.1,
      metalness: 0.15,
      side: DoubleSide,
      depthWrite: false,
    })
    const glazing = new LatheGeometry(
      [
        new Vector2(3.1, FLOOR),
        new Vector2(3.1 * 1.06, 1.2),
        new Vector2(3.1 * 0.95, 2.2),
        new Vector2(3.1 * 0.72, 2.9),
      ],
      48,
      0,
      Math.PI
    )
    glazing.rotateX(Math.PI / 2)
    glazing.rotateZ(Math.PI / 2)
    b.add(glazing, glass)
  }
}

function moonTerrain(b: SetBuilder) {
  const terrain = new PlaneGeometry(28, 22, b.low ? 32 : 100, b.low ? 24 : 80)
  const vertices = terrain.getAttribute("position")
  const craters = Array.from({ length: 14 }, (_, i) => {
    const a = (i / 14) * TAU,
      distance = 4.1 + (i % 3) * 1.6
    return {
      x: Math.cos(a) * distance,
      y: Math.sin(a) * distance + 1.5,
      radius: 0.5 + (i % 4) * 0.3,
    }
  })
  for (let i = 0; i < vertices.count; i++) {
    const x = vertices.getX(i),
      y = vertices.getY(i)
    let height =
      Math.sin(x * 3.4 + y * 2.7) * 0.025 + Math.sin(x * 8.3 - y * 7.1) * 0.013
    for (const crater of craters) {
      const d = Math.hypot(x - crater.x, y - crater.y) / crater.radius
      height +=
        -0.22 * Math.exp(-d * d * 3) +
        0.18 * Math.exp(-Math.pow((d - 0.9) * 5, 2))
    }
    vertices.setZ(i, height)
  }
  terrain.computeVertexNormals()
  b.add(terrain, b.floor, [0, 0, -0.87])
}

function lunar(b: SetBuilder) {
  b.label("lunar-crater-field-radio-telescope-and-solar-array")
  moonTerrain(b)
  rectangularDeck(b, 5.5, 4.5, b.dark)
  b.box([5.3, 4.3, 0.045], [0, 0, FLOOR], b.stone)
  // Parabolic receiver, feed mast and four-legged azimuth pedestal.
  const tx = -2.95,
    ty = 2.65
  b.cylinder(0.22, 1.15, [tx, ty, -0.25], b.stone)
  for (const dx of [-0.45, 0.45])
    for (const dy of [-0.45, 0.45])
      b.tube(
        [
          [tx + dx, ty + dy, -0.82],
          [tx, ty, 0.2],
        ],
        0.045,
        b.dark
      )
  const dishSegments = b.low ? 5 : 12
  const dishProfile: [number, number][] = Array.from(
    { length: dishSegments },
    (_, i) => {
      const r = (i / (dishSegments - 1)) * 0.95
      return [r, r * r * 0.42]
    }
  )
  b.lathe(dishProfile.reverse(), [tx, ty, 0.45], b.stone)
  b.tube(
    [
      [tx - 0.7, ty, 0.7],
      [tx, ty, 1.2],
      [tx + 0.7, ty, 0.7],
    ],
    0.026,
    b.metal
  )
  b.ball(0.07, [tx, ty, 1.2], b.dark)
  for (let row = 0; row < 2; row++) {
    const x = 3.05,
      y = 1.9 + row * 1.5
    b.cylinder(0.04, 0.8, [x, y, -0.4], b.stone)
    b.box([1.8, 1.05, 0.06], [x, y, 0.02], b.dark, [0.25, 0, 0])
    for (let col = 0; col < 6; col++)
      b.box(
        [0.014, 1.01, 0.015],
        [x - 0.8 + col * 0.32, y, 0.06],
        b.light,
        [0.25, 0, 0]
      )
  }
  b.box([1.1, 2, 0.1], [0, -3.1, -0.78], b.stone, [-0.14, 0, 0])
  for (const side of [-1, 1])
    railing(b, [
      [side * 2.65, -1.8, FLOOR],
      [side * 2.65, 0, FLOOR],
      [side * 2.65, 1.8, FLOOR],
    ])
}

/** Secondary structure gives the landmarks scale: joints, cornices, ribs and
 * distant wings share the existing surface batches, keeping draw calls fixed. */
function spectraDetails(b: SetBuilder) {
  const detail = b.low ? 3 : 7

  for (const side of [-1, 1]) {
    for (let i = 0; i < detail; i++) {
      const y = -1.7 + (i * 5) / (detail - 1)
      b.box([0.16, 0.16, 3.8], [side * 3.8, y, FLOOR + 1.9])
      b.box([0.045, 0.09, 3.45], [side * 3.7, y, FLOOR + 1.9], b.light)
      b.box([0.6, 0.2, 0.11], [side * 3.57, y, FLOOR + 3.8], b.metal)
    }
    b.box([1.1, 5.6, 0.15], [side * 3.35, 0.8, FLOOR + 3.85])
    b.box([0.06, 5.6, 0.04], [side * 2.83, 0.8, FLOOR + 3.76], b.light)
  }
  b.box([8.1, 0.18, 0.45], [0, 3.76, FLOOR + 3.65])
  for (let i = 0; i < detail * 2; i++)
    b.box(
      [0.13, 0.1, 0.75],
      [-3.7 + (i * 7.4) / (detail * 2 - 1), 3.64, FLOOR + 3.0],
      b.metal
    )
}

function clubDetails(b: SetBuilder) {
  const detail = b.low ? 3 : 7

  for (const side of [-1, 1]) {
    // Layered timber cornices and recessed clerestory lights.
    for (let tier = 0; tier < 3; tier++)
      b.box(
        [0.23 + tier * 0.06, 6.15, 0.06],
        [side * (4.05 - tier * 0.035), 0.8, FLOOR + 3 + tier * 0.07],
        tier === 1 ? b.metal : b.dark
      )
    for (let i = 0; i < detail; i++) {
      const y = -1.7 + (i * 5.1) / (detail - 1)
      b.box([0.17, 0.17, 2.8], [side * 4.0, y, FLOOR + 1.4], b.dark)
      b.box([0.2, 0.26, 0.075], [side * 3.97, y, FLOOR + 2.72], b.metal)
      b.box([0.05, 0.07, 0.35], [side * 3.88, y, FLOOR + 1.95], b.light)
    }
  }
  b.box([8.7, 0.28, 0.8], [0, 3.9, FLOOR + 3.52])
  for (const x of [-2.6, 0, 2.6]) {
    b.box([1.85, 0.1, 0.54], [x, 3.71, FLOOR + 3.48], b.dark)
    b.box([1.65, 0.025, 0.37], [x, 3.65, FLOOR + 3.48], b.light)
    for (const offset of [-0.55, 0, 0.55])
      b.box([0.032, 0.045, 0.42], [x + offset, 3.6, FLOOR + 3.48], b.metal)
  }
}

function templeDetails(b: SetBuilder) {
  const detail = b.low ? 3 : 7

  // A second, taller colonnade and frieze make the near court part of a
  // larger sanctuary. Keep the open sky directly above the playing area.
  for (const side of [-1, 1]) {
    for (let i = 0; i < detail; i++) {
      const y = -1 + (i * 7) / (detail - 1)
      b.box([0.7, 0.7, 0.2], [side * 5.3, y, FLOOR + 0.1])
      b.cylinder(0.24, 4.6, [side * 5.3, y, FLOOR + 2.5], b.stone, 0.2)
      b.box([0.67, 0.67, 0.2], [side * 5.3, y, FLOOR + 4.85])
      if (!b.low)
        for (let ring = 0; ring < 3; ring++)
          b.ring(
            0.245 + ring * 0.017,
            0.025,
            [side * 5.3, y, FLOOR + 0.24 + ring * 0.07],
            b.metal
          )
    }
    b.box([0.85, 8.2, 0.3], [side * 5.3, 2.55, FLOOR + 5.12])
    b.box([0.96, 8.3, 0.085], [side * 5.3, 2.55, FLOOR + 5.31], b.metal)
  }
  b.box([11.3, 0.85, 0.4], [0, 6.4, FLOOR + 5.12])
  for (let i = 0; i < detail * 3; i++)
    b.box(
      [0.18, 0.12, 0.26],
      [-5.1 + (i * 10.2) / (detail * 3 - 1), 5.94, FLOOR + 5.1],
      b.metal
    )
}

function galaxyDetails(b: SetBuilder) {
  const detail = b.low ? 3 : 7

  for (let i = 0; i < detail; i++) {
    const a = Math.PI * (0.12 + (i * 0.76) / (detail - 1))
    const x = Math.cos(a) * 3.65,
      y = Math.sin(a) * 3.65
    b.box([0.28, 0.28, 0.12], [x, y, FLOOR + 0.07], b.metal)
    b.tube(
      [
        [x, y, FLOOR + 0.07],
        [x * 0.93, y * 0.93, 2.35],
        [x * 0.8, y * 0.8, 3.15],
      ],
      0.045,
      b.metal
    )
  }
  b.tube(
    Array.from({ length: detail }, (_, i): Point => {
      const a = Math.PI * (0.12 + (i * 0.76) / (detail - 1))
      return [Math.cos(a) * 3.65 * 0.8, Math.sin(a) * 3.65 * 0.8, 3.15]
    }),
    0.07,
    b.metal
  )
  b.ring(2.8, 0.11, [0, 8, 3.5], b.stone, [Math.PI / 2, 0, 0])
  b.ring(2.6, 0.025, [0, 7.97, 3.5], b.light, [Math.PI / 2, 0, 0])
}

function nebulaDetails(b: SetBuilder) {
  const detail = b.low ? 3 : 7

  b.ring(3.1, 0.15, [0, 7.2, 3.4], b.dark, [Math.PI / 2, 0, 0])
  b.ring(2.91, 0.027, [0, 7.18, 3.4], b.light, [Math.PI / 2, 0, 0])
  for (const side of [-1, 1]) {
    for (let i = 0; i < detail; i++) {
      const y = -1.7 + (i * 3.4) / (detail - 1)
      b.box([0.22, 0.18, 0.06], [side * 2.56, y, FLOOR + 0.07], b.metal)
      if (!b.low)
        b.tube(
          [
            [side * 2.68, y, FLOOR],
            [side * 2.9, y + 0.3, FLOOR - 0.6],
            [side * 2.68, y + 0.55, FLOOR],
          ],
          0.025,
          b.stone
        )
    }
    for (let ring = 0; ring < 3; ring++)
      b.ring(
        0.24 + ring * 0.015,
        0.014,
        [side * 3.3, 2.52 + ring * 0.07, FLOOR + 1.22 + ring * 0.05],
        b.metal,
        [Math.PI / 3, 0, 0]
      )
  }
}

function auroraDetails(b: SetBuilder) {
  const detail = b.low ? 3 : 7

  for (const side of [-1, 1]) {
    for (let i = 0; i < detail; i++) {
      const y = 3 + i * 1.1,
        height = 3.5 + Math.sin(i * 2) * 1.2
      b.add(
        new CylinderGeometry(0.05, 0.28, height, 5),
        b.stone,
        [side * (4.2 + i * 0.22), y, FLOOR + height / 2],
        [Math.PI / 2, side * 0.08, 0]
      )
    }
    b.tube(
      [
        [side * 3.6, 2.3, FLOOR],
        [side * 3.8, 3.1, 2],
        [side * 2.7, 4.2, 4.7],
        [0, 4.8, 5.2],
      ],
      0.1,
      b.stone
    )
  }
}

function abyssDetails(b: SetBuilder) {
  const detail = b.low ? 3 : 7

  for (const side of [-1, 1]) {
    b.cylinder(0.38, 4.2, [side * 4.6, 6.4, 0.5], b.stone, 0.26)
    b.cylinder(0.4, 1.4, [side * 4.6, 6.4, 3.3], b.metal, 0)
    for (let i = 0; i < detail; i++) {
      const a = (i / (detail - 1)) * Math.PI * 0.42
      const x = side * Math.cos(a) * 3.2,
        y = Math.sin(a) * 3.2
      b.box([0.2, 0.2, 0.12], [x, y, FLOOR + 0.09], b.metal)
      b.tube(
        [
          [x, y, FLOOR + 0.1],
          [x * 1.02, y * 1.02, 1.6],
          [x * 0.75, y * 0.75, 2.85],
        ],
        0.022,
        b.metal
      )
    }
  }
  b.tube(
    [
      [-4.6, 6.4, 2.5],
      [-2.9, 6.4, 4.1],
      [0, 6.4, 4.6],
      [2.9, 6.4, 4.1],
      [4.6, 6.4, 2.5],
    ],
    0.14,
    b.stone
  )
}

function lunarDetails(b: SetBuilder) {
  const detail = b.low ? 3 : 7

  b.cylinder(1.8, 0.65, [0, 7.5, FLOOR + 0.3], b.dark)
  b.add(
    new SphereGeometry(
      1.75,
      b.segments,
      b.low ? 6 : 16,
      0,
      TAU,
      0,
      Math.PI / 2
    ),
    b.stone,
    [0, 7.5, FLOOR + 0.63],
    [Math.PI / 2, 0, 0]
  )
  b.ring(1.78, 0.06, [0, 7.5, FLOOR + 0.65], b.metal)
  for (let i = 0; i < detail; i++) {
    const x = -1.4 + (i * 2.8) / (detail - 1)
    b.box([0.12, 0.04, 0.25], [x, 5.84, FLOOR + 0.32], b.light)
  }
  if (!b.low)
    for (const side of [-1, 1])
      b.tube(
        [
          [side * 2.6, 1.7, FLOOR - 0.2],
          [side * 3.4, 3.7, FLOOR - 0.25],
          [side * 1.4, 6.5, FLOOR - 0.2],
        ],
        0.065,
        b.dark
      )
}

function architecturalDetails(b: SetBuilder) {
  b.label(`${b.style.id}-crafted-structure`)
  const build = {
    spectra: spectraDetails,
    club: clubDetails,
    "sky-temple": templeDetails,
    galaxy: galaxyDetails,
    nebula: nebulaDetails,
    "aurora-hall": auroraDetails,
    "abyss-palace": abyssDetails,
    "lunar-observatory": lunarDetails,
  }[b.style.id]
  build(b)
}

export function createArchitecture(
  style: EnvironmentStyle,
  quality: RenderQualityProfile
) {
  const builder = new SetBuilder(style, quality)
  const build = {
    spectra,
    galaxy,
    nebula,
    club,
    "aurora-hall": aurora,
    "sky-temple": temple,
    "abyss-palace": abyss,
    "lunar-observatory": lunar,
  }[style.id]
  build(builder)
  architecturalDetails(builder)
  return builder.finish()
}
