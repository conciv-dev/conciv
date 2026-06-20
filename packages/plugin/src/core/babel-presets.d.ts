// babel-preset-solid and @babel/preset-typescript ship no type declarations; both default-export a
// babel preset (a PluginTarget) consumed in compile-extension.ts.
declare module 'babel-preset-solid' {
  import type {PluginTarget} from '@babel/core'
  const preset: PluginTarget
  export default preset
}
declare module '@babel/preset-typescript' {
  import type {PluginTarget} from '@babel/core'
  const preset: PluginTarget
  export default preset
}
