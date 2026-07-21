import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {test, expect} from 'vitest'
import {start} from '../src/start.js'

test('start boots on the requested fixed port', async () => {
  const root = mkdtempSync(join(tmpdir(), 'conciv-engine-port-'))
  try {
    const engine = await start({
      options: {harnessBin: 'true', stateRoot: root},
      root,
      launchEditor: () => {},
      port: 41799,
    })
    try {
      expect(engine.port).toBe(41799)
    } finally {
      await engine.stop()
    }
  } finally {
    rmSync(root, {recursive: true, force: true})
  }
})
