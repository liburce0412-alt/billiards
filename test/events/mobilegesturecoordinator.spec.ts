import {
  MOBILE_AIM_SENSITIVITY,
  MobileGestureCoordinator,
} from "../../src/events/mobilegesturecoordinator"

function pointer(
  type: string,
  pointerId: number,
  x: number,
  y: number
): PointerEvent {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: x,
    clientY: y,
  })
  Object.defineProperties(event, {
    pointerId: { value: pointerId },
    pointerType: { value: "touch" },
  })
  return event as PointerEvent
}

describe("MobileGestureCoordinator", () => {
  let element: HTMLCanvasElement
  let captured: Set<number>

  beforeEach(() => {
    element = document.createElement("canvas")
    captured = new Set()
    element.setPointerCapture = ((id: number) => captured.add(id)) as any
    element.releasePointerCapture = ((id: number) => captured.delete(id)) as any
    element.hasPointerCapture = ((id: number) => captured.has(id)) as any
    document.body.appendChild(element)
  })

  it("drains D1-D2-U1-U2 before accepting another one-finger aim", () => {
    const aim: Array<[number, number]> = []
    const camera: Array<[number, number, number]> = []
    const coordinator = new MobileGestureCoordinator(element, {
      onPrimaryDrag: (dx, dy) => aim.push([dx, dy]),
      onCameraDrag: ({ x, y, distance }) => camera.push([x, y, distance]),
    })

    element.dispatchEvent(pointer("pointerdown", 1, 20, 20))
    element.dispatchEvent(pointer("pointermove", 1, 28, 20))
    expect(coordinator.state).toBe("aiming")
    expect(aim).toEqual([[8, 0]])

    element.dispatchEvent(pointer("pointerdown", 2, 80, 20))
    element.dispatchEvent(pointer("pointermove", 2, 90, 20))
    expect(coordinator.state).toBe("camera")
    expect(camera).toHaveLength(1)

    element.dispatchEvent(pointer("pointerup", 1, 28, 20))
    expect(coordinator.state).toBe("cameraDrain")
    element.dispatchEvent(pointer("pointermove", 2, 110, 20))
    expect(aim).toHaveLength(1)
    expect(camera).toHaveLength(1)

    element.dispatchEvent(pointer("pointerup", 2, 110, 20))
    expect(coordinator.getSnapshot()).toEqual({
      state: "idle",
      pointerCount: 0,
      aimSensitivity: MOBILE_AIM_SENSITIVITY,
    })

    element.dispatchEvent(pointer("pointerdown", 3, 10, 10))
    element.dispatchEvent(pointer("pointermove", 3, 14, 10))
    expect(aim.at(-1)).toEqual([4, 0])
    coordinator.dispose()
  })

  it("also drains when the second finger is lifted first", () => {
    const aim = jest.fn()
    const coordinator = new MobileGestureCoordinator(element, {
      onPrimaryDrag: aim,
      onCameraDrag: jest.fn(),
    })

    element.dispatchEvent(pointer("pointerdown", 1, 10, 10))
    element.dispatchEvent(pointer("pointerdown", 2, 30, 10))
    element.dispatchEvent(pointer("pointerup", 2, 30, 10))
    expect(coordinator.state).toBe("cameraDrain")
    element.dispatchEvent(pointer("pointermove", 1, 50, 10))
    expect(aim).not.toHaveBeenCalled()
    element.dispatchEvent(pointer("pointerup", 1, 50, 10))
    expect(coordinator.state).toBe("idle")
    coordinator.dispose()
  })

  it("clears captures and state on blur", () => {
    const coordinator = new MobileGestureCoordinator(element, {
      onPrimaryDrag: jest.fn(),
      onCameraDrag: jest.fn(),
    })
    element.dispatchEvent(pointer("pointerdown", 7, 12, 12))
    expect(captured.has(7)).toBe(true)
    globalThis.dispatchEvent(new Event("blur"))
    expect(captured.size).toBe(0)
    expect(coordinator.state).toBe("idle")
    coordinator.dispose()
  })

  it("cannot recurse when releasing capture dispatches lostpointercapture", () => {
    const onReset = jest.fn()
    const coordinator = new MobileGestureCoordinator(element, {
      onPrimaryDrag: jest.fn(),
      onCameraDrag: jest.fn(),
      onReset,
    })
    element.releasePointerCapture = ((id: number) => {
      captured.delete(id)
      element.dispatchEvent(pointer("lostpointercapture", id, 12, 12))
    }) as any

    element.dispatchEvent(pointer("pointerdown", 7, 12, 12))
    globalThis.dispatchEvent(new Event("blur"))

    expect(coordinator.getSnapshot()).toEqual({
      state: "idle",
      pointerCount: 0,
      aimSensitivity: MOBILE_AIM_SENSITIVITY,
    })
    expect(onReset).toHaveBeenCalledTimes(1)
    coordinator.dispose()
  })
})
