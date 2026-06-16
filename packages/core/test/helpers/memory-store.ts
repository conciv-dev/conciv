import {createStorage} from 'unstorage'
import memoryDriver from 'unstorage/drivers/memory'
import {createSessionStore, type SessionStore} from '../../src/store/session-store.js'

// A real memory-driver-backed SessionStore for tests — not a mock; same code path as prod, just a
// swapped unstorage driver. Deterministic `now` so timestamps are stable.
export const memoryStore = (now: () => number = () => 1): SessionStore =>
  createSessionStore(createStorage({driver: memoryDriver()}), now)
