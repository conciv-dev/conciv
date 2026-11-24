declare module '@npmcli/config' {
  type ConfigOptions = {
    readonly npmPath: string
    readonly cwd: string
    readonly env: Readonly<Record<string, string | undefined>>
    readonly argv: readonly string[]
    readonly execPath: string
    readonly platform: string
    readonly definitions: unknown
    readonly flatten: unknown
    readonly nerfDarts: unknown
    readonly shorthands: unknown
    readonly warn: boolean
  }
  export default class Config {
    constructor(options: ConfigOptions)
    load(): Promise<void>
    readonly flat: Readonly<Record<string, unknown>>
  }
}

declare module '@npmcli/config/lib/definitions/index.js' {
  const definitions: {
    readonly definitions: unknown
    readonly flatten: unknown
    readonly nerfDarts: unknown
    readonly shorthands: unknown
  }
  export default definitions
}
