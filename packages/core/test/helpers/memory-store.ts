import {createStorage} from 'unstorage'
import memoryDriver from 'unstorage/drivers/memory'
import {createSessionStore, type SessionStore} from '../../src/store/session-store.js'

export const memoryStore = (now: () => number = () => 1): SessionStore =>
  createSessionStore(createStorage({driver: memoryDriver()}), now)
