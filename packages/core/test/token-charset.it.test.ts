import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {test, expect} from 'vitest'
import {start, type Engine} from '../src/start.js'

function tempRoot(): string {
  return mkdtempSync(join(tmpdir(), 'conciv-token-charset-'))
}

async function bootWithToken(root: string, accessToken: string): Promise<Engine> {
  return start({
    options: {harnessBin: 'true', stateRoot: root},
    root,
    launchEditor: () => {},
    accessToken,
  })
}

test.each([':a', '*', 'a/b', 'a%2Fb', 'tokeñ', '', 'abc'])(
  'the invalid token %j refuses to boot with a constraint-naming error',
  async (token) => {
    const root = tempRoot()
    let engine: Engine | undefined
    try {
      await expect(async () => {
        engine = await bootWithToken(root, token)
      }).rejects.toThrow('accessToken must be a UUID pairing token')
    } finally {
      await engine?.stop()
      rmSync(root, {recursive: true, force: true})
    }
  },
)

test('a wildcard-degrading token never mounts, so no foreign prefix is served', async () => {
  const root = tempRoot()
  let engine: Engine | undefined
  try {
    let served: number | undefined
    try {
      engine = await bootWithToken(root, ':a')
      const probe = await fetch(`http://127.0.0.1:${engine.port}/t/x/health`)
      served = probe.status
    } catch (error) {
      expect(error).toBeInstanceOf(Error)
    }
    expect(served).toBeUndefined()
  } finally {
    await engine?.stop()
    rmSync(root, {recursive: true, force: true})
  }
})

test('a UUID-style token boots and serves only under its own prefix', async () => {
  const root = tempRoot()
  const token = '3f2504e0-4f89-41d3-9a0c-0305e82c3301'
  const engine = await bootWithToken(root, token)
  try {
    const health = await fetch(`http://127.0.0.1:${engine.port}/t/${token}/health`)
    const wrong = await fetch(`http://127.0.0.1:${engine.port}/t/some-other-token/health`)
    expect(health.status).toBe(200)
    expect(wrong.status).toBe(404)
  } finally {
    await engine.stop()
    rmSync(root, {recursive: true, force: true})
  }
})
