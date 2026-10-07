import { InstancedMesh, Matrix4, PerspectiveCamera, Vector3 } from "three"
import { RobotPlayers, railPoint } from "../../src/view/robotplayers"
import { Cue } from "../../src/view/cue"
import { maxPower } from "../../src/model/physics/constants"
import { Camera } from "../../src/view/camera"

describe("Robot ball players", () => {
  it("does not stand or hide the cue when releasing after a small aim adjustment", () => {
    const players = new RobotPlayers()
    const cue = new Cue()
    const camera = new PerspectiveCamera()
    cue.aim.pos.set(-0.7, 0, 0)
    for (let i = 0; i < 600; i++) {
      cue.update(1 / 60)
      players.update(1 / 60, cue, camera, true, true)
    }
    cue.aim.angle += 0.08
    cue.update(1 / 60)
    players.update(1 / 60, cue, camera, true, true)
    players.prepareShot()
    for (let i = 0; i < 90; i++) {
      cue.update(1 / 60)
      players.update(1 / 60, cue, camera, true, true)
      expect(players.cameraFrame.walking).toBe(false)
      expect((players as any).players[0].stance).toBeLessThan(0.025)
      expect(cue.cueBody.visible).toBe(true)
    }
    expect(players.readyToStrike).toBe(true)
    players.dispose()
  })
  it.each([30, 60, 120])(
    "holds for one second then stays upright until the next stance at %i fps",
    (fps) => {
      const players = new RobotPlayers()
      const cue = new Cue()
      cue.aim.pos.set(-0.7, 0, 0)
      const camera = new PerspectiveCamera()
      const rig = (players as any).players[0]
      for (let i = 0; i < fps * 5; i++) {
        cue.update(1 / fps)
        players.update(1 / fps, cue, camera, true, true)
      }
      players.beginShot()
      const eye = players.cameraFrame.eye.clone()
      for (let i = 0; i < fps; i++) {
        players.update(1 / fps, cue, camera, false, true)
        expect(players.cameraFrame.eye.distanceTo(eye)).toBeLessThan(1e-8)
        expect(rig.stance).toBeLessThan(0.001)
        expect(cue.cueBody.visible).toBe(true)
      }
      for (let i = 0; i < fps * 2; i++)
        players.update(1 / fps, cue, camera, false, true)
      expect(rig.stance).toBeGreaterThan(0.99)
      cue.aim.angle = Math.PI
      let walked = false
      for (let i = 0; i < fps * 8; i++) {
        cue.update(1 / fps)
        players.update(1 / fps, cue, camera, true, true)
        if (!walked || players.cameraFrame.walking)
          expect(rig.stance).toBeGreaterThan(0.99)
        walked ||= players.cameraFrame.walking
      }
      expect(walked).toBe(true)
      expect(rig.stance).toBeLessThan(0.001)
      players.dispose()
    }
  )
  it.each([
    [-1, -0.5, Math.PI / 2],
    [1, 0.5, -Math.PI / 2],
    [1.2, 0, Math.PI],
    [-1.2, 0, 0],
    [-1, 0.45, Math.PI / 2],
    [1, -0.45, -Math.PI / 2],
    [0.9, 0.4, Math.PI * 0.75],
    [-0.9, -0.4, -Math.PI * 0.25],
    [0, 0, Math.PI / 4],
  ])(
    "frames the cue ball and fore-end at (%f, %f), angle %f",
    (x, y, angle) => {
      const players = new RobotPlayers()
      const cue = new Cue()
      const camera = new Camera(2.2)
      camera.mode = camera.aimView
      cue.aim.pos.set(x, y, 0)
      cue.aim.angle = angle
      for (let frame = 0; frame < 600; frame++) {
        cue.update(1 / 60)
        players.update(1 / 60, cue, camera.camera, true, true)
        camera.update(1 / 60, cue.aim, cue.aim.pos, players.cameraFrame)
      }
      camera.camera.updateProjectionMatrix()
      camera.camera.updateMatrixWorld()
      const ball = cue.aim.pos.clone().project(camera.camera)
      const shaft = cue.cueBody
        .localToWorld(new Vector3(0, cue.length * 0.4, 0))
        .project(camera.camera)
      expect(players.cameraFrame.walking).toBe(false)
      expect(cue.cueBody.visible).toBe(true)
      expect(Math.abs(ball.x)).toBeLessThan(0.3)
      expect(ball.y).toBeGreaterThan(-0.75)
      expect(Math.abs(shaft.x)).toBeLessThan(0.4)
      expect(shaft.y).toBeGreaterThan(-0.9)
      expect(shaft.z).toBeLessThan(1)
      players.dispose()
    }
  )
  it("walks a closed path outside the table instead of cutting across it", () => {
    for (let distance = -20; distance < 30; distance += 0.05) {
      const point = railPoint(distance, 1.8, 1.2)
      expect(
        Math.abs(point.x) >= 1.8 - 1e-9 || Math.abs(point.y) >= 1.2 - 1e-9
      ).toBe(true)
      expect(point.distanceTo(railPoint(distance + 12, 1.8, 1.2))).toBeLessThan(
        1e-9
      )
    }
  })

  it("separates occupied bays, crossings and role swaps outside the table", () => {
    const players = new RobotPlayers()
    const cue = new Cue()
    const camera = new PerspectiveCamera()
    camera.position.set(0, -4, 2)
    const rigs = (players as any).players
    rigs[0].rail = rigs[1].rail = 0.3
    for (let frame = 0; frame < 1200; frame++) {
      if (frame % 120 === 0) {
        players.setActivePlayer(((frame / 120) % 2) + 1)
        cue.aim.pos.set(Math.sin(frame) * 0.8, Math.cos(frame) * 0.4, 0.028575)
        cue.aim.angle = frame * 0.031
      }
      cue.update(1 / 60)
      players.update(1 / 60, cue, camera, true)
      expect(
        rigs[0].position.distanceTo(rigs[1].position)
      ).toBeGreaterThanOrEqual(0.85 - 1e-9)
      for (const rig of rigs)
        expect(
          Math.abs(rig.position.x) > 1 || Math.abs(rig.position.y) > 0.7
        ).toBe(true)
    }
    players.dispose()
  })

  it("hides the shooter's body throughout first-person standing and exposes a walking frame", () => {
    const players = new RobotPlayers()
    const cue = new Cue()
    cue.aim.pos.set(-0.7, 0, 0.028575)
    const camera = new PerspectiveCamera()
    camera.position.set(0, -4, 2)
    for (let i = 0; i < 240; i++) {
      cue.update(1 / 60)
      players.update(1 / 60, cue, camera, true, true)
    }
    players.beginShot()
    for (let i = 0; i < 180; i++) {
      players.update(1 / 60, cue, camera, false, true)
      expect(players.root.children[0].userData.firstPerson).toBe(true)
      expect(
        (
          players.root.children[0].getObjectByName(
            "shell-helmet"
          ) as InstancedMesh
        ).count
      ).toBe(0)
    }
    cue.aim.pos.x = 0.7
    cue.aim.angle = Math.PI
    cue.update(1 / 60)
    players.update(1 / 60, cue, camera, true, true)
    expect(players.cameraFrame.walking).toBe(true)
    players.dispose()
  })

  it.each([30, 60, 120])(
    "keeps fine aiming and power animation crouched at %i fps",
    (fps) => {
      const players = new RobotPlayers()
      const cue = new Cue()
      cue.aim.pos.set(-0.7, 0, 0.028575)
      const camera = new PerspectiveCamera()
      camera.position.set(0, -4, 2)
      for (let i = 0; i < fps * 5; i++) {
        cue.update(1 / fps)
        players.update(1 / fps, cue, camera, true, true)
      }
      const height = players.cameraFrame.eye.z
      for (let i = 0; i < fps * 5; i++) {
        cue.aim.angle = Math.sin((i / fps) * 4) * 0.12
        cue.aim.power = (0.5 + Math.sin(i / fps) * 0.5) * maxPower
        cue.update(1 / fps)
        players.update(1 / fps, cue, camera, true, true)
        expect(players.cameraFrame.walking).toBe(false)
        expect(Math.abs(players.cameraFrame.eye.z - height)).toBeLessThan(0.001)
        expect(cue.cueBody.visible).toBe(true)
      }
      cue.aim.angle = Math.PI
      for (let i = 0; i < fps * 0.2; i++) {
        cue.update(1 / fps)
        players.update(1 / fps, cue, camera, true, true)
        expect(players.cameraFrame.walking).toBe(false)
      }
      for (let i = 0; i < fps; i++) {
        cue.update(1 / fps)
        players.update(1 / fps, cue, camera, true, true)
      }
      expect(players.cameraFrame.walking).toBe(true)
      expect(cue.cueBody.visible).toBe(false)
      players.dispose()
    }
  )

  it("carries the selected cue without placing a second cue ahead of the player", () => {
    const players = new RobotPlayers()
    const cue = new Cue()
    const camera = new PerspectiveCamera()
    camera.position.set(0, -4, 2)
    cue.setStyle("aurora-prism", false)
    cue.update(1 / 60)
    players.update(1 / 60, cue, camera, true)
    const carried = players.root.children[0].getObjectByName("carried-cue")!
    expect(carried.userData.cueStyleId).toBe("aurora-prism")
    expect(carried.visible).toBe(true)
    expect(cue.cueBody.visible).toBe(false)
    const source = cue.cueBody.children.find(
      (object: any) => object.isMesh && object.visible
    ) as any
    const copy = carried.getObjectByName(source.name) as any
    expect(copy.geometry).toBe(source.geometry)
    expect(copy.material).not.toBe(source.material)
    expect(copy.material.color.equals(source.material.color)).toBe(true)
    players.setActivePlayer(2)
    cue.setStyle("holo-laser", false)
    players.update(1 / 60, cue, camera, true)
    expect(carried.userData.cueStyleId).toBe("aurora-prism")
    expect(
      players.root.children[1].getObjectByName("carried-cue")!.userData
        .cueStyleId
    ).toBe("holo-laser")
    for (let i = 0; i < 400; i++) players.update(1 / 60, cue, camera, true)
    expect(cue.cueBody.visible).toBe(true)
    expect(
      players.root.children[1].getObjectByName("carried-cue")!.visible
    ).toBe(false)
    players.dispose()
  })

  it("keeps the bridge hand planted while the cue strokes through it", () => {
    const players = new RobotPlayers()
    const cue = new Cue()
    cue.aim.pos.set(-0.7, 0, 0.028575)
    const camera = new PerspectiveCamera()
    const player = players.root.children[0]
    for (let i = 0; i < 240; i++) {
      camera.position.copy(player.position).add(new Vector3(0, 0, 1))
      cue.update(1 / 60)
      players.update(1 / 60, cue, camera, true)
    }
    const palmPosition = () => {
      players.root.updateMatrixWorld(true)
      const palms = player.getObjectByName("shell-sphere") as InstancedMesh
      const matrix = new Matrix4()
      palms.getMatrixAt(0, matrix)
      return new Vector3()
        .setFromMatrixPosition(matrix)
        .applyMatrix4(palms.matrixWorld)
    }
    const before = palmPosition()
    const cueBefore = cue.cueBody.position.clone()
    cue.aim.power = maxPower
    cue.preStrokeProgress = 0.5
    cue.update(0.1)
    players.update(0.1, cue, camera, true)
    expect(cue.cueBody.position.distanceTo(cueBefore)).toBeGreaterThan(0.0001)
    expect(palmPosition().distanceTo(before)).toBeLessThan(0.00001)
    players.dispose()
  })

  it("keeps two distinct players with bounded batches and preserves physics aim", () => {
    const players = new RobotPlayers()
    const cue = new Cue()
    cue.aim.pos.set(-0.7, 0, 0.028575)
    const original = cue.aim.copy()
    const camera = new PerspectiveCamera()
    camera.position.set(0, -4, 2)
    for (let i = 0; i < 240; i++) {
      cue.update(1 / 60)
      players.update(1 / 60, cue, camera, true)
    }
    expect(players.root.children.map((child) => child.name)).toEqual([
      "robot-ivory-cyan",
      "robot-graphite-amber",
    ])
    expect(players.root.userData.robotState.drawCalls).toBeLessThanOrEqual(50)
    expect(cue.aim.pos.equals(original.pos)).toBe(true)
    expect(cue.aim.angle).toBe(original.angle)
    players.beginShot()
    const position = players.root.children[0].position.clone()
    players.update(0.1, cue, camera, false)
    expect(players.root.userData.robotState.phase).toBe("follow-through")
    expect(players.root.children[0].position.equals(position)).toBe(true)
    for (let i = 0; i < 25; i++) players.update(0.1, cue, camera, false)
    expect(players.root.userData.robotState.phase).toBe("observe")
    expect(cue.cueBody.visible).toBe(false)
    expect(cue.shadowMesh.visible).toBe(false)
    players.setActivePlayer(2)
    players.update(0.1, cue, camera, true)
    expect(players.root.userData.robotState.activePlayer).toBe(2)
    expect(players.cameraFrame.walking).toBe(true)
    expect(cue.cueBody.visible).toBe(false)
    for (let i = 0; i < 300; i++) players.update(1 / 60, cue, camera, true)
    expect(cue.cueBody.visible).toBe(true)
    players.root.traverse((object: any) => {
      if (!object.isInstancedMesh) return
      expect(object.count).toBeLessThanOrEqual(100)
      expect([...object.instanceMatrix.array].every(Number.isFinite)).toBe(true)
    })
    const disposed = jest.spyOn(
      (players.root.children[0].children[0] as any).geometry,
      "dispose"
    )
    players.dispose()
    expect(disposed).toHaveBeenCalledTimes(1)
  })
})
