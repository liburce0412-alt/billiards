import { validTableTennisInput } from "../../server/table-tennis-protocol"

describe("table tennis input boundary", () => {
  const input = { kind: "swing", seq: 3, aimX: 0.5, power: 0.7, spin: -0.2 }
  it("accepts bounded intentions", () => {
    expect(validTableTennisInput(input)).toBe(true)
  })
  it.each([
    { seq: -1 },
    { seq: 1.2 },
    { aimX: 2 },
    { power: -1 },
    { power: Infinity },
    { spin: NaN },
    { kind: "score" },
  ])("rejects impossible or non-finite input %o", (change) => {
    expect(validTableTennisInput({ ...input, ...change })).toBe(false)
  })
  it("does not accept a claimed authoritative score as input", () => {
    expect(validTableTennisInput({ scores: [11, 0], winner: 0 })).toBe(false)
  })
})
