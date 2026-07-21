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
      options: {harnessBin: 'true'},
      root,
      launchEditor: () => {},
      accessToken: 'tok-hook',
      onClientRequest: () => {
        fired += 1
      },
    })
    try {
      expect(fired).toBe(0)
      await fetch(`http://127.0.0.1:${engine.port}/t/tok-hook/health`)
      await fetch(`http://127.0.0.1:${engine.port}/t/tok-hook/health`)
      expect(fired).toBe(1)
    } finally {
      await engine.stop()
    }
  } finally {
    rmSync(root, {recursive: true, force: true})
  }
})
