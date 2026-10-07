import {
  appendRoomJournal,
  clearRoomState,
  loadRoomState,
  saveRoomState,
} from "../../../src/network/client/roomstate"

describe("persisted room state", () => {
  const state = {
    version: 2 as const,
    tableId: "room-channel",
    clientId: "player-one",
    roomInstanceId: "room-instance",
    matchId: "match-one",
    rackNumber: 2,
    revision: 12,
    savedAt: Date.now(),
    adminAssistAuthorised: true,
    snapshot: {
      table: { balls: [] },
      scores: { p1: 3, p2: 2, breakScore: 1 },
      p1ClientId: "player-one",
      activeClientId: "player-one",
      phase: "aim" as const,
      p1type: 1,
      currentBreak: 1,
      previousBreak: 0,
    },
    journal: [] as string[],
  }

  beforeEach(() => localStorage.clear())

  it("stores, journals and clears a room snapshot", () => {
    expect(saveRoomState(state)).toBe(true)
    appendRoomJournal(state.tableId, state.clientId, '{"type":"AIM"}')
    expect(loadRoomState(state.tableId, state.clientId)?.journal).toEqual([
      '{"type":"AIM"}',
    ])
    expect(
      loadRoomState(state.tableId, state.clientId)?.adminAssistAuthorised
    ).toBe(true)
    clearRoomState(state.tableId, state.clientId)
    expect(loadRoomState(state.tableId, state.clientId)).toBeUndefined()
  })

  it("drops snapshots older than 24 hours", () => {
    saveRoomState({ ...state, savedAt: 1000 })
    expect(
      loadRoomState(
        state.tableId,
        state.clientId,
        1000 + 24 * 60 * 60 * 1000 + 1
      )
    ).toBeUndefined()
  })

  it("ignores and removes a corrupted local snapshot", () => {
    const storageKey = `${"break-builder.room-state.v2"}:${state.tableId}:${state.clientId}`
    localStorage.setItem(storageKey, "{not-json")
    expect(loadRoomState(state.tableId, state.clientId)).toBeUndefined()
    expect(localStorage.getItem(storageKey)).toBeNull()
  })
})
