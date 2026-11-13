import type {ConcivClient} from '../client/promise/index.js'

export interface ServerRef {
  readonly id: string
  readonly name: string
  readonly url: string
  readonly password?: string
  readonly client: ConcivClient
  readonly local: boolean
  readonly builtin: boolean
  readonly compatible: boolean
  readonly connected: boolean
}

export interface Servers {
  list(): readonly string[]
  /**
   * A listed server's ref. The same ref for the same id.
   *
   * @param id - The server's id, as `list()` returns it.
   * @returns Undefined while the app does not list the server.
   *
   * @example
   * ```ts
   * const builtin = () => ctx.servers.list().map((id) => ctx.servers.get(id)).find((server) => server?.builtin)
   * ```
   */
  get(id: string): ServerRef | undefined
}
