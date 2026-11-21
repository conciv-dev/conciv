declare module 'virtual:conciv-test-plugins' {
  type PluginModule = {default: {setup?: (ctx: never) => void} & Record<string, unknown>}
  type TestPlugin = {id: string; kind: 'host'; load: () => Promise<PluginModule>} | {id: string; kind: 'engine'}
  export const plugins: Record<string, TestPlugin | undefined>
}
