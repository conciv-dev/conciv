import {Result} from 'effect'
import {z} from 'zod'
import {HubAccessSchema} from './chat-types.js'

const TriggerPositionSchema = z.enum([
  'top-left',
  'top-right',
  'middle-left',
  'middle-right',
  'bottom-left',
  'bottom-right',
])

export type TriggerPosition = z.infer<typeof TriggerPositionSchema>

export const LogLevelSchema = z.enum(['off', 'error', 'warn', 'info', 'debug', 'trace'])
export type LogLevel = z.infer<typeof LogLevelSchema>

export function readLogLevel(sources: {
  readonly flag?: string | undefined
  readonly env?: string | undefined
  readonly config?: LogLevel | undefined
}): LogLevel {
  const named = [sources.flag, sources.env, sources.config].find((value) => value !== undefined && value !== '')
  const parsed = LogLevelSchema.safeParse(named?.toLowerCase())
  return parsed.success ? parsed.data : 'off'
}

export type Retention = {
  readonly value: number
  readonly unit: 'd' | 'h' | 'm'
  readonly totalMinutes: number
  readonly totalMs: number
}

const RETENTION_FORMAT = /^(\d+)(d|h|m)$/

const RETENTION_MINUTES = {m: 1, h: 60, d: 24 * 60} as const

function isRetentionUnit(value: string | undefined): value is Retention['unit'] {
  return value === 'd' || value === 'h' || value === 'm'
}

export function parseRetention(retention: string): Result.Result<Retention, string> {
  const [, digits, unit] = RETENTION_FORMAT.exec(retention) ?? []
  if (digits === undefined || !isRetentionUnit(unit)) {
    return Result.fail(
      `Invalid retention format: "${retention}". The retention value must be a number followed by a unit: d (days), h (hours), or m (minutes), e.g., "30d", "24h", or "60m"`,
    )
  }
  const value = Number(digits)
  const totalMinutes = value * RETENTION_MINUTES[unit]
  return Result.succeed({value, unit, totalMinutes, totalMs: totalMinutes * 60 * 1000})
}

const LogRetentionSchema = z.string().superRefine((value, context) => {
  const parsed = parseRetention(value)
  if (Result.isFailure(parsed)) context.addIssue({code: 'custom', message: parsed.failure})
})

const ModalConfigSchema = z.object({position: TriggerPositionSchema.optional()})

const QuickTerminalConfigSchema = z.object({hotkey: z.union([z.string(), z.array(z.string())]).optional()})

export type ConcivSurface = 'page' | 'dock'

const WidgetConfigSchema = z.object({
  modal: z.union([z.boolean(), ModalConfigSchema]).optional(),
  quickTerminal: z.union([z.boolean(), QuickTerminalConfigSchema]).optional(),
})

export type WidgetConfig = z.infer<typeof WidgetConfigSchema>

export interface ConcivSettingsInit extends WidgetConfig {
  defaultOpen?: boolean

  launcher?: 'native' | 'mascot' | false

  surface?: ConcivSurface
}

export interface ExtensionRegistry {}

const ExtensionPackageSchema = z.object({
  server: z.string().min(1),
  client: z.string().min(1),
  config: z.unknown().optional(),
})

export type ExtensionPackage = z.infer<typeof ExtensionPackageSchema>

const PolicyStatementSchema = z.object({
  action: z.enum([
    'provider.use',
    'tool.use',
    'integration.connect',
    'integration.use',
    'mcp.use',
    'skill.use',
    'plugin.use',
    'websearch.use',
  ]),
  resource: z.string(),
  effect: z.enum(['allow', 'deny']),
})

const PluginEntrySchema = z.union([z.string(), z.tuple([z.string(), z.record(z.string(), z.json())])], {
  error: (issue) =>
    Array.isArray(issue.input) && typeof issue.input[0] === 'string'
      ? `plugin "${issue.input[0]}": the entry must be [name, options] and every option value must be JSON (a string, number, boolean, null, array or object)`
      : undefined,
})

const PermissionEffectSchema = z.enum(['allow', 'deny', 'ask'])

const PermissionRuleSchema = z.object({action: z.string(), resource: z.string(), effect: PermissionEffectSchema})

const PermissionShortSchema = z.union([
  PermissionEffectSchema,
  z.record(z.string(), z.union([PermissionEffectSchema, z.record(z.string(), PermissionEffectSchema)])),
])

export const ConcivConfigSchema = z.object({
  enabled: z.boolean().optional(),
  plugins: z.array(PluginEntrySchema).readonly().optional(),
  policies: z.array(PolicyStatementSchema).readonly().optional(),
  permission: PermissionShortSchema.optional(),
  permissions: z.array(PermissionRuleSchema).readonly().optional(),
  widget: z.union([WidgetConfigSchema, z.literal(false)]).optional(),
  stateRoot: z.string().optional(),
  harness: z.string().optional(),
  sessionId: z.string().optional(),
  port: z.number().optional(),
  devEndpointDir: z.string().optional(),
  homeDir: z.string().optional(),
  hubAccess: HubAccessSchema.optional(),
  systemPrompt: z.union([z.string(), z.boolean()]).optional(),
  claudeSessionId: z.string().optional(),
  logRetention: LogRetentionSchema.optional().describe(
    'How long the engine keeps its stored logs: a number and d, h or m, e.g. 7d (the default), 24h or 60m',
  ),
  logLevel: LogLevelSchema.optional().describe(
    'The lowest engine and widget log level kept: off (the default), error, warn, info, debug or trace',
  ),
})

export type ConcivConfig = z.infer<typeof ConcivConfigSchema>

export function defineConfig<T extends ConcivConfig>(config: T): T {
  return config
}
