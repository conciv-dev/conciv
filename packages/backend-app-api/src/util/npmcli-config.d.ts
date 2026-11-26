declare module '@npmcli/config' {
  type NpmConfig = {load(): Promise<void>; readonly flat: Record<string, unknown>}
  const Config: new (options: Record<string, unknown>) => NpmConfig
  export default Config
}

declare module '@npmcli/config/lib/definitions/index.js' {
  const npmDefinitions: {
    readonly definitions: unknown
    readonly flatten: unknown
    readonly nerfDarts: unknown
    readonly shorthands: unknown
  }
  export default npmDefinitions
}
