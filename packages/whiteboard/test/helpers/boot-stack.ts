import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import getPort from 'get-port'
import {createLiveDb, createTrailSupervisor, type TrailSupervisor} from '@mandarax/core/db'
import {createSnapshotStore, createSync, type Sync} from '@mandarax/core/sync'
import {start, type Engine} from '@mandarax/core/engine'
import {collectServerContributions} from '@mandarax/extensions'
import type {LiveDb} from '@mandarax/protocol/db-types'
import whiteboard from '../../src/index.js'

export type Stack = {
  engine: Engine
  sup: TrailSupervisor
  sync: Sync
  db: LiveDb
  dir: string
  core: string
  stop: () => Promise<void>
}

// The real whiteboard stack: a spawned trail + live db + sync engine + the booted core engine with
// the first-party whiteboard extension wired in. Every whiteboard IT builds on this. Each suite gets
// a fresh trail port (getPort) so suites run in parallel without colliding.
export async function bootStack(): Promise<Stack> {
  const dir = mkdtempSync(join(tmpdir(), 'mx-whiteboard-'))
  const trailPort = await getPort()
  const db = createLiveDb({trailBaseUrl: `http://localhost:${trailPort}`, dataDir: dir})
  const sync = createSync({store: createSnapshotStore(db)})
  const sup = createTrailSupervisor({dataDir: dir, port: trailPort})
  await sup.start()
  const engine = await start({
    options: {stateRoot: dir, harnessBin: 'true'},
    root: dir,
    launchEditor: () => {},
    extensions: collectServerContributions([whiteboard], {db, sync: sync.engine}),
    dbProxyTarget: sup.baseUrl,
    syncHooks: sync.hooks,
  })
  const core = `http://127.0.0.1:${engine.port}`
  const stop = async (): Promise<void> => {
    await engine.stop()
    await sup.stop()
    rmSync(dir, {recursive: true, force: true})
  }
  return {engine, sup, sync, db, dir, core, stop}
}
