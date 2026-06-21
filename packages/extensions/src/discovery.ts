import type {
  MandaraxExtension,
  ServerApi,
  ServerServices,
  ExtensionEvent,
  EventCtx,
  ApprovalPolicy,
  ExtensionServerContributions,
  ExtensionServerTool,
  ToolDefinition,
  EffectDefinition,
} from './contract.js'
import type {LiveDb} from '@mandarax/protocol/db-types'
import type {SyncEngine} from '@mandarax/protocol/sync-types'

// Client virtual-module body: glob every extension file and feed its default export to use() (+ HMR).
export function extensionsModuleSource(): string {
  return `
const mods = import.meta.glob('/mandarax/extensions/*.{ts,tsx,js,jsx}', { eager: true })
const apply = (ext) => {
  if (!ext) return
  const g = (window.__MANDARAX__ ??= {})
  if (g.use) g.use(ext)
  else (g.queue ??= []).push(ext)
}
for (const key of Object.keys(mods)) apply(mods[key].default)
if (import.meta.hot) import.meta.hot.accept()
`
}

// Pi's wrapToolDefinition: adapt an executable def into the wire tool, validating args at the boundary.
export function wrapToolDefinition(def: ToolDefinition): ExtensionServerTool {
  const run = def.execute
  if (!run) throw new Error(`tool ${def.name} has no execute`)
  return {
    name: def.name,
    description: def.description,
    inputSchema: def.parameters,
    execute: async (input, ctx) => run(def.parameters.parse(input), ctx),
  }
}

// Wrap an execute-bearing def into a wire tool (render-only defs contribute none); append its prompt text.
function addServerTool(tools: ExtensionServerTool[], systemPrompt: string[], t: ToolDefinition): void {
  if (t.execute) tools.push(wrapToolDefinition(t))
  if (t.promptSnippet) systemPrompt.push(t.promptSnippet)
  if (t.promptGuidelines?.length) systemPrompt.push(...t.promptGuidelines)
}

function unavailable(name: string): never {
  throw new Error(`${name} is not available until services are wired (boot)`)
}

const NO_DB: LiveDb = {
  collection: () => unavailable('mx.db'),
  list: () => unavailable('mx.db'),
  get: () => unavailable('mx.db'),
}
const NO_SYNC: SyncEngine = {room: () => unavailable('mx.sync')}

// Gather wire tools + system prompt + event handlers + approval policies from each extension's
// tools[] and its imperative serverFn, threading the core-owned db/sync services into the api.
export function collectServerContributions(
  extensions: MandaraxExtension[],
  services?: ServerServices,
): ExtensionServerContributions {
  const tools: ExtensionServerTool[] = []
  const systemPrompt: string[] = []
  const eventHandlers: Record<ExtensionEvent, ((ctx: EventCtx) => void | Promise<void>)[]> = {
    session_start: [],
    tool_execution_start: [],
  }
  const approvalPolicies: Record<string, ApprovalPolicy> = {}
  const api: ServerApi = {
    registerTool: (t) => addServerTool(tools, systemPrompt, t),
    systemPrompt: {append: (text) => systemPrompt.push(text)},
    db: services?.db ?? NO_DB,
    sync: services?.sync ?? NO_SYNC,
    on: (event, handler) => void eventHandlers[event].push(handler),
    approval: (toolName, policy) => void (approvalPolicies[toolName] = policy),
  }
  for (const ext of extensions) {
    for (const t of ext.tools ?? []) addServerTool(tools, systemPrompt, t)
    ext.serverFn?.(api)
  }
  return {tools, systemPrompt, eventHandlers, approvalPolicies}
}

// The client half: tools that carry a renderer (matched by name in the widget) + the effects.
export function collectClientContributions(extensions: MandaraxExtension[]): {
  tools: ToolDefinition[]
  effects: EffectDefinition[]
} {
  const tools: ToolDefinition[] = []
  const effects: EffectDefinition[] = []
  for (const ext of extensions) {
    for (const t of ext.tools ?? []) if (t.renderCall || t.renderResult) tools.push(t)
    for (const e of ext.effects ?? []) effects.push(e)
  }
  return {tools, effects}
}
