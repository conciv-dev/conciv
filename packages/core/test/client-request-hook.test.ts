import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {test, expect} from 'vitest'
import {start} from '../src/start.js'

test('onClientRequest fires once on the first token request', async () => {
  const root = mkdtempSync(join(tmpdir(), 'conciv-client-request-hook-'))
  let fired = 0
  try {
    const engine = await start({
      options: {harnessBin: 'true', stateRoot: root},
      root,
      launchEditor: () => {},
      accessToken: '0b6f9c2e-8f6d-4a5c-9e1f-2d3a4b5c6d7e',
      onClientRequest: () => {
        fired += 1
      },
    })
    try {
      expect(fired).toBe(0)
      await fetch(`http://127.0.0.1:${engine.port}/t/0b6f9c2e-8f6d-4a5c-9e1f-2d3a4b5c6d7e/health`)
      await fetch(`http://127.0.0.1:${engine.port}/t/0b6f9c2e-8f6d-4a5c-9e1f-2d3a4b5c6d7e/health`)
      expect(fired).toBe(1)
    } finally {
      await engine.stop()
    }
  } finally {
    rmSync(root, {recursive: true, force: true})
  }
})
