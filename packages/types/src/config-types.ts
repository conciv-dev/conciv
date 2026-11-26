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
  enabled: z
    .boolean()
    .optional()
    .describe('false turns conciv off: no engine starts and no widget is added. Default: true.'),
  plugins: z
    .array(PluginEntrySchema)
    .readonly()
    .optional()
    .describe(
      'Plugins to load: a package name or a path, or [name, options] where every option value is JSON. Default: none.',
    ),
  policies: z
    .array(PolicyStatementSchema)
    .readonly()
    .optional()
    .describe(
      'Rules that allow or deny whole kinds of use, such as plugin.use for a plugin. effect is allow or deny. Default: none.',
    ),
  permission: PermissionShortSchema.optional().describe('Permission rules in short form. Default: none.'),
  permissions: z
    .array(PermissionRuleSchema)
    .readonly()
    .optional()
    .describe('Permission rules in full form, applied after permission. Default: none.'),
  widget: z
    .union([WidgetConfigSchema, z.literal(false)])
    .optional()
    .describe(
      'The two layouts, modal and quickTerminal. false adds no widget to the page; the engine still runs, for a widget you render yourself. Default: both layouts on.',
    ),
  stateRoot: z
    .string()
    .optional()
    .describe('The folder that holds the .conciv state folder. Default: the project root.'),
  harness: z
    .string()
    .optional()
    .describe('The harness a new chat starts with: claude, codex, opencode, gemini-cli or pi. Default: claude.'),
  sessionId: z
    .string()
    .optional()
    .describe(
      'A conciv session id (ses_...). The engine makes sure this session exists when it starts. Any other value stops the engine with an error.',
    ),
  port: z
    .number()
    .optional()
    .describe('The engine port. Default: the port the engine used last time in this project, or a free one.'),
  devEndpointDir: z
    .string()
    .optional()
    .describe('The folder for dev-endpoint.json, the file the iOS SDK reads to find the engine. Default: ~/.conciv.'),
  homeDir: z
    .string()
    .optional()
    .describe(
      'Where conciv keeps the data it shares across projects, such as the agents you connected. Default: your platform data folder.',
    ),
  hubAccess: HubAccessSchema.optional().describe(
    'Whether an agent connected from outside, such as your own terminal agent, has to be allowed in the tab first. Default: open.',
  ),
  systemPrompt: z
    .union([z.string(), z.boolean()])
    .optional()
    .describe(
      "The prompt conciv gives the harness: a string replaces conciv's built-in prompt, false gives none. Default: the built-in prompt.",
    ),
  claudeSessionId: z
    .string()
    .optional()
    .describe(
      'A harness session id: up to 128 letters, digits, _ and -. The engine makes sure a conciv session for it exists when it starts.',
    ),
})

export type ConcivConfig = z.infer<typeof ConcivConfigSchema>

export function defineConfig<T extends ConcivConfig>(config: T): T {
  return config
}
