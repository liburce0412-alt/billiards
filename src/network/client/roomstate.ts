import { RejoinSnapshot } from "../../events/rejoinevent"

export interface PersistedRoomState {
  version: 2
  tableId: string
  clientId: string
  roomInstanceId: string
  matchId: string
  rackNumber: number
  revision: number
  savedAt: number
  /** Local-only proof that this administrator manually played in this rack. */
  adminAssistAuthorised?: boolean
  snapshot: RejoinSnapshot
  journal: string[]
}

const maxAgeMs = 24 * 60 * 60 * 1000
const journalLimit = 64

function key(tableId: string, clientId: string): string {
  return `break-builder.room-state.v2:${tableId}:${clientId}`
}

export function loadRoomState(
  tableId: string,
  clientId: string,
  now = Date.now()
): PersistedRoomState | undefined {
  try {
    const raw = localStorage.getItem(key(tableId, clientId))
    if (!raw) return undefined
    const state = JSON.parse(raw) as PersistedRoomState
    if (
      state.version !== 2 ||
      state.tableId !== tableId ||
      state.clientId !== clientId ||
      now - state.savedAt > maxAgeMs
    ) {
      localStorage.removeItem(key(tableId, clientId))
      return undefined
    }
    return state
  } catch {
    try {
      localStorage.removeItem(key(tableId, clientId))
    } catch {
      // Storage can be disabled entirely.
    }
    return undefined
  }
}

export function saveRoomState(state: PersistedRoomState): boolean {
  try {
    localStorage.setItem(
      key(state.tableId, state.clientId),
      JSON.stringify(state)
    )
    return true
  } catch {
    return false
  }
}

export function appendRoomJournal(
  tableId: string,
  clientId: string,
  serialisedEvent: string
): void {
  const state = loadRoomState(tableId, clientId)
  if (!state) return
  state.journal.push(serialisedEvent)
  state.journal = state.journal.slice(-journalLimit)
  state.savedAt = Date.now()
  saveRoomState(state)
}

export function clearRoomState(tableId: string, clientId: string): void {
  try {
    localStorage.removeItem(key(tableId, clientId))
  } catch {
    // Storage is optional. Peer recovery remains available.
  }
}
