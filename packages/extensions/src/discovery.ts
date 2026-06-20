import type {
  MandaraxExtension,
  ServerApi,
  ExtensionServerContributions,
  ExtensionServerTool,
  ExtensionTool,
  ToolRenderer,
} from './contract.js'

// The body of the client virtual module the bundler serves: glob every extension file and feed each
// default export to window.__MANDARAX__.use() (queued until the widget installs use()). import.meta
// .glob is a bundler macro, so this string is handed to the bundler's load() hook to expand + HMR.
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

// Convert one collected tool into the wire shape core's MCP server registers; append its prompt text.
function addServerTool(tools: ExtensionServerTool[], systemPrompt: string[], t: ExtensionTool): void {
  if (t.serverExecute) {
    tools.push({name: t.name, description: t.description, inputSchema: t.inputSchema, execute: t.serverExecute})
  }
  if (t.promptSnippet) systemPrompt.push(t.promptSnippet)
  if (t.promptGuidelines?.length) systemPrompt.push(...t.promptGuidelines)
}

// Run each extension's .server(mx => …) half against a collecting ServerApi, also draining its
// declarative tools[], gathering the agent tools + system prompt text the engine should add. Pure:
// the caller loads the modules (the bundler owns transpilation) and passes their default exports here.
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

// The client half of declared tools: each tool's renderer keyed by name, which the widget turns into
// tool cards (ToolCardEntry) and passes to ToolCallCard alongside the built-ins.
export function collectClientContributions(extensions: MandaraxExtension[]): {
  toolRenderers: {name: string; render: ToolRenderer}[]
} {
  const toolRenderers: {name: string; render: ToolRenderer}[] = []
  for (const ext of extensions) {
    for (const t of ext.tools ?? []) {
      if (t.clientRender) toolRenderers.push({name: t.name, render: t.clientRender})
    }
  }
  return {toolRenderers}
}
