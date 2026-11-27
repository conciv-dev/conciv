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

export const LOGS_QUERY = 'logs_query'

const LogsQueryInput = z.object({
  since: z.string().max(64).optional().describe('ISO time; only events at or after it'),
  until: z.string().max(64).optional().describe('ISO time; only events at or before it'),
  level: z
    .array(z.enum(['error', 'warn', 'info', 'debug', 'trace', 'fatal']))
    .max(6)
    .optional()
    .describe('only these levels'),
  source: z.enum(['engine', 'client']).optional().describe('engine logs or the widget (client) logs'),
  text: z.string().max(1024).optional().describe('matches the message and the other fields'),
  sessionId: z.string().max(256).optional().describe('only the events of this session'),
  limit: z.number().int().min(1).max(2000).default(200),
})

export type LogsQueryInput = z.infer<typeof LogsQueryInput>

export function logsQueryTool(ctx: ConcivToolContext): ConcivServerTool {
  return {
    name: LOGS_QUERY,
    description:
      'Read the conciv engine and widget logs the engine stored, newest first. Answers the engine log level and the events; when the level is off nothing is stored, so raise it with set_log_level first.',
    inputSchema: LogsQueryInput,
    execute: async (input) => ctx.queryLogs(LogsQueryInput.parse(input)),
  }
}
