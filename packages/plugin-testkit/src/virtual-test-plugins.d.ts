declare module 'virtual:conciv-test-plugins' {
  type PluginModule = {default: import('@conciv/plugin/experimental').Plugin.Definition}
  export const loaders: ((() => Promise<PluginModule>) | undefined)[]
}

declare module 'virtual:conciv-test.css' {}
