import {createEngine, engineCommands as engineCommandsOn, type EngineCommandHandlers} from '@internal/engine-kit'

export type {EngineCommandHandlers}

export function engineCommands(): {commands: EngineCommandHandlers; close: () => Promise<void>} {
  return engineCommandsOn(createEngine, async () => (await import('@conciv/backend-defaults/backend')).createBackend)
}
