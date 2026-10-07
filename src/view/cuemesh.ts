import { R } from "../model/physics/constants"
import { up } from "../utils/three-utils"
import {
  BufferAttribute,
  BufferGeometry,
  BoxGeometry,
  Matrix4,
  Mesh,
  CylinderGeometry,
  MeshPhongMaterial,
  Vector3,
  ShaderMaterial,
  Group,
  PlaneGeometry,
  MeshBasicMaterial,
  ConeGeometry,
  Color,
  MeshPhysicalMaterial,
  Object3D,
  Shape,
  ShapeGeometry,
  TorusGeometry,
  DataTexture,
  LinearMipmapLinearFilter,
  NoColorSpace,
  RGBAFormat,
  RepeatWrapping,
  SphereGeometry,
  UnsignedByteType,
} from "three"
import { CueStyle, cueStyleById } from "./cuestyle"
import { getRenderQuality } from "./renderquality"
import {
  disposeRefinedArt,
  hasRefinedArt,
  preloadRefinedArt,
  refinedArt,
  refinedArtEntry,
} from "./refinedart"

function mergeCueGeometries(geometries: BufferGeometry[]): BufferGeometry {
  const expanded = geometries.map((geometry) =>
    geometry.index ? geometry.toNonIndexed() : geometry.clone()
  )
  const merged = new BufferGeometry()
  for (const name of ["position", "normal", "uv"] as const) {
    const attributes = expanded
      .map((geometry) => geometry.getAttribute(name))
      .filter((attribute): attribute is BufferAttribute => Boolean(attribute))
    if (attributes.length !== expanded.length) continue
    const itemSize = attributes[0].itemSize
    const values = new Float32Array(
      attributes.reduce((total, attribute) => total + attribute.array.length, 0)
    )
    let offset = 0
    attributes.forEach((attribute) => {
      values.set(attribute.array as Float32Array, offset)
      offset += attribute.array.length
    })
    merged.setAttribute(name, new BufferAttribute(values, itemSize))
  }
  expanded.forEach((geometry) => geometry.dispose())
  merged.computeBoundingSphere()
  return merged
}

function cueRadialSegments(): number {
  const quality = getRenderQuality().name
  if (quality === "high") return 32
  if (quality === "balanced") return 24
  return 16
}

export type CueMeshes = {
  mesh: Group
  tiltMesh: Group
  cueBody: Group
}

export class CueMesh {
  static mesh: Mesh
  static readonly baseTilt = 0.17

  static readonly placermaterial = new MeshPhongMaterial({
    color: 0xffffff,
    wireframe: false,
    flatShading: false,
    transparent: false,
  })

  static indicateValid(valid) {
    CueMesh.placermaterial.color.setHex(valid ? 0xccffcc : 0xff0000)
  }

  private static readonly helpermaterial = new ShaderMaterial({
    uniforms: {
      lightDirection: { value: new Vector3(0, 0, 1) },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vNormal;  
      void main() {
        vNormal = normal;
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      varying vec3 vNormal;
      uniform vec3 lightDirection;
      void main() {
        float intensity = dot(vNormal, lightDirection);
        vec3 color = vec3(1.0, 1.0, 1.0);
        vec3 finalColor = color * intensity;
        gl_FragColor = vec4(finalColor, 0.075 * (1.0-vUv.y));
      }
    `,
    wireframe: false,
    transparent: true,
  })

  static createHelper() {
    const geometry = new CylinderGeometry(R, R, (R * 30) / 0.5, 12, 1, true)
    const mesh = new Mesh(geometry, this.helpermaterial)
    mesh.geometry
      .applyMatrix4(new Matrix4().identity().makeRotationAxis(up, -Math.PI / 2))
      .applyMatrix4(
        new Matrix4()
          .identity()
          .makeTranslation((R * 15) / 0.5, 0, (-R * 0.01) / 0.5)
      )
    mesh.visible = false
    mesh.renderOrder = -1
    mesh.material.depthTest = false
    return mesh
  }

  static createPlacer() {
    const group = new Group()
    const pyramidGeo = new ConeGeometry(0.75 * R, 1.6 * R, 4)
    const n = 4
    for (let i = 0; i < n; i++) {
      const pyramid = new Mesh(pyramidGeo, CueMesh.placermaterial)
      const angle = (i * 2 * Math.PI) / n

      // Distribute around the ball
      pyramid.position.x = Math.cos(angle) * 2 * R
      pyramid.position.y = Math.sin(angle) * 2 * R
      pyramid.position.z = 1 * R // Hover height

      // Point toward the center
      pyramid.lookAt(0, 0, R)
      // Adjust rotation because ConeGeometry points up its Y axis
      pyramid.rotateX(Math.PI / 2)

      group.add(pyramid)
    }
    group.visible = false
    return group
  }

  static createShadow(length: number) {
    const geometry = new PlaneGeometry(length, R * 0.4)
    geometry.applyMatrix4(
      new Matrix4().identity().makeTranslation(-length / 2 - R, 0, 0)
    )
    const material = new MeshBasicMaterial({
      color: 0x000000,
      opacity: 0.25,
      transparent: true,
      depthWrite: false,
    })
    const mesh = new Mesh(geometry, material)
    mesh.visible = true
    return mesh
  }

  private static readonly styleMaterials = new Map<
    string,
    Record<string, MeshPhysicalMaterial>
  >()
  private static readonly patternTextures = new Map<
    string,
    { color: DataTexture; roughness: DataTexture; bump: DataTexture }
  >()
  private static readonly customRefinedMaps = new WeakMap<
    MeshPhysicalMaterial,
    Pick<MeshPhysicalMaterial, "map" | "bumpMap" | "roughnessMap">
  >()

  static createCue(tip, but, length, styleId?: string): CueMeshes {
    const cueBody = this.cueGeometry(tip, but, length)
    this.applyStyle(cueBody, styleId)
    const tiltGroup = new Group()
    const mesh = new Group()

    cueBody.applyMatrix4(
      new Matrix4().identity().makeRotationAxis(up, -Math.PI / 2)
    )
    cueBody.position.set(-length / 2 - R, 0, R * 0.12)
    tiltGroup.rotation.y = this.baseTilt
    tiltGroup.add(cueBody)
    mesh.add(tiltGroup)
    return { mesh, tiltMesh: tiltGroup, cueBody }
  }

  static cueGeometry(
    tipRadius,
    buttRadius,
    length,
    segments = cueRadialSegments()
  ) {
    const group = new Group()
    group.userData.cueDimensions = { tipRadius, buttRadius, length }
    const placeholder = new MeshPhysicalMaterial()
    const addPart = (mesh: Mesh, role: string, positionY: number): Mesh => {
      mesh.position.y = positionY
      mesh.userData.cueRole = role
      mesh.castShadow = true
      mesh.receiveShadow = true
      group.add(mesh)
      return mesh
    }

    const buttLength = length * 0.28
    const shaftLength = length * 0.71
    const ferruleLength = length * 0.007
    const capLength = length * 0.012
    const sleeveLength = length * 0.055
    const wrapLength = length * 0.085
    const forearmLength = buttLength - capLength - sleeveLength - wrapLength
    let cursor = -length / 2

    const addSection = (
      role: string,
      bottomRadius: number,
      topRadius: number,
      sectionLength: number
    ) => {
      const mesh = new Mesh(
        new CylinderGeometry(topRadius, bottomRadius, sectionLength, segments),
        placeholder
      )
      addPart(mesh, role, cursor + sectionLength / 2)
      cursor += sectionLength
      return mesh
    }

    addSection("buttCap", buttRadius, buttRadius, capLength)
    addSection("sleeve", buttRadius, buttRadius * 0.985, sleeveLength)
    addSection("wrap", buttRadius * 0.985, buttRadius * 0.94, wrapLength)
    const forearm = addSection(
      "forearm",
      buttRadius * 0.94,
      buttRadius * 0.9,
      forearmLength
    )

    const ringPositions = [
      -length / 2 + capLength,
      -length / 2 + capLength + sleeveLength,
      -length / 2 + capLength + sleeveLength + wrapLength * 0.08,
      -length / 2 + capLength + sleeveLength + wrapLength * 0.92,
      -length / 2 + capLength + sleeveLength + wrapLength,
      -length / 2 + buttLength,
    ]
    ;([3, 4, 6] as const).forEach((ringCount) => {
      const rings = ringPositions
        .slice(0, ringCount)
        .map((positionY, index) => {
          const radius = buttRadius * (index === 3 ? 0.91 : 1.005)
          const geometry = new CylinderGeometry(
            radius,
            radius,
            length * 0.004,
            segments
          )
          geometry.translate(0, positionY, 0)
          return geometry
        })
      const merged = mergeCueGeometries(rings)
      rings.forEach((geometry) => geometry.dispose())
      const mesh = new Mesh(merged, placeholder)
      mesh.userData.cueRingCount = ringCount
      mesh.userData.cueEnergyRing = true
      mesh.userData.cueRole = "energy"
      group.add(mesh)
    })

    const shaftGeom = new CylinderGeometry(
      tipRadius,
      buttRadius * 0.9,
      shaftLength,
      segments
    )
    const shaft = new Mesh(shaftGeom, placeholder)
    addPart(shaft, "shaft", cursor + shaftLength / 2)
    cursor += shaftLength

    const diamondGeometry = (width: number, height: number) => {
      const shape = new Shape()
      shape.moveTo(0, height / 2)
      shape.lineTo(width / 2, 0)
      shape.lineTo(0, -height / 2)
      shape.lineTo(-width / 2, 0)
      shape.closePath()
      return new ShapeGeometry(shape)
    }
    const spearGeometry = (width: number, height: number) => {
      const shape = new Shape()
      shape.moveTo(0, height / 2)
      shape.lineTo(width / 2, -height * 0.12)
      shape.lineTo(width * 0.22, -height / 2)
      shape.lineTo(-width * 0.22, -height / 2)
      shape.lineTo(-width / 2, -height * 0.12)
      shape.closePath()
      return new ShapeGeometry(shape)
    }
    const chevronGeometry = (width: number, height: number) => {
      const shape = new Shape()
      shape.moveTo(-width / 2, height * 0.08)
      shape.lineTo(0, height / 2)
      shape.lineTo(width / 2, height * 0.08)
      shape.lineTo(width * 0.22, -height / 2)
      shape.lineTo(0, -height * 0.13)
      shape.lineTo(-width * 0.22, -height / 2)
      shape.closePath()
      return new ShapeGeometry(shape)
    }
    type InlaySpec = {
      geometry: ShapeGeometry
      positionY: number
      role: "accent" | "inlayLight"
    }
    const forearmStart = forearm.position.y - forearmLength / 2
    const radiusAt = (positionY: number) => {
      const t = Math.max(
        0,
        Math.min(1, (positionY - forearmStart) / forearmLength)
      )
      return buttRadius * (0.941 - t * 0.041) + length * 0.00018
    }
    const addSurfaceInlays = (
      pattern: CueStyle["inlayPattern"],
      specs: InlaySpec[]
    ) => {
      ;(["accent", "inlayLight"] as const).forEach((role) => {
        const geometries: ShapeGeometry[] = []
        specs
          .filter((spec) => spec.role === role)
          .forEach((spec) => {
            for (let i = 0; i < 4; i++) {
              const angle = (i * Math.PI) / 2
              const geometry = spec.geometry.clone()
              const transform = new Matrix4().makeRotationY(angle)
              transform.setPosition(
                Math.sin(angle) * radiusAt(spec.positionY),
                spec.positionY,
                Math.cos(angle) * radiusAt(spec.positionY)
              )
              geometry.applyMatrix4(transform)
              geometries.push(geometry)
            }
          })
        if (!geometries.length) return
        const merged = mergeCueGeometries(geometries)
        geometries.forEach((geometry) => geometry.dispose())
        const inlays = new Mesh(merged, placeholder)
        inlays.userData.cueRole = role
        inlays.userData.cuePattern = pattern
        group.add(inlays)
      })
      specs.forEach((spec) => spec.geometry.dispose())
    }

    addSurfaceInlays("spear", [
      {
        geometry: spearGeometry(buttRadius * 0.42, forearmLength * 0.68),
        positionY: forearm.position.y - forearmLength * 0.04,
        role: "accent",
      },
      {
        geometry: diamondGeometry(buttRadius * 0.32, forearmLength * 0.12),
        positionY: forearm.position.y - forearmLength * 0.37,
        role: "inlayLight",
      },
    ])
    addSurfaceInlays(
      "diamond",
      [-0.27, 0, 0.27].map((offset, index) => ({
        geometry: diamondGeometry(
          buttRadius * (index === 1 ? 0.48 : 0.34),
          forearmLength * 0.16
        ),
        positionY: forearm.position.y + forearmLength * offset,
        role: index === 1 ? "accent" : "inlayLight",
      }))
    )
    addSurfaceInlays("chevron", [
      {
        geometry: chevronGeometry(buttRadius * 0.58, forearmLength * 0.52),
        positionY: forearm.position.y - forearmLength * 0.02,
        role: "accent",
      },
      {
        geometry: diamondGeometry(buttRadius * 0.25, forearmLength * 0.1),
        positionY: forearm.position.y - forearmLength * 0.34,
        role: "inlayLight",
      },
    ])
    addSurfaceInlays("feather", [
      {
        geometry: spearGeometry(buttRadius * 0.3, forearmLength * 0.58),
        positionY: forearm.position.y - forearmLength * 0.03,
        role: "accent",
      },
      ...[-0.31, -0.18, 0.18, 0.31].map((offset) => ({
        geometry: diamondGeometry(buttRadius * 0.23, forearmLength * 0.095),
        positionY: forearm.position.y + forearmLength * offset,
        role: "inlayLight" as const,
      })),
    ])
    addSurfaceInlays(
      "constellation",
      [-0.32, -0.1, 0.13, 0.34].map((offset, index) => ({
        geometry: diamondGeometry(
          buttRadius * (index % 2 === 0 ? 0.18 : 0.27),
          forearmLength * (index % 2 === 0 ? 0.07 : 0.1)
        ),
        positionY: forearm.position.y + forearmLength * offset,
        role: index % 2 === 0 ? "inlayLight" : "accent",
      }))
    )
    addSurfaceInlays(
      "wave",
      [-0.25, 0, 0.25].map((offset, index) => ({
        geometry: chevronGeometry(
          buttRadius * (0.3 + index * 0.08),
          forearmLength * 0.16
        ),
        positionY: forearm.position.y + forearmLength * offset,
        role: index === 1 ? "inlayLight" : "accent",
      }))
    )
    addSurfaceInlays(
      "tiger",
      [-0.24, 0.02, 0.27].map((offset, index) => ({
        geometry: spearGeometry(
          buttRadius * (0.24 + index * 0.06),
          forearmLength * 0.2
        ),
        positionY: forearm.position.y + forearmLength * offset,
        role: index === 1 ? "inlayLight" : "accent",
      }))
    )
    addSurfaceInlays(
      "prism",
      [-0.28, 0, 0.28].map((offset, index) => ({
        geometry: diamondGeometry(
          buttRadius * (index === 1 ? 0.58 : 0.32),
          forearmLength * (index === 1 ? 0.24 : 0.13)
        ),
        positionY: forearm.position.y + forearmLength * offset,
        role: index === 1 ? "accent" : "inlayLight",
      }))
    )
    addSurfaceInlays("laser", [
      {
        geometry: spearGeometry(buttRadius * 0.26, forearmLength * 0.7),
        positionY: forearm.position.y,
        role: "accent",
      },
      ...[-0.34, -0.18, 0.18, 0.34].map((offset) => ({
        geometry: diamondGeometry(buttRadius * 0.2, forearmLength * 0.065),
        positionY: forearm.position.y + forearmLength * offset,
        role: "inlayLight" as const,
      })),
    ])

    const wrapCenter = -length / 2 + capLength + sleeveLength + wrapLength / 2
    const wrapThreads: TorusGeometry[] = []
    for (let i = -6; i <= 6; i++) {
      const wrapProgress = (i + 6) / 12
      const wrapRadius =
        buttRadius * (0.985 - wrapProgress * 0.045) + length * 0.0003
      const thread = new TorusGeometry(
        wrapRadius,
        length * 0.00048,
        4,
        segments
      )
      thread.rotateX(Math.PI / 2)
      thread.translate(0, wrapCenter + (i * wrapLength) / 13, 0)
      wrapThreads.push(thread)
    }
    const mergedWrap = mergeCueGeometries(wrapThreads)
    wrapThreads.forEach((geometry) => geometry.dispose())
    const wrapThreadMesh = new Mesh(mergedWrap, placeholder)
    wrapThreadMesh.userData.cueRole = "wrapThread"
    group.add(wrapThreadMesh)

    const ferruleGeom = new CylinderGeometry(
      tipRadius,
      tipRadius,
      ferruleLength,
      segments
    )
    const ferrule = new Mesh(ferruleGeom, placeholder)
    addPart(ferrule, "ferrule", cursor + ferruleLength / 2)
    cursor += ferruleLength

    const ferruleSeam = new Mesh(
      new CylinderGeometry(
        tipRadius * 1.015,
        tipRadius * 1.015,
        length * 0.0015,
        segments
      ),
      placeholder
    )
    addPart(ferruleSeam, "inlayLight", cursor - ferruleLength)

    const tipHeight = 0.0055
    const tipTopRadius = tipRadius * 0.93
    const tipGeom = new CylinderGeometry(
      tipTopRadius,
      tipRadius,
      tipHeight,
      segments
    )
    const tip = new Mesh(tipGeom, placeholder)
    tip.position.y = cursor + tipHeight / 2
    tip.name = "cueTip"
    tip.userData.cueRole = "tip"
    group.add(tip)

    const tipDome = new Mesh(
      new SphereGeometry(
        tipTopRadius,
        segments,
        8,
        0,
        Math.PI * 2,
        0,
        Math.PI / 2
      ),
      placeholder
    )
    tipDome.position.y = cursor + tipHeight
    tipDome.scale.y = 0.35
    tipDome.userData.cueRole = "tip"
    tipDome.name = "cueTipDome"
    group.add(tipDome)

    return group
  }

  private static prepareRefinedCue(
    cueBody: Object3D,
    style: CueStyle
  ): boolean {
    cueBody.userData.requestedCueStyle = style.id
    if (cueBody.userData.refinedCueStyle !== style.id) {
      const art = refinedArt(`cue-${style.id}`)
      if (art) {
        const { length, tipRadius } = cueBody.userData.cueDimensions
        const sourceLength = refinedArtEntry(`cue-${style.id}`)?.length
        if (sourceLength) {
          const radiusScale = tipRadius / (0.03275 * 0.14)
          // Shaft length follows the configured table; its radial dimensions
          // follow ball radius, exactly as the original constructor does.
          const scale = new Group()
          scale.scale.set(radiusScale, length / sourceLength, radiusScale)
          scale.add(art)
          if (cueBody.userData.refinedCueStyle)
            cueBody.children.forEach(disposeRefinedArt)
          cueBody.clear()
          cueBody.add(scale)
          cueBody.userData.refinedCueStyle = style.id
          cueBody.userData.artRevision = (cueBody.userData.artRevision ?? 0) + 1
        } else disposeRefinedArt(art)
      } else {
        this.requestRefinedCue(cueBody, style)
      }
    }
    if (cueBody.userData.refinedCueStyle === style.id) {
      // Blender's wood/carbon textures and PBR finish are authoritative.
      // A custom cue changes tint while retaining those authored surfaces.
      if (style.id === "custom") {
        this.tintRefinedCue(cueBody, style)
      }
      cueBody.userData.cueStyleId = style.id
      delete cueBody.userData.energyRatio
      this.setEnergy(cueBody, 0)
      return true
    }
    return false
  }

  private static requestRefinedCue(cueBody: Object3D, style: CueStyle) {
    // Style changes may request an asset outside the initial preload.
    // Keep the same animated body/pivot, replacing only its visual parts.
    cueBody.userData.requestedCueStyle = style.id
    void preloadRefinedArt([`cue-${style.id}`]).then(() => {
      if (
        cueBody.userData.requestedCueStyle === style.id &&
        hasRefinedArt(`cue-${style.id}`)
      )
        this.applyStyle(cueBody, style.id)
    })
    if (cueBody.userData.refinedCueStyle) {
      cueBody.children.forEach(disposeRefinedArt)
      const dimensions = cueBody.userData.cueDimensions
      const replacement = this.cueGeometry(
        dimensions.tipRadius,
        dimensions.buttRadius,
        dimensions.length
      )
      cueBody.clear()
      cueBody.add(...replacement.children)
      delete cueBody.userData.refinedCueStyle
      cueBody.userData.artRevision = (cueBody.userData.artRevision ?? 0) + 1
    }
  }

  private static tintRefinedCue(cueBody: Object3D, style: CueStyle) {
    const palette = this.materialsForStyle(style)
    cueBody.traverse((object) => {
      if (!(object instanceof Mesh)) return
      const pattern = object.userData.cuePattern
      const rings = object.userData.cueRingCount
      if (pattern) object.visible = pattern === style.inlayPattern
      else if (rings) object.visible = rings === (style.ringCount ?? 4)
      else if (object.userData.legacyVisible !== undefined)
        object.visible = object.userData.legacyVisible
      const tint = palette[object.userData.cueRole]
      if (!tint) return
      for (const material of Array.isArray(object.material)
        ? object.material
        : [object.material]) {
        if (material instanceof MeshPhysicalMaterial || "color" in material)
          (material as MeshPhysicalMaterial).color.copy(tint.color)
        this.customizeRefinedPattern(
          material as MeshPhysicalMaterial,
          tint,
          object.userData.cueRole,
          style
        )
      }
    })
    cueBody.userData.artRevision = (cueBody.userData.artRevision ?? 0) + 1
  }

  private static customizeRefinedPattern(
    material: MeshPhysicalMaterial,
    palette: MeshPhysicalMaterial,
    role: string,
    style: CueStyle
  ) {
    const patterns = {
      shaft: [style.shaftPattern, "maple"],
      forearm: [style.forearmPattern, "burl"],
      wrap: [style.wrapPattern, "linen"],
    }
    const pattern = patterns[role]
    if (!pattern) return
    let authored = this.customRefinedMaps.get(material)
    if (!authored) {
      authored = {
        map: material.map,
        bumpMap: material.bumpMap,
        roughnessMap: material.roughnessMap,
      }
      this.customRefinedMaps.set(material, authored)
    }
    const maps = pattern[0] === pattern[1] ? authored : palette
    material.map = maps.map
    material.bumpMap = maps.bumpMap
    material.roughnessMap = maps.roughnessMap
    material.needsUpdate = true
  }

  static applyStyle(cueBody: Object3D, styleId?: string): CueStyle {
    const style = cueStyleById(styleId)
    if (this.prepareRefinedCue(cueBody, style)) return style
    const cyber = style.id === "aurora-prism" || style.id === "holo-laser"
    if (
      cyber &&
      !cueBody.children.some((child) => child.userData.cueCyber === style.id)
    ) {
      this.addCyberChassis(cueBody, style.id)
    }
    const materials = this.materialsForStyle(style)
    cueBody.traverse((object) => {
      if (!(object instanceof Mesh)) return
      const ownedMaterial = object.userData.cueOwnedMaterial as
        MeshPhysicalMaterial | undefined
      ownedMaterial?.dispose()
      delete object.userData.cueOwnedMaterial
      const pattern = object.userData.cuePattern
      if (pattern) {
        object.visible = pattern === style.inlayPattern
      }
      const ringCount = object.userData.cueRingCount
      if (ringCount) {
        object.visible = ringCount === (style.ringCount ?? 4)
      }
      const role = object.userData.cueRole
      if (object.userData.cueCyber)
        object.visible = object.userData.cueCyber === style.id
      else if (
        cyber &&
        (pattern ||
          ringCount ||
          ["forearm", "sleeve", "wrap", "buttCap", "wrapThread"].includes(role))
      )
        object.visible = false
      else if (
        !cyber &&
        ["forearm", "sleeve", "wrap", "buttCap", "wrapThread"].includes(role)
      )
        object.visible = true
      if (role && materials[role]) {
        if (role === "energy") {
          const energyMaterial = materials[role].clone()
          object.material = energyMaterial
          object.userData.cueOwnedMaterial = energyMaterial
        } else {
          object.material = materials[role]
        }
      }
    })
    cueBody.userData.cueStyleId = style.id
    delete cueBody.userData.energyRatio
    this.setEnergy(cueBody, 0)
    return style
  }

  private static addCyberChassis(body: Object3D, styleId: string) {
    const { buttRadius: radius, length } = body.userData.cueDimensions
    const prism = styleId === "aurora-prism"
    const batches = new Map<string, BufferGeometry[]>()
    const add = (geometry: BufferGeometry, role: string) => {
      const parts = batches.get(role) ?? []
      parts.push(geometry)
      batches.set(role, parts)
    }
    const cylinder = (
      r: number,
      h: number,
      y: number,
      role: string,
      sides = 6
    ) => {
      const geometry = new CylinderGeometry(r * 0.92, r, h, sides)
      geometry.translate(0, y, 0)
      add(geometry, role)
    }
    // Hexagonal power housing, exposed axial core and separated armour rails
    // replace the wood butt and ornamental inlays with a mechanical silhouette.
    cylinder(radius * 1.25, length * 0.045, -length * 0.477, "cyberShell")
    cylinder(radius * 1.05, length * 0.12, -length * 0.395, "cyberFrame", 12)
    cylinder(radius * 0.64, length * 0.18, -length * 0.25, "energy", 12)
    for (let i = 0; i < 7; i++)
      cylinder(
        radius * 1.09,
        length * 0.006,
        -length * (0.445 - i * 0.017),
        "cyberShell",
        12
      )
    const count = prism ? 3 : 4
    for (let i = 0; i < count; i++) {
      const angle = (i * Math.PI * 2) / count
      const rail = new BoxGeometry(
        radius * (prism ? 0.5 : 0.65),
        length * 0.17,
        radius * 0.48
      )
      rail.translate(0, -length * 0.25, radius * (prism ? 1.42 : 1.3))
      rail.rotateY(angle)
      add(rail, "cyberShell")
      const light = new BoxGeometry(radius * 0.13, length * 0.13, radius * 0.15)
      light.translate(0, -length * 0.25, radius * 1.68)
      light.rotateY(angle)
      add(light, prism ? "inlayLight" : "energy")
      for (let slot = 0; slot < 4; slot++) {
        const vent = new BoxGeometry(radius * 0.7, length * 0.004, radius * 0.1)
        vent.translate(0, -length * (0.31 - slot * 0.028), radius * 1.6)
        vent.rotateY(angle)
        add(vent, "cyberFrame")
      }
    }
    for (const at of [-0.34, -0.17, -0.145]) {
      cylinder(radius * 1.4, length * 0.014, length * at, "cyberShell")
      cylinder(radius * 1.22, length * 0.007, length * (at + 0.013), "energy")
    }
    // A stepped compression joint leads into a functional, tapered carbon shaft.
    cylinder(radius * 1.03, length * 0.065, -length * 0.11, "cyberFrame", 12)
    cylinder(radius * 1.1, length * 0.012, -length * 0.075, "cyberShell")
    for (const [role, parts] of batches) {
      const mesh = new Mesh(
        mergeCueGeometries(parts),
        new MeshPhysicalMaterial()
      )
      parts.forEach((geometry) => geometry.dispose())
      mesh.material.dispose()
      mesh.name = `${styleId}-${role}-chassis`
      mesh.userData.cueRole = role
      mesh.userData.cueCyber = styleId
      if (role === "energy") mesh.userData.cueEnergyRing = true
      mesh.castShadow = true
      body.add(mesh)
    }
  }

  static setEnergy(cueBody: Object3D, powerRatio: number): void {
    const ratio = Math.min(
      1,
      Math.max(0, Number.isFinite(powerRatio) ? powerRatio : 0)
    )
    const isHolographic = cueBody.userData.cueStyleId === "holo-laser"
    if (!isHolographic || cueBody.userData.energyRatio === ratio) return
    cueBody.userData.energyRatio = ratio
    const cold = new Color(0x45e8ed)
    const warm = new Color(0xff9f57)
    const energy = cold.lerp(warm, Math.pow(ratio, 1.35))
    cueBody.traverse((object) => {
      if (!(object instanceof Mesh) || !object.userData.cueEnergyRing) return
      const material = object.material as MeshPhysicalMaterial
      if (isHolographic) {
        material.color.copy(energy)
        material.emissive.copy(energy)
        material.emissiveIntensity = 0.35 + ratio * 0.9
      }
    })
  }

  private static materialsForStyle(
    style: CueStyle
  ): Record<string, MeshPhysicalMaterial> {
    const cacheKey = [
      style.id,
      style.shaft,
      style.forearm,
      style.sleeve,
      style.wrap,
      style.accent,
      style.ferrule,
      style.tip,
      style.shaftMetalness,
      style.secondaryAccent,
      style.finish,
      style.iridescence,
      style.emissive,
      style.shaftPattern,
      style.forearmPattern,
      style.wrapPattern,
      style.inlayPattern,
      style.ringCount,
    ].join(":")
    const cached = this.styleMaterials.get(cacheKey)
    if (cached) return cached

    if (style.id === "custom") {
      for (const [key, materials] of this.styleMaterials) {
        if (!key.startsWith("custom:")) continue
        Object.values(materials).forEach((material) => material.dispose())
        this.styleMaterials.delete(key)
      }
    }

    const finish = style.finish ?? "lacquer"
    const material = (
      color: number,
      roughness: number,
      metalness = 0,
      clearcoat = 0.25,
      emissive = 0
    ) =>
      new MeshPhysicalMaterial({
        color,
        roughness:
          finish === "satin" || finish === "carbon"
            ? Math.max(roughness, 0.36)
            : roughness,
        metalness,
        clearcoat,
        clearcoatRoughness: finish === "pearl" ? 0.1 : 0.2,
        iridescence: style.iridescence ?? 0,
        iridescenceIOR: style.iridescence ? 1.42 : 1.3,
        iridescenceThicknessRange: style.iridescence ? [120, 560] : [100, 400],
        emissive,
        emissiveIntensity: emissive ? 0.42 : 0,
      })
    const materials = {
      cyberShell: material(
        style.id === "aurora-prism" ? 0xb4cbd8 : 0x35414f,
        0.26,
        0.78,
        0.35
      ),
      cyberFrame: material(0x111923, 0.42, 0.65, 0.1),
      shaft: material(
        style.shaft,
        style.shaftMetalness ? 0.22 : 0.31,
        style.shaftMetalness ?? 0,
        style.shaftMetalness ? 0.5 : 0.2
      ),
      forearm: material(style.forearm, 0.24, 0, 0.62),
      sleeve: material(style.sleeve, 0.22, 0, 0.58),
      wrap: material(style.wrap, 0.68, 0, 0.04),
      buttCap: material(style.sleeve, 0.28, 0.08, 0.42),
      accent: material(style.accent, 0.18, 0.56, 0.48, style.emissive ?? 0),
      inlayLight: material(
        style.secondaryAccent ?? style.ferrule,
        0.2,
        0.08,
        0.62
      ),
      energy: material(style.accent, 0.16, 0.62, 0.5, style.emissive ?? 0),
      wrapThread: material(style.accent, 0.54, 0.08, 0.18),
      ferrule: material(style.ferrule, 0.2, 0.02, 0.5),
      tip: material(style.tip, 0.82, 0, 0),
    }
    const assignTextures = (
      target: MeshPhysicalMaterial,
      pattern: string,
      bumpScale: number
    ) => {
      const textures = this.patternTexture(pattern)
      target.map = textures.color
      target.roughnessMap = textures.roughness
      target.bumpMap = textures.bump
      target.bumpScale = bumpScale
    }
    // Geometry is in metres: grain is micrometres, not centimetres.
    assignTextures(materials.shaft, style.shaftPattern ?? "maple", 0.000075)
    assignTextures(
      materials.forearm,
      style.forearmPattern ?? "straight",
      0.00006
    )
    assignTextures(
      materials.sleeve,
      style.forearmPattern ?? "straight",
      0.00006
    )
    assignTextures(materials.wrap, style.wrapPattern ?? "linen", 0.00018)
    assignTextures(materials.wrapThread, style.wrapPattern ?? "linen", 0.00012)
    for (const textured of Object.values(materials)) {
      textured.needsUpdate = true
    }
    this.styleMaterials.set(cacheKey, materials)
    return materials
  }

  private static patternTexture(pattern: string): {
    color: DataTexture
    roughness: DataTexture
    bump: DataTexture
  } {
    const cached = this.patternTextures.get(pattern)
    if (cached) return cached
    const shaft = ["maple", "ash", "carbon", "radial"].includes(pattern)
    const width = shaft ? 256 : 64
    const height = shaft ? 1024 : 128
    const colorData = new Uint8Array(width * height * 4)
    const roughnessData = new Uint8Array(width * height * 4)
    const bumpData = new Uint8Array(width * height * 4)
    let seed = [...pattern].reduce(
      (total, char) => total + char.charCodeAt(0),
      0
    )
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0
      return seed / 0x100000000
    }
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const value = shaft
          ? this.shaftChannel(pattern, x, y)
          : this.patternChannel(pattern, x, y, random)
        const index = (y * width + x) * 4
        const channel = Math.max(112, Math.min(255, value))
        const roughness = Math.max(72, Math.min(246, 302 - channel))
        const bump = Math.max(0, Math.min(255, channel - 96))
        for (let component = 0; component < 3; component++) {
          colorData[index + component] = channel
          roughnessData[index + component] = roughness
          bumpData[index + component] = bump
        }
        colorData[index + 3] = 255
        roughnessData[index + 3] = 255
        bumpData[index + 3] = 255
      }
    }
    const makeTexture = (data: Uint8Array) => {
      const texture = new DataTexture(
        data,
        width,
        height,
        RGBAFormat,
        UnsignedByteType
      )
      texture.wrapS = texture.wrapT = RepeatWrapping
      let axialRepeat = shaft ? 1 : 2
      if (pattern === "carbon") axialRepeat = 4
      if (pattern === "linen") axialRepeat = 6
      texture.repeat.set(shaft ? 1 : 2, axialRepeat)
      texture.colorSpace = NoColorSpace
      texture.minFilter = LinearMipmapLinearFilter
      texture.generateMipmaps = true
      texture.anisotropy = getRenderQuality().maxAnisotropy
      texture.needsUpdate = true
      return texture
    }
    const textures = {
      color: makeTexture(colorData),
      roughness: makeTexture(roughnessData),
      bump: makeTexture(bumpData),
    }
    this.patternTextures.set(pattern, textures)
    return textures
  }

  private static shaftChannel(pattern: string, x: number, y: number): number {
    if (pattern === "carbon") {
      const warp = Math.floor(x / 8),
        weft = Math.floor(y / 8)
      const over = (((warp - weft) % 4) + 4) % 4 < 2
      const strand = over ? x % 8 : y % 8
      return (
        142 +
        (over ? 25 : 0) +
        65 * Math.sin(((strand + 0.5) / 8) * Math.PI) +
        12 * Math.cos(strand * Math.PI)
      )
    }
    const u = (x / 256) * Math.PI * 2
    const wave = Math.sin((y / 1024) * Math.PI * 2) * 0.35
    const growth = Math.sin(u * 9 + wave + 0.25 * Math.sin(u * 3))
    const pore = Math.pow(Math.max(0, Math.sin(u * 39 + wave * 2)), 16)
    const fine = Math.sin(u * 81 + wave) * 5
    return 220 + growth * (pattern === "ash" ? 25 : 18) - pore * 52 + fine
  }

  private static patternChannel(
    pattern: string,
    x: number,
    y: number,
    random: () => number
  ): number {
    switch (pattern) {
      case "carbon":
        return (Math.floor((x + y) / 5) % 2) * 30 + 168
      case "radial":
        return 202 + Math.floor(28 * Math.sin(x * 0.42 + y * 0.018))
      case "linen":
        return x % 5 === 0 || y % 9 === 0 ? 184 : 226
      case "leather":
        return 205 + Math.floor(random() * 30)
      case "braid":
        return (x + y * 2) % 12 < 4 ? 178 : 228
      case "burl":
        return (
          194 + Math.floor(34 * Math.sin(x * 0.28 + Math.sin(y * 0.16) * 2))
        )
      case "flame":
        return 205 + Math.floor(30 * Math.sin(x * 0.18 + y * 0.08))
      case "marble":
        return (
          196 +
          Math.floor(
            36 * Math.sin(x * 0.19 + Math.sin(y * 0.11) * 2.4) +
              10 * Math.sin(y * 0.31)
          )
        )
      case "porcelain":
        return 224 + Math.floor(22 * Math.sin(x * 0.13 + Math.sin(y * 0.09)))
      case "tiger":
        return 176 + Math.floor(58 * Math.abs(Math.sin(x * 0.12 + y * 0.045)))
      case "prism":
        return 186 + ((x * 5 + y * 3) % 37)
      case "holographic":
        return (
          168 + Math.floor(68 * (0.5 + 0.5 * Math.sin(x * 0.21 + y * 0.08)))
        )
      case "ash":
        return 214 + Math.floor(22 * Math.sin(x * 0.24 + y * 0.03))
      default:
        return 224 + Math.floor(18 * Math.sin(x * 0.12 + y * 0.025))
    }
  }
}
