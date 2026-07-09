import {homedir} from 'node:os'
import {join} from 'node:path'
import {ensureTrailBinary} from './binary.js'
import {startTrailBase} from './lifecycle.js'
import {recordsClient, type RecordsClient} from './records.js'
import {createTrailBaseSessionStore, type SessionStore} from './session-store.js'
import type {ExtensionTableSpec} from './extension-tables.js'

export type StatePlane = {
  url: string
  port: number
  store: SessionStore
  records: RecordsClient
  stop(): Promise<void>
}

export async function startStatePlane(opts: {
  dataDir: string
  port: number
  cacheDir?: string
  now?: () => number
  extensionTables?: ExtensionTableSpec[]
  allowedOrigins?: string[]
}): Promise<StatePlane> {
  const binary = await ensureTrailBinary({cacheDir: opts.cacheDir ?? join(homedir(), '.cache/conciv/trailbase')})
  const server = await startTrailBase({
    binary,
    dataDir: opts.dataDir,
    port: opts.port,
    extensionTables: opts.extensionTables,
    allowedOrigins: opts.allowedOrigins,
  })
  return {
    url: server.url,
    port: server.port,
    store: createTrailBaseSessionStore({baseUrl: server.url, now: opts.now}),
    records: recordsClient(server.url),
    stop: server.stop,
  }
}
