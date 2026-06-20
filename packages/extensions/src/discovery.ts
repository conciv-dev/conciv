import type {MandaraxExtension, ServerApi, ExtensionServerContributions, ExtensionServerTool} from './contract.js'

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

// Run each extension's .server(mx => …) half against a collecting ServerApi, gathering the agent
// tools + system prompt text the engine should add. Pure: the caller loads the modules (the bundler
// owns transpilation) and passes their default exports here.
export function collectServerContributions(extensions: MandaraxExtension[]): ExtensionServerContributions {
  const tools: ExtensionServerTool[] = []
  const systemPrompt: string[] = []
  const api: ServerApi = {
    registerTool: (tool) => tools.push(tool),
    systemPrompt: {append: (text) => systemPrompt.push(text)},
  }
  for (const ext of extensions) ext.serverFn?.(api)
  return {tools, systemPrompt}
}
