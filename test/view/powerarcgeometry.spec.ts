import { PowerArcGeometry } from "../../src/view/powerarcgeometry"

describe("PowerArcGeometry", () => {
  const geometry = new PowerArcGeometry(680, 122, 34, 20, 54)

  it("places zero, half and full power on one symmetric bowed curve", () => {
    expect(geometry.pointAt(0)).toEqual({ x: 34, y: 20 })
    expect(geometry.pointAt(0.5)).toEqual({ x: 340, y: 74 })
    expect(geometry.pointAt(1)).toEqual({ x: 646, y: 20 })
  })

  it("maps pointer x positions to the exact same power domain", () => {
    expect(geometry.valueFromPointer(34)).toBe(0)
    expect(geometry.valueFromPointer(340)).toBe(0.5)
    expect(geometry.valueFromPointer(646)).toBe(1)
    expect(geometry.valueFromPointer(-100)).toBe(0)
    expect(geometry.valueFromPointer(900)).toBe(1)
  })

  it("returns unit normals along the curve", () => {
    for (const value of [0, 0.25, 0.5, 0.75, 1]) {
      const normal = geometry.normalAt(value)
      expect(Math.hypot(normal.x, normal.y)).toBeCloseTo(1, 8)
    }
  })

  it("uses pointer y for the vertical bowed rail", () => {
    const vertical = new PowerArcGeometry(
      80,
      180,
      undefined,
      undefined,
      undefined,
      "vertical"
    )
    expect(vertical.pointAt(0)).toEqual({ x: 28, y: 20 })
    expect(vertical.pointAt(0.5)).toEqual({ x: 48, y: 90 })
    expect(vertical.pointAt(1)).toEqual({ x: 28, y: 160 })
    expect(vertical.valueFromPointer(0, 20)).toBe(0)
    expect(vertical.valueFromPointer(0, 90)).toBe(0.5)
    expect(vertical.valueFromPointer(0, 160)).toBe(1)
    expect(vertical.valueFromPointer(999, 90)).toBe(0.5)
  })
})
