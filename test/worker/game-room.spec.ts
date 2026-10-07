import { env } from "cloudflare:test"
import { beforeEach, describe, expect, it } from "vitest"

type SocketEnvelope = {
  type: string
  role?: string
  code?: string
  event?: Record<string, unknown>
  members?: Array<{
    userId: string
    username: string
    displayName: string
    cueStyle: string
  }>
  roomState?: {
    phase: string
    ready: { host: boolean; player: boolean }
  }
}

function nextMessage(socket: WebSocket): Promise<SocketEnvelope> {
  return new Promise((resolve) => {
    socket.addEventListener(
      "message",
      (event) => resolve(JSON.parse(String(event.data)) as SocketEnvelope),
      { once: true }
    )
  })
}

async function connect(
  stub: DurableObjectStub,
  roomId: string,
  userId: string,
  role: "host" | "player" | "spectator"
) {
  const response = await stub.fetch("https://room.test/", {
    headers: {
      Upgrade: "websocket",
      "X-Platform-Room-Id": roomId,
      "X-Platform-User-Id": userId,
      "X-Platform-Username": encodeURIComponent(`${role}_handle`),
      "X-Platform-Display-Name": encodeURIComponent(`玩家-${role}`),
      "X-Platform-Cue-Style": role === "host" ? "heritage" : "jade",
      "X-Platform-Member-Role": role,
    },
  })
  expect(response.status).toBe(101)
  const socket = response.webSocket!
  socket.accept()
  return socket
}

async function waitForType(
  socket: WebSocket,
  type: string,
  predicate: (message: SocketEnvelope) => boolean = () => true
) {
  for (;;) {
    const message = await nextMessage(socket)
    if (message.type === type && predicate(message)) return message
  }
}

describe("GameRoom durable state", () => {
  beforeEach(async () => {
    await env.DB.prepare(
      "CREATE TABLE IF NOT EXISTS game_rooms (id TEXT PRIMARY KEY, status TEXT NOT NULL, started_at INTEGER, ended_at INTEGER)"
    ).run()
    await env.DB.prepare(
      "CREATE TABLE IF NOT EXISTS match_invites (id TEXT PRIMARY KEY, room_id TEXT NOT NULL, status TEXT NOT NULL, responded_at INTEGER)"
    ).run()
  })

  it("starts exactly from authoritative ready state and stamps chat identity", async () => {
    const roomId = crypto.randomUUID()
    const stub = env.GAME_ROOMS.getByName(roomId)
    const host = await connect(stub, roomId, "host-user", "host")
    const hostJoined = await waitForType(host, "room.joined")
    expect(hostJoined.members).toContainEqual(
      expect.objectContaining({
        userId: "host-user",
        username: "host_handle",
        displayName: "玩家-host",
        cueStyle: "heritage",
      })
    )
    const player = await connect(stub, roomId, "player-user", "player")
    await waitForType(player, "room.joined")

    host.send(JSON.stringify({ type: "room.ready.set", ready: true }))
    const hostReady = await waitForType(
      host,
      "room.state",
      (message) => message.roomState?.ready.host === true
    )
    expect(hostReady.roomState?.ready.host).toBe(true)
    expect(hostReady.roomState?.phase).toBe("waiting")

    player.send(JSON.stringify({ type: "room.ready.set", ready: true }))
    const started = await waitForType(host, "room.started")
    expect(started.roomState?.phase).toBe("active")
    expect(started.roomState?.ready).toEqual({ host: true, player: true })

    const chatPromise = waitForType(player, "game.event")
    host.send(
      JSON.stringify({
        type: "game.event",
        clientSeq: 1,
        event: {
          type: "CHAT",
          message: "  一起开球  ",
          sender: "forged-user",
          senderName: "伪造名字",
        },
      })
    )
    const chat = await chatPromise
    expect(chat.event).toMatchObject({
      type: "CHAT",
      message: "一起开球",
      sender: "host-user",
      senderName: "玩家-host",
      clientId: "host-user",
    })

    host.close()
    player.close()
  })

  it("keeps spectators read-only", async () => {
    const roomId = crypto.randomUUID()
    const stub = env.GAME_ROOMS.getByName(roomId)
    const spectator = await connect(stub, roomId, "viewer-user", "spectator")
    await waitForType(spectator, "room.joined")
    spectator.send(JSON.stringify({ type: "room.ready.set", ready: true }))

    const error = await waitForType(spectator, "room.error")
    expect(error.code).toBe("spectator_read_only")
    spectator.close()
  })
})
