import {z} from 'zod'
import {LogLevelSchema, type LogLevel} from '@conciv/types/config-types'
import type {ConcivServerTool, ConcivToolContext} from './types.js'

export const SET_LOG_LEVEL = 'set_log_level'

const SetLogLevelInput = z.object({
  level: LogLevelSchema.describe('off, error, warn, info, debug or trace'),
  scope: z
    .enum(['engine', 'widget', 'all'])
    .describe('engine logs, the widget (browser) logs, or both; widget logs can carry page data'),
})

export type SetLogLevelInput = z.infer<typeof SetLogLevelInput>

const PAGE_DATA_LEVELS: readonly LogLevel[] = ['info', 'debug', 'trace']

export function exposesPageData(input: SetLogLevelInput): boolean {
  return input.scope !== 'engine' && PAGE_DATA_LEVELS.includes(input.level)
}

export function setLogLevelTool(ctx: ConcivToolContext): ConcivServerTool {
  return {
    name: SET_LOG_LEVEL,
    description:
      'Turn conciv logs on or off while you debug: sets the lowest log level kept for the engine, the widget, or both, and answers the levels now in force. Logs are off by default. Raising the widget above warn asks the user first.',
    inputSchema: SetLogLevelInput,
    execute: async (input) => ctx.setLogLevel(SetLogLevelInput.parse(input)),
  }
}
