import { expect } from "chai"
import { Color, MeshPhysicalMaterial, MeshStandardMaterial } from "three"
import { BallMaterialFactory } from "../../src/view/ballmaterialfactory"

describe("BallMaterialFactory", () => {
  it("creates a projected material with an equirectangular texture", () => {
    const color = new Color(0xff0000)
    const label = 8
    const material = BallMaterialFactory.createProjectedMaterial(label, color)

    expect(material).to.be.an.instanceOf(MeshStandardMaterial)
    expect(material.color.getHex()).to.equal(0xffffff)
    expect(material.map).to.exist
    expect(material.map!.image.width).to.equal(material.map!.image.height * 2)
  })

  it("caches materials", () => {
    const color = new Color(0x00ff00)
    const label = 9
    const mat1 = BallMaterialFactory.createProjectedMaterial(label, color)
    const mat2 = BallMaterialFactory.createProjectedMaterial(label, color)
    expect(mat1).to.equal(mat2)
  })

  it("creates a textured dots material with cubemap shader hooks", () => {
    const color = new Color(0xffeecc)
    const material = BallMaterialFactory.createTexturedDotsMaterial(color)

    expect(material).to.be.an.instanceOf(MeshPhysicalMaterial)
    expect(material.color.getHex()).to.equal(color.getHex())

    const shader = {
      uniforms: {} as any,
      vertexShader: "#include <begin_vertex>",
      fragmentShader: "#include <color_fragment>",
    }

    if (material.onBeforeCompile) {
      material.onBeforeCompile(shader)
    }

    expect(shader.uniforms.uCubeMap).to.exist
    expect(shader.vertexShader).to.contain("varying vec3 vLocalPos;")
    expect(shader.fragmentShader).to.contain("uniform samplerCube uCubeMap;")
    expect(shader.fragmentShader).to.contain(
      "textureCube(uCubeMap, normalize(vLocalPos))"
    )
  })
})
