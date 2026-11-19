import {createSessionBus, type SessionBus} from '../sessions/session-bus.js'

export type SessionPrimitives = {
  stream: SessionBus
}

export function makeSessionPrimitives(): SessionPrimitives {
  return {
    stream: createSessionBus(),
  }
}
