import {createToolRegistry, type ToolRegistry} from '@conciv/extension/registry'
import {createSessionBus, type SessionBus} from '../sessions/session-bus.js'

export type SessionPrimitives = {
  stream: SessionBus
  registry: ToolRegistry
}

export function makeSessionPrimitives(): SessionPrimitives {
  return {
    stream: createSessionBus(),
    registry: createToolRegistry(),
  }
}
