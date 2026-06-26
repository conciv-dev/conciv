import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {start, type Engine} from '@mandarax/core/engine'
import whiteboard from '../../src/server.js'

export type Stack = {
  engine: Engine
  core: string
  extBase: string
  dir: string
  stop: () => Promise<void>
}

export async function bootStack(): Promise<Stack> {
  const dir = mkdtempSync(join(tmpdir(), 'mx-whiteboard-'))
  const engine = await start({
    options: {stateRoot: dir, harnessBin: 'true'},
    root: dir,
    launchEditor: () => {},
    extensions: [whiteboard],
  })
  const core = `http://127.0.0.1:${engine.port}`
  const extBase = `${core}/api/ext/whiteboard`
  const stop = async (): Promise<void> => {
    await engine.stop()
    rmSync(dir, {recursive: true, force: true})
  }
  return {engine, core, extBase, dir, stop}
}
