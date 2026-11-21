declare module 'virtual:conciv-test-plugins' {
  type PluginModule = {default: {setup?: (ctx: never) => void} & Record<string, unknown>}
  export const plugins: Record<string, {id: string; load: () => Promise<PluginModule>} | undefined>
}
