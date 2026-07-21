import {test, expect} from 'vitest'
import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {start} from '../src/start.js'

test('start boots on the requested fixed port', async () => {
  const stateRoot = mkdtempSync(join(tmpdir(), 'conciv-engine-port-'))
  const engine = await start({
    options: {harnessBin: 'true', stateRoot},
    root: process.cwd(),
    launchEditor: () => {},
    port: 41799,
  })
  expect(engine.port).toBe(41799)
  await engine.stop()
  rmSync(stateRoot, {recursive: true, force: true})
})
