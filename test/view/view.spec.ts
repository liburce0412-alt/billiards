import { expect } from "chai"
import { touchCameraMetrics, View } from "../../src/view/view"
import { Table } from "../../src/model/table"
import { Rack } from "../../src/utils/rack"
import { initDom, canvas3d } from "./dom"
import { State } from "../../src/model/ball"
import { Assets } from "../../src/view/assets"

initDom()

describe("View", () => {
  const table = new Table(Rack.diamond())

  it("maps two-finger input to a stable camera centroid and pinch distance", () => {
    const metrics = touchCameraMetrics([
      { x: 40, y: 20 },
      { x: 100, y: 100 },
    ])
    expect(metrics).to.deep.equal({
      centroidX: 70,
      centroidY: 60,
      distance: 100,
    })
    expect(touchCameraMetrics([{ x: 0, y: 0 }])).to.be.undefined
  })

  it("isInView", (done) => {
    table.hasPockets = true
    const view = new View(canvas3d, table, Assets.localAssets())
    expect(view.isInMotionNotVisible()).to.be.false
    done()
  })

  it("loads three cushion assets", (done) => {
    table.hasPockets = false
    const view = new View(canvas3d, table, Assets.localAssets("threecushion"))
    expect(view).to.be.not.null
    done()
  })

  it("without assets", (done) => {
    table.hasPockets = false
    const view = new View(canvas3d, table, Assets.localAssets())
    expect(view.isInMotionNotVisible()).to.be.false
    done()
  })

  it("uses the contrasted SPECTRA base with a GLSL environment", () => {
    const view = new View(canvas3d, table, Assets.localAssets())
    expect((view.scene.background as any).getHex()).to.equal(0xc9d7e4)
    expect(view.scene.getObjectByName("spectra-environment")).to.not.be
      .undefined
    expect(view.scene.getObjectByName("spectra-cue-caustic")).to.not.be
      .undefined
    expect(view.scene.getObjectByName("spectra-cue-caustic-halo")).to.be
      .undefined
    expect(view.scene.getObjectByName("spectra-cue-rainbow")).to.be.undefined
    expect(view.scene.getObjectByName("spectra-architecture")).to.not.be
      .undefined
    expect(view.scene.getObjectByName("starfield")).to.be.undefined
  })

  it("ball not in view", (done) => {
    table.hasPockets = false
    const ball = table.balls[3]
    ball.pos.x = -1.2
    ball.pos.y = 0.62
    ball.state = State.Sliding
    ball.vel.x = 1
    ball.updateMesh(0.01)
    const view = new View(canvas3d, table, Assets.localAssets())
    view.render()
    view.ballToCheck = 3
    expect(view.isInMotionNotVisible()).to.be.false
    done()
  })
})
