declare module 'virtual:conciv-test-plugins' {
  type PluginModule = {default: {setup?: (ctx: never) => void} & Record<string, unknown>}
  export const loaders: ((() => Promise<PluginModule>) | undefined)[]
}
