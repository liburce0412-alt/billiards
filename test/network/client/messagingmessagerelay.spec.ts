import { MessagingMessageRelay } from "../../../src/network/client/messagingmessagerelay"

type SocketListener = (event: any) => void

class FakeWebSocket {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSED = 3
  static instances: FakeWebSocket[] = []

  readonly listeners = new Map<string, SocketListener[]>()
  readonly sent: string[] = []
  readyState = FakeWebSocket.CONNECTING
  closeCode?: number

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this)
  }

  addEventListener(type: string, listener: SocketListener) {
    const listeners = this.listeners.get(type) ?? []
    listeners.push(listener)
    this.listeners.set(type, listeners)
  }

  send(payload: string) {
    this.sent.push(payload)
  }

  close(code = 1000) {
    this.readyState = FakeWebSocket.CLOSED
    this.closeCode = code
  }

  open() {
    this.readyState = FakeWebSocket.OPEN
    this.emit("open", {})
  }

  message(payload: unknown) {
    this.emit("message", { data: payload })
  }

  private emit(type: string, event: unknown) {
    for (const listener of this.listeners.get(type) ?? []) listener(event)
  }
}

describe("MessagingMessageRelay", () => {
  const originalWebSocket = globalThis.WebSocket

  beforeEach(() => {
    FakeWebSocket.instances = []
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket
  })

  afterEach(() => {
    globalThis.WebSocket = originalWebSocket
  })

  it("connects only to the first-party authenticated game socket", () => {
    const relay = new MessagingMessageRelay("room id")
    relay.subscribe("ignored", jest.fn())

    expect(FakeWebSocket.instances).toHaveLength(1)
    expect(FakeWebSocket.instances[0].url).toBe(
      "ws://localhost/ws/game/room%20id"
    )
  })

  it("queues events until connected and stamps a monotonic client sequence", () => {
    const relay = new MessagingMessageRelay("room-1")
    relay.subscribe("ignored", jest.fn())
    const socket = FakeWebSocket.instances[0]

    relay.publish("ignored", JSON.stringify({ type: "AIM", angle: 1 }))
    relay.publish("ignored", JSON.stringify({ type: "HIT", power: 0.7 }))
    expect(socket.sent).toHaveLength(0)

    socket.open()
    expect(socket.sent.map((payload) => JSON.parse(payload))).toEqual([
      {
        type: "game.event",
        clientSeq: 1,
        event: { type: "AIM", angle: 1 },
      },
      {
        type: "game.event",
        clientSeq: 2,
        event: { type: "HIT", power: 0.7 },
      },
    ])
  })

  it("delivers ordered server events and ignores repeated resync entries", () => {
    const callback = jest.fn()
    const relay = new MessagingMessageRelay("room-1")
    relay.subscribe("ignored", callback)
    const socket = FakeWebSocket.instances[0]
    socket.open()

    socket.message(
      JSON.stringify({
        type: "game.event",
        seq: 4,
        event: { type: "AIM", angle: 0.5 },
      })
    )
    socket.message(
      JSON.stringify({
        type: "game.resync",
        events: [
          { seq: 4, event: { type: "AIM", angle: 0.5 } },
          { seq: 5, event: { type: "HIT", power: 0.8 } },
        ],
      })
    )

    expect(callback).toHaveBeenCalledTimes(2)
    expect(callback).toHaveBeenNthCalledWith(
      1,
      JSON.stringify({ type: "AIM", angle: 0.5 })
    )
    expect(callback).toHaveBeenNthCalledWith(
      2,
      JSON.stringify({ type: "HIT", power: 0.8 })
    )
  })

  it("uses the authoritative room state and sends ready independently", () => {
    const relay = new MessagingMessageRelay("room-1")
    const onRoomJoined = jest.fn()
    const onRoomState = jest.fn()
    const onRoomStarted = jest.fn()
    relay.onRoomJoined = onRoomJoined
    relay.onRoomState = onRoomState
    relay.onRoomStarted = onRoomStarted
    relay.subscribe("ignored", jest.fn())
    const socket = FakeWebSocket.instances[0]
    socket.open()

    relay.setReady(true)
    const waiting = {
      version: 1 as const,
      revision: 2,
      phase: "waiting" as const,
      ready: { host: true, player: false },
      startedAt: null,
      members: [],
    }
    socket.message(
      JSON.stringify({ type: "room.joined", role: "host", roomState: waiting })
    )
    socket.message(
      JSON.stringify({
        type: "room.started",
        breakerUserId: "host-id",
        roomState: { ...waiting, phase: "active", revision: 3 },
      })
    )

    expect(JSON.parse(socket.sent[0])).toEqual({
      type: "room.ready.set",
      ready: true,
    })
    expect(onRoomJoined).toHaveBeenCalledWith("host")
    expect(onRoomState).toHaveBeenCalledWith(waiting)
    expect(onRoomStarted).toHaveBeenCalledWith(
      "host-id",
      expect.objectContaining({ phase: "active", revision: 3 })
    )
  })

  it("does nothing without a server-issued room id", () => {
    const relay = new MessagingMessageRelay()
    relay.subscribe("ignored", jest.fn())
    relay.publish("ignored", JSON.stringify({ type: "HIT" }))

    expect(FakeWebSocket.instances).toHaveLength(0)
  })
})
