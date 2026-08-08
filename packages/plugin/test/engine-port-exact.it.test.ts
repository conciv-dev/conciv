import {createServer} from 'node:net'
import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {describe, expect, it} from 'vitest'
import getPort from 'get-port'
import {NO_BUILTINS} from '@conciv/extension-compiler/extensions'
import {makeEngineBooter} from '../src/core/boot.js'
import type {Engine} from '@conciv/core/start'

function holdPort(port: number): Promise<() => Promise<void>> {
  const blocker = createServer()
  return new Promise((resolve, reject) => {
    blocker.once('error', reject)
    blocker.listen(port, '127.0.0.1', () => resolve(() => new Promise<void>((done) => blocker.close(() => done()))))
  })
}

function tempRoot(): string {
  return mkdtempSync(join(tmpdir(), 'conciv-engine-port-exact-'))
}

describe('makeEngineBooter with the exact port policy (Next.js and the generic webpack/rspack plugin)', () => {
  it('boots on the requested fixed port', async () => {
    const root = tempRoot()
    let engine: Engine | undefined
    try {
      const port = await getPort()
      engine = await makeEngineBooter({port, stateRoot: root}, root, NO_BUILTINS, 'exact')()
      expect(engine.port).toBe(port)
    } finally {
      await engine?.stop()
      rmSync(root, {recursive: true, force: true})
    }
  })

  it('fails loudly instead of silently landing on another port when the exact port is taken', async () => {
    const root = tempRoot()
    const taken = await getPort()
    const release = await holdPort(taken)
    try {
      await expect(
        makeEngineBooter({port: taken, stateRoot: root}, root, NO_BUILTINS, 'exact')(),
      ).rejects.toMatchObject({code: 'EADDRINUSE'})
    } finally {
      await release()
      rmSync(root, {recursive: true, force: true})
    }
  })
})
