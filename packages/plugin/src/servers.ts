import type {RpcApi} from './rpc.js'

export interface ConcivClient {
  readonly rpc: RpcApi
}

/**
 * A server the app lists. One ref per id that follows the live connection: read `client` and `url` from it each time,
 * as a restarted server gets a new connection under the same id.
 */
export interface ServerRef {
  /** The server's id. */
  readonly id: string
  /** Display name; the id when the server has none. */
  readonly name: string
  /** The server's base URL. */
  readonly url: string
  /** The HTTP basic password the user configured; undefined when there is none. */
  readonly password?: string
  /** The server's API client. */
  readonly client: ConcivClient
  /** The app's own local server, or a loopback http connection to its port. */
  readonly local: boolean
  /** The server the plugin runs in. */
  readonly builtin: boolean
  /** The server's version works with this app; false after a health check found it incompatible. */
  readonly compatible: boolean
  /** The event connection to this server is up. */
  readonly connected: boolean
}

/** The servers the app lists. */
export interface Servers {
  /** Ids of the servers the app lists (`ServerRef.id`). */
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
