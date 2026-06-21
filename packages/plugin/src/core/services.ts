import {join} from 'node:path'
import getPort from 'get-port'
import {createTrailSupervisor, createLiveDb} from '@mandarax/core/db'
import {createSnapshotStore, createSync, type Sync} from '@mandarax/core/sync'
import type {ExtensionServerContributions} from '@mandarax/extensions'
import {loadServerContributions} from './extensions.js'

export type BootedServices = {
  extensions: ExtensionServerContributions
  dbProxyTarget: string
  syncHooks: Sync['hooks']
  stop: () => Promise<void>
}

export async function bootServices(root: string, stateRoot: string): Promise<BootedServices> {
  const dataDir = join(stateRoot, '.mandarax', 'trail')
  const trailPort = await getPort()
  const supervisor = createTrailSupervisor({dataDir, port: trailPort})
  const db = createLiveDb({trailBaseUrl: supervisor.baseUrl, dataDir})
  const store = createSnapshotStore(db)
  const sync = createSync({store})
  const extensions = await loadServerContributions(root, {db, sync: sync.engine})
  await supervisor.start()
  return {extensions, dbProxyTarget: supervisor.baseUrl, syncHooks: sync.hooks, stop: () => supervisor.stop()}
}
