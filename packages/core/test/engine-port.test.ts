import {test, expect} from 'vitest'
import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {start} from '../src/engine.js'

test('start boots on the requested fixed port', async () => {
  const engine = await start({
    options: {harnessBin: 'true'},
    root: mkdtempSync(join(tmpdir(), 'conciv-engine-port-')),
    launchEditor: () => {},
    port: 41799,
  })
  expect(engine.port).toBe(41799)
  await engine.stop()
}, 120000)
