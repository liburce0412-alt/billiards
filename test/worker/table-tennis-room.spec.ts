import { env, runInDurableObject } from "cloudflare:test"
import { beforeEach, describe, expect, it } from "vitest"
import type { PlatformEnv } from "../../server/env"
import { roomSchema } from "../../server/api/rooms"
import { validTableTennisInput } from "../../server/table-tennis-protocol"

it("validates optional racket technique and independent side spin while accepting old inputs", () => {
  const input = { kind: "swing", seq: 4, aimX: 0, power: 0.4, spin: -0.5 }
  expect(validTableTennisInput(input)).toBe(true)
  expect(
    validTableTennisInput({ ...input, technique: "topspin", sideSpin: 0.8 })
  ).toBe(true)
  expect(validTableTennisInput({ ...input, technique: "teleport" })).toBe(false)
  expect(validTableTennisInput({ ...input, sideSpin: 1.01 })).toBe(false)
  expect(validTableTennisInput({ ...input, sideSpin: Number.NaN })).toBe(false)
})

type Envelope = {
  type: string
  phase?: string
  code?: string
  player?: number
  state?: { tick: number; scores: number[]; winner?: number }
  ready?: boolean[]
  acks?: number[]
  paused?: boolean
}

function inbox(socket: WebSocket) {
  const messages: Envelope[] = []
  socket.addEventListener("message", (event) => {
    messages.push(JSON.parse(String(event.data)))
  })
  return async (
    type: string,
    matches = (_message: Envelope) => true
  ): Promise<Envelope> => {
    const until = Date.now() + 3000
    while (Date.now() < until) {
      const index = messages.findIndex(
        (message) => message.type === type && matches(message)
      )
      if (index >= 0) return messages.splice(index, 1)[0]
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
    throw new Error(
      `Timed out waiting for ${type}; received ${JSON.stringify(messages)}`
    )
  }
}

async function connect(
  stub: DurableObjectStub,
  roomId: string,
  role: "host" | "player" | "spectator"
) {
  const response = await stub.fetch("https://room.test/?v=1", {
    headers: {
      Upgrade: "websocket",
      "X-Platform-Room-Id": roomId,
      "X-Platform-User-Id": `${role}-user`,
      "X-Platform-Display-Name": role,
      "X-Platform-Member-Role": role,
    },
  })
  expect(response.status).toBe(101)
  const socket = response.webSocket!
  const receive = inbox(socket)
  socket.accept()
  await receive("tt.joined")
  return { socket, receive }
}

async function match() {
  const id = crypto.randomUUID()
  await env.DB.prepare(
    "INSERT INTO game_rooms(id,status) VALUES (?, 'waiting')"
  )
    .bind(id)
    .run()
  const stub = (env as unknown as PlatformEnv).TABLE_TENNIS_ROOMS.getByName(id)
  const host = await connect(stub, id, "host")
  const guest = await connect(stub, id, "player")
  return { id, stub, host, guest }
}

async function start(game: Awaited<ReturnType<typeof match>>) {
  game.host.socket.send(JSON.stringify({ type: "tt.ready", ready: true }))
  await game.host.receive("tt.room", (message) => Boolean(message.ready?.[0]))
  game.guest.socket.send(JSON.stringify({ type: "tt.ready", ready: true }))
  await game.host.receive("tt.room", (message) => message.phase === "active")
}

describe("table tennis room", () => {
  beforeEach(async () => {
    await env.DB.prepare(
      "CREATE TABLE IF NOT EXISTS game_rooms(id TEXT PRIMARY KEY,status TEXT,started_at INTEGER,ended_at INTEGER)"
    ).run()
    await env.DB.prepare(
      "CREATE TABLE IF NOT EXISTS table_tennis_results(id TEXT PRIMARY KEY,room_id TEXT,host_id TEXT,guest_id TEXT,winner_id TEXT,reason TEXT,score_json TEXT,started_at INTEGER,ended_at INTEGER)"
    ).run()
  })

  it("keeps old create-room payloads billiards and validates the separate game", () => {
    expect(
      roomSchema.parse({
        ruleType: "eightball",
        tableStyle: "american-ivory",
        environmentStyle: "spectra",
      }).gameType
    ).toBe("billiards")
    expect(
      roomSchema.parse({
        gameType: "table-tennis",
        environmentStyle: "sports-hall",
      })
    ).toMatchObject({
      ruleType: "singles-11",
      tableStyle: "standard",
      options: { bestOf: 3 },
    })
    expect(
      roomSchema.safeParse({
        gameType: "table-tennis",
        ruleType: "eightball",
        environmentStyle: "sports-hall",
      }).success
    ).toBe(false)
  })

  it("rejects a mismatched protocol before accepting a socket", async () => {
    const stub = (env as unknown as PlatformEnv).TABLE_TENNIS_ROOMS.getByName(
      crypto.randomUUID()
    )
    const response = await stub.fetch("https://room.test/?v=2", {
      headers: { Upgrade: "websocket" },
    })
    expect(response.status).toBe(409)
  })

  it("requires both players ready and never accepts a client-authored score", async () => {
    const game = await match()
    game.host.socket.send(JSON.stringify({ type: "tt.ready", ready: true }))
    const waiting = await game.host.receive("tt.room", (message) =>
      Boolean(message.ready?.[0])
    )
    expect(waiting.phase).toBe("waiting")
    game.guest.socket.send(JSON.stringify({ type: "tt.ready", ready: true }))
    await game.host.receive("tt.room", (message) => message.phase === "active")
    game.host.socket.send(
      JSON.stringify({
        type: "tt.input",
        version: 1,
        seq: 1,
        input: { winner: 0, scores: [11, 0] },
      })
    )
    expect((await game.host.receive("tt.error")).code).toBe("invalid_input")
    const snapshot = await game.host.receive("tt.snapshot")
    expect(snapshot.state?.tick).toBeGreaterThan(0)
    expect(snapshot.state?.scores).toEqual([0, 0])
    game.host.socket.close()
    game.guest.socket.close()
  })

  it("keeps spectators read-only", async () => {
    const game = await match()
    const viewer = await connect(game.stub, game.id, "spectator")
    viewer.socket.send(JSON.stringify({ type: "tt.ready", ready: true }))
    expect((await viewer.receive("tt.error")).code).toBe("spectator_read_only")
    viewer.socket.close()
    game.host.socket.close()
    game.guest.socket.close()
  })

  it("keeps publishing authoritative steps while both players send no input", async () => {
    const game = await match()
    await start(game)
    const initial = await game.host.receive("tt.snapshot")
    // Real workerd timers, without fake time, pings or injected game state.
    await new Promise((resolve) => setTimeout(resolve, 6000))
    const later = await game.host.receive(
      "tt.snapshot",
      (message) =>
        (message.state?.tick ?? 0) >= (initial.state?.tick ?? 0) + 600
    )
    expect(later.paused).toBe(false)
    await runInDurableObject(game.stub, async (instance: any) => {
      expect(instance.room.phase).toBe("active")
      expect(instance.room.ready).toEqual([true, true])
    })
    game.host.socket.close()
    game.guest.socket.close()
  }, 15000)

  it("ignores stale input sequences and preserves the active match when a tab reconnects", async () => {
    const game = await match()
    await start(game)
    const send = (seq: number) =>
      game.host.socket.send(
        JSON.stringify({
          type: "tt.input",
          version: 1,
          seq,
          input: { kind: "swing", seq, aimX: 0, power: 0.5, spin: 0 },
        })
      )
    send(10)
    send(9)
    const ack = await game.host.receive(
      "tt.snapshot",
      (message) => message.acks?.[0] === 10
    )
    expect(ack.acks?.[0]).toBe(10)
    const replacement = await connect(game.stub, game.id, "host")
    const continued = await replacement.receive("tt.room")
    expect(continued.phase).toBe("active")
    replacement.socket.send(
      JSON.stringify({
        type: "tt.input",
        version: 1,
        seq: 0,
        input: { kind: "swing", seq: 0, aimX: 0, power: 0.5, spin: 0 },
      })
    )
    await replacement.receive(
      "tt.snapshot",
      (message) => message.acks?.[0] === 0
    )
    replacement.socket.close()
    game.guest.socket.close()
  })

  it("grants exactly thirty seconds then records an authoritative disconnect forfeit", async () => {
    const game = await match()
    await start(game)
    const disconnectedAt = Date.now()
    game.guest.socket.close()
    await game.host.receive("tt.room", (message) => message.phase === "paused")
    await runInDurableObject(game.stub, async (instance: any) => {
      expect(
        instance.room.disconnected[1] - disconnectedAt
      ).toBeGreaterThanOrEqual(30_000)
      expect(instance.room.disconnected[1] - disconnectedAt).toBeLessThan(
        30_500
      )
      // Move only the persisted grace deadline; no game state or score is authored by a client.
      instance.room.disconnected[1] = Date.now() - 1
      await instance.alarm()
    })
    await game.host.receive("tt.room", (message) => message.phase === "ended")
    const result = await env.DB.prepare(
      "SELECT winner_id,reason FROM table_tennis_results WHERE id = ?"
    )
      .bind(game.id)
      .first()
    expect(result).toMatchObject({ winner_id: "host-user", reason: "forfeit" })
    game.host.socket.close()
  })

  it("pauses a disconnect, resumes after ready, and persists server-owned forfeits once", async () => {
    const game = await match()
    await start(game)
    game.guest.socket.close()
    await game.host.receive("tt.room", (message) => message.phase === "paused")
    const rejoined = await connect(game.stub, game.id, "player")
    rejoined.socket.send(JSON.stringify({ type: "tt.ready", ready: true }))
    await game.host.receive("tt.room", (message) => message.phase === "active")
    rejoined.socket.send(JSON.stringify({ type: "tt.concede" }))
    await game.host.receive("tt.room", (message) => message.phase === "ended")
    await runInDurableObject(game.stub, async () => undefined)
    const result = await env.DB.prepare(
      "SELECT winner_id,reason FROM table_tennis_results WHERE id = ?"
    )
      .bind(game.id)
      .first()
    expect(result).toMatchObject({ winner_id: "host-user", reason: "forfeit" })
    rejoined.socket.send(JSON.stringify({ type: "tt.concede" }))
    expect(
      (
        await env.DB.prepare(
          "SELECT count(*) AS count FROM table_tennis_results WHERE id = ?"
        )
          .bind(game.id)
          .first<{ count: number }>()
      )?.count
    ).toBe(1)
    rejoined.socket.close()
    game.host.socket.close()
  })
})
