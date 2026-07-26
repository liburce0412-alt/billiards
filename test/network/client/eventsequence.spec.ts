import { EventSequenceWindow } from "../../../src/network/client/eventsequence"

describe("EventSequenceWindow", () => {
  it("accepts new events and rejects duplicate delivery", () => {
    const window = new EventSequenceWindow()
    expect(window.accept("connection:1")).toBe(true)
    expect(window.accept("connection:1")).toBe(false)
    expect(window.accept("connection:2")).toBe(true)
    expect(window.accept()).toBe(true)
  })

  it("forgets entries outside the bounded window", () => {
    const window = new EventSequenceWindow(2)
    window.accept("a")
    window.accept("b")
    window.accept("c")
    expect(window.accept("a")).toBe(true)
  })
})
