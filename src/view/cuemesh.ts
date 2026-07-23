import { R } from "../model/physics/constants"
import { up } from "../utils/three-utils"
import {
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
  MeshPhysicalMaterial,
  Object3D,
} from "three"
import { CueStyle, cueStyleById } from "./cuestyle"

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

  static cueGeometry(tipRadius, buttRadius, length, segments = 20) {
    const group = new Group()
    const placeholder = new MeshPhysicalMaterial()
    const addPart = (mesh: Mesh, role: string, positionY: number): Mesh => {
      mesh.position.y = positionY
      mesh.userData.cueRole = role
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
      -length / 2 + capLength + sleeveLength + wrapLength,
      -length / 2 + buttLength,
    ]
    ringPositions.forEach((positionY, index) => {
      const ring = new Mesh(
        new CylinderGeometry(
          buttRadius * (index === 3 ? 0.91 : 1.005),
          buttRadius * (index === 3 ? 0.91 : 1.005),
          length * 0.004,
          segments
        ),
        placeholder
      )
      addPart(ring, "accent", positionY)
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

    for (let i = 0; i < 4; i++) {
      const inlay = new Mesh(
        new ConeGeometry(buttRadius * 0.11, forearmLength * 0.48, 3, 1, false),
        placeholder
      )
      const angle = (i * Math.PI) / 2
      inlay.position.set(
        Math.cos(angle) * buttRadius * 0.88,
        forearm.position.y - forearmLength * 0.08,
        Math.sin(angle) * buttRadius * 0.88
      )
      inlay.rotation.y = -angle
      inlay.userData.cueRole = "accent"
      group.add(inlay)
    }

    const ferruleGeom = new CylinderGeometry(
      tipRadius,
      tipRadius,
      ferruleLength,
      segments
    )
    const ferrule = new Mesh(ferruleGeom, placeholder)
    addPart(ferrule, "ferrule", cursor + ferruleLength / 2)
    cursor += ferruleLength

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

    return group
  }

  static applyStyle(cueBody: Object3D, styleId?: string): CueStyle {
    const style = cueStyleById(styleId)
    const materials = this.materialsForStyle(style)
    cueBody.traverse((object) => {
      if (!(object instanceof Mesh)) return
      const role = object.userData.cueRole
      if (role && materials[role]) {
        object.material = materials[role]
      }
    })
    cueBody.userData.cueStyleId = style.id
    return style
  }

  private static materialsForStyle(
    style: CueStyle
  ): Record<string, MeshPhysicalMaterial> {
    const cached = this.styleMaterials.get(style.id)
    if (cached) return cached

    const material = (
      color: number,
      roughness: number,
      metalness = 0,
      clearcoat = 0.25
    ) =>
      new MeshPhysicalMaterial({
        color,
        roughness,
        metalness,
        clearcoat,
        clearcoatRoughness: 0.2,
      })
    const materials = {
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
      accent: material(style.accent, 0.18, 0.56, 0.48),
      ferrule: material(style.ferrule, 0.2, 0.02, 0.5),
      tip: material(style.tip, 0.82, 0, 0),
    }
    this.styleMaterials.set(style.id, materials)
    return materials
  }
}
