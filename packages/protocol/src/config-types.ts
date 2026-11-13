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

const ModalConfigSchema = z.object({position: TriggerPositionSchema.optional()})

export type ModalConfig = z.infer<typeof ModalConfigSchema>

const QuickTerminalConfigSchema = z.object({hotkey: z.union([z.string(), z.array(z.string())]).optional()})

export type QuickTerminalConfig = z.infer<typeof QuickTerminalConfigSchema>

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

export const ConcivConfigSchema = z.object({
  enabled: z.boolean().optional(),
  extensions: z.array(ExtensionPackageSchema).readonly().optional(),
  plugins: z.array(PluginEntrySchema).readonly().optional(),
  policies: z.array(PolicyStatementSchema).readonly().optional(),
  widgetUrl: z.string().optional(),
  widget: z.union([WidgetConfigSchema, z.literal(false)]).optional(),
  stateRoot: z.string().optional(),
  harness: z.string().optional(),
  harnessBin: z.string().optional(),
  sessionId: z.string().optional(),
  port: z.number().optional(),
  devEndpointDir: z.string().optional(),
  homeDir: z.string().optional(),
  hubAccess: HubAccessSchema.optional(),
  systemPrompt: z.union([z.string(), z.boolean()]).optional(),
  claudePath: z.string().optional(),
  claudeSessionId: z.string().optional(),
})

export type ConcivConfig = z.infer<typeof ConcivConfigSchema>

export function defineConfig<T extends ConcivConfig>(config: T): T {
  return config
}
