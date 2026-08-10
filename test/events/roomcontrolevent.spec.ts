import { EventUtil } from "../../src/events/eventutil"
import { RoomControlEvent } from "../../src/events/roomcontrolevent"

describe("RoomControlEvent", () => {
  it("round trips additive room protocol messages", () => {
    const original = new RoomControlEvent("CLAIM", "room-one", {
      matchId: "match-one",
      rackNumber: 3,
      hostClientId: "player-one",
      lifecycle: "waiting",
      settings: {
        ruleType: "nineball",
        physicalTable: "american-walnut",
        targetScore: "7",
        tournamentOptions: { nineBallPushOut: true },
      },
    })
    original.clientId = "player-one"
    original.sequence = "stream:4"
    const restored = EventUtil.fromSerialised(EventUtil.serialise(original))
    expect(restored).toBeInstanceOf(RoomControlEvent)
    expect(restored).toMatchObject({
      action: "CLAIM",
      roomInstanceId: "room-one",
      clientId: "player-one",
      sequence: "stream:4",
    })
    expect((restored as RoomControlEvent).payload.settings).toEqual(
      original.payload.settings
    )
  })
})
