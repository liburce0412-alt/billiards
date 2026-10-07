import {
  Matrix4,
  Mesh,
  CircleGeometry,
  MeshBasicMaterial,
  ArrowHelper,
  Color,
  CanvasTexture,
  Vector3,
  MeshStandardMaterial,
  MeshPhysicalMaterial,
  Scene,
  Line,
  BufferGeometry,
  SphereGeometry,
} from "three"
import { State } from "../model/ball"
import { norm, up, zero } from "./../utils/three-utils"
import { R } from "../model/physics/constants"
import { Trace } from "./trace"
import { BallMaterialFactory } from "./ballmaterialfactory"
import { Session } from "../network/client/session"
import { BallAppearance } from "./ballappearance"
import { getRenderQuality } from "./renderquality"
import { disposeRefinedArt, refinedArt, refinedArtEntry } from "./refinedart"

export class BallMesh {
  private static readonly _ballGeometries = new Map<string, BufferGeometry>()
  private static _shadowGeometry: CircleGeometry
  private static _shadowMaterial: MeshBasicMaterial

  private static getBallGeometry() {
    const quality = getRenderQuality()
    const key = `${quality.name}:${quality.ballSegments}:${quality.ballRows}`
    let geometry = this._ballGeometries.get(key)
    if (!geometry) {
      geometry = new SphereGeometry(R, quality.ballSegments, quality.ballRows)
      this._ballGeometries.set(key, geometry)
    }
    return geometry
  }

  private static getShadowGeometry() {
    if (!this._shadowGeometry) {
      this._shadowGeometry = new CircleGeometry(
        R * 0.9,
        Session.getLod() <= 1 ? 9 : 24
      )
      this._shadowGeometry.applyMatrix4(
        new Matrix4().makeTranslation(0, 0, -R * 0.99)
      )
    }
    return this._shadowGeometry
  }

  private static getShadowMaterial() {
    if (!this._shadowMaterial) {
      const canvas = document.createElement("canvas")
      canvas.width = 128
      canvas.height = 128
      const context = canvas.getContext("2d")
      if (context) {
        const gradient = context.createRadialGradient(64, 64, 4, 64, 64, 64)
        gradient.addColorStop(0, "rgba(0,0,0,0.86)")
        gradient.addColorStop(0.48, "rgba(0,0,0,0.42)")
        gradient.addColorStop(1, "rgba(0,0,0,0)")
        context.fillStyle = gradient
        context.fillRect(0, 0, 128, 128)
      }
      const alphaMap = new CanvasTexture(canvas)
      alphaMap.generateMipmaps = true
      this._shadowMaterial = new MeshBasicMaterial({
        color: 0x101821,
        opacity: 0.38,
        alphaMap,
        transparent: true,
        depthWrite: false,
      })
    }
    return this._shadowMaterial
  }

  mesh: Mesh
  shadow: Mesh
  spinAxisArrow: ArrowHelper
  trace: Trace
  color: Color
  private ghosts: Line[] = []

  freezeTrace(scene: Scene) {
    const count = this.trace.geometry.drawRange.count
    if (count > 1) {
      const ghost = this.trace.freeze()
      this.ghosts.push(ghost)
      scene.add(ghost)
    }
  }

  clearGhosts(scene: Scene) {
    this.ghosts.forEach((g) => scene.remove(g))
    this.ghosts = []
  }
  constructor(color, label?: number, appearance?: BallAppearance) {
    this.color = new Color(color)
    this.initialiseMesh(this.color, label, appearance)
  }

  updateAll(ball, t) {
    const isStationary = ball.state === State.Stationary
    const positionChanged = !this.mesh.position.equals(ball.pos)
    if (isStationary && !positionChanged) {
      return
    }

    this.updatePosition(ball.pos)
    if (this.spinAxisArrow.visible) {
      this.updateArrows(ball.pos, ball.rvel, ball.state)
    }
    if (ball.rvel.lengthSq() !== 0) {
      this.updateRotation(ball.rvel, t)
      this.trace.addTrace(ball.pos, ball.vel)
    }
  }

  updatePosition(pos) {
    this.mesh.position.copy(pos)
    this.shadow.position.copy(pos)
  }

  readonly m = new Matrix4()

  updateRotation(rvel, t) {
    const angle = rvel.length() * t
    this.mesh.rotateOnWorldAxis(norm(rvel), angle)
  }

  updateArrows(pos, rvel, state) {
    this.spinAxisArrow.setLength(R + (R * rvel.length()) / 2, R, R)
    this.spinAxisArrow.position.copy(pos)
    this.spinAxisArrow.setDirection(norm(rvel))
    if (state == State.Rolling) {
      this.spinAxisArrow.setColor(0xcc0000)
    } else {
      this.spinAxisArrow.setColor(0x00cc00)
    }
  }

  initialiseMesh(color: Color, label?: number, appearance?: BallAppearance) {
    let geometry: BufferGeometry
    let material: MeshStandardMaterial | MeshPhysicalMaterial
    const effectiveAppearance =
      appearance ?? (label === undefined ? "dotted" : "projected")

    if (
      effectiveAppearance === "dotted" ||
      effectiveAppearance === "texturedDots"
    ) {
      geometry = BallMesh.getBallGeometry()
      material = BallMaterialFactory.createTexturedDotsMaterial(color)
    } else {
      if (label === undefined) {
        throw new Error("Projected ball material requires a label")
      }
      geometry = BallMesh.getBallGeometry()
      material = BallMaterialFactory.createProjectedMaterial(
        label,
        color,
        getRenderQuality().ballTextureSize
      )
    }
    const assetId =
      label === undefined
        ? `ball-dotted-${color.getHexString()}`
        : `ball-pool-${label}`
    const art = refinedArt(assetId)
    if (art) {
      art.updateMatrixWorld(true)
      let adopted = false
      art.traverse((object) => {
        if (adopted || !(object instanceof Mesh)) return
        const sourceRadius = refinedArtEntry(assetId)?.radius ?? R
        geometry = object.geometry.clone().applyMatrix4(object.matrixWorld)
        geometry.scale(R / sourceRadius, R / sourceRadius, R / sourceRadius)
        // The marker shader depends on live cubemap uniforms. Keep it for
        // dotted balls; numbered balls use the Blender-authored resin/maps.
        if (
          effectiveAppearance === "projected" &&
          !Array.isArray(object.material)
        )
          material = object.material.clone()
        adopted = true
      })
      disposeRefinedArt(art)
    }
    this.mesh = new Mesh(geometry, material)
    if (art) this.mesh.userData.refinedArtId = assetId
    this.mesh.name = "ball"
    this.mesh.castShadow = getRenderQuality().dynamicShadows
    this.updateRotation(new Vector3().random(), 100)

    this.shadow = new Mesh(
      BallMesh.getShadowGeometry(),
      BallMesh.getShadowMaterial()
    )
    this.shadow.visible = !getRenderQuality().dynamicShadows
    this.spinAxisArrow = new ArrowHelper(up, zero, 2, 0x000000, 0.01, 0.01)
    this.spinAxisArrow.visible = false
    this.trace = new Trace(500, color)
  }

  addToScene(scene) {
    scene.add(this.mesh)
    scene.add(this.shadow)
    scene.add(this.spinAxisArrow)
    scene.add(this.trace.line)
  }
}
