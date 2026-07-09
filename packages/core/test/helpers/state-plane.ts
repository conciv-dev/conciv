import {chmodSync, mkdirSync, mkdtempSync, writeFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'
import {afterAll, beforeAll, beforeEach} from 'vitest'
import getPort from 'get-port'
import {startStatePlane, type StatePlane} from '@conciv/state/server'
import {start, type Engine, type StartOpts} from '../../src/engine.js'

const require = createRequire(import.meta.url)
const tsxEntry = fileURLToPath(pathToFileURL(require.resolve('tsx')))
const fakeClaudePath = fileURLToPath(new URL('../fixtures/fake-claude.ts', import.meta.url))

export function fakeClaudeBinDir(stateRoot: string): string {
  const binDir = join(stateRoot, 'fake-bin')
  mkdirSync(binDir, {recursive: true})
  const shim = join(binDir, 'claude')
  writeFileSync(shim, `#!/bin/sh\nexec "${process.execPath}" --import "${tsxEntry}" "${fakeClaudePath}" "$@"\n`)
  chmodSync(shim, 0o755)
  return binDir
}

export async function startTestStore(now?: () => number): Promise<StatePlane> {
  return startStatePlane({dataDir: mkdtempSync(join(tmpdir(), 'conciv-depot-')), port: await getPort(), now})
}

export function useTestStorePlane(now?: () => number): () => StatePlane {
  const holder: {plane: StatePlane | undefined} = {plane: undefined}
  const plane = () => {
    if (!holder.plane) throw new Error('state plane not started (beforeAll has not run)')
    return holder.plane
  }
  beforeAll(async () => {
    holder.plane = await startTestStore(now)
  }, 120000)
  afterAll(async () => holder.plane?.stop())
  beforeEach(async () => {
    const store = plane().store
    for (const record of await store.list()) await store.delete(record.id)
  })
  return plane
}

export async function startTestEngine(overrides: Partial<StartOpts> = {}): Promise<Engine> {
  const root = mkdtempSync(join(tmpdir(), 'conciv-engine-'))
  const binDir = fakeClaudeBinDir(root)
  return start({
    options: {},
    root,
    launchEditor: () => {},
    childEnv: () => ({...process.env, PATH: `${binDir}:${process.env.PATH ?? ''}`}),
    ...overrides,
  })
}
