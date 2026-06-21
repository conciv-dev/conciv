import type {
  MandaraxExtension,
  ServerApi,
  ExtensionServerContributions,
  ExtensionServerTool,
  ToolDefinition,
  EffectDefinition,
} from './contract.js'

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
    execute: async (input) => run(def.parameters.parse(input)),
  }
}

// Wrap an execute-bearing def into a wire tool (render-only defs contribute none); append its prompt text.
function addServerTool(tools: ExtensionServerTool[], systemPrompt: string[], t: ToolDefinition): void {
  if (t.execute) tools.push(wrapToolDefinition(t))
  if (t.promptSnippet) systemPrompt.push(t.promptSnippet)
  if (t.promptGuidelines?.length) systemPrompt.push(...t.promptGuidelines)
}

// Gather the wire tools + system-prompt text from each extension's tools[] and its imperative serverFn.
export function collectServerContributions(extensions: MandaraxExtension[]): ExtensionServerContributions {
  const tools: ExtensionServerTool[] = []
  const systemPrompt: string[] = []
  const api: ServerApi = {
    registerTool: (t) => addServerTool(tools, systemPrompt, t),
    systemPrompt: {append: (text) => systemPrompt.push(text)},
  }
  for (const ext of extensions) {
    for (const t of ext.tools ?? []) addServerTool(tools, systemPrompt, t)
    ext.serverFn?.(api)
  }
  return {tools, systemPrompt}
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
