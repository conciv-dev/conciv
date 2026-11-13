import {describe, expect, test} from 'vitest'
import fs from 'fs/promises'
import path from 'path'
import {Flock} from '../../../src/util/flock.js'
import {Hash} from '../../../src/util/hash.js'
import {tmpdir} from '../fixture/tmpdir'

function lock(dir: string, key: string) {
  return path.join(dir, Hash.fast(key) + '.lock')
}

async function exists(file: string) {
  return fs
    .stat(file)
    .then(() => true)
    .catch(() => false)
}

async function readJson<T>(p: string): Promise<T> {
  return JSON.parse(await fs.readFile(p, 'utf8'))
}

describe('util.flock', () => {
  test('breaks stale lock dirs when heartbeat is missing', async () => {
    await using tmp = await tmpdir('flock-test-')
    const dir = path.join(tmp.path, 'locks')
    const key = 'flock:missing-heartbeat'
    const lockDir = lock(dir, key)

    await fs.mkdir(lockDir, {recursive: true})
    const old = new Date(Date.now() - 2_000)
    await fs.utimes(lockDir, old, old)

    let hit = false
    await Flock.withLock(
      key,
      async () => {
        hit = true
      },
      {
        dir,
        staleMs: 200,
        timeoutMs: 3_000,
      },
    )

    expect(hit).toBe(true)
  })

  test('recovers when a stale breaker claim was left behind', async () => {
    await using tmp = await tmpdir('flock-test-')
    const dir = path.join(tmp.path, 'locks')
    const key = 'flock:stale-breaker'
    const lockDir = lock(dir, key)
    const breaker = lockDir + '.breaker'

    await fs.mkdir(lockDir, {recursive: true})
    await fs.mkdir(breaker)

    const old = new Date(Date.now() - 2_000)
    await fs.utimes(lockDir, old, old)
    await fs.utimes(breaker, old, old)

    let hit = false
    await Flock.withLock(
      key,
      async () => {
        hit = true
      },
      {
        dir,
        staleMs: 200,
        timeoutMs: 3_000,
      },
    )

    expect(hit).toBe(true)
    expect(await exists(breaker)).toBe(false)
  })

  test('fails clearly if lock dir is removed while held', async () => {
    await using tmp = await tmpdir('flock-test-')
    const dir = path.join(tmp.path, 'locks')
    const key = 'flock:compromised'
    const lockDir = lock(dir, key)

    const err = await Flock.withLock(
      key,
      async () => {
        await fs.rm(lockDir, {
          recursive: true,
          force: true,
        })
      },
      {
        dir,
        staleMs: 1_000,
        timeoutMs: 3_000,
      },
    ).catch((err) => err)

    expect(err).toBeInstanceOf(Error)
    if (!(err instanceof Error)) throw err
    expect(err.message).toContain('compromised')

    let hit = false
    await Flock.withLock(
      key,
      async () => {
        hit = true
      },
      {
        dir,
        staleMs: 200,
        timeoutMs: 3_000,
      },
    )
    expect(hit).toBe(true)
  })

  test('writes owner metadata while lock is held', async () => {
    await using tmp = await tmpdir('flock-test-')
    const dir = path.join(tmp.path, 'locks')
    const key = 'flock:meta'
    const file = path.join(lock(dir, key), 'meta.json')

    await Flock.withLock(
      key,
      async () => {
        const json = await readJson<{
          token?: unknown
          pid?: unknown
          hostname?: unknown
          createdAt?: unknown
        }>(file)

        expect(typeof json.token).toBe('string')
        expect(typeof json.pid).toBe('number')
        expect(typeof json.hostname).toBe('string')
        expect(typeof json.createdAt).toBe('string')
      },
      {
        dir,
        staleMs: 1_000,
        timeoutMs: 3_000,
      },
    )
  })

  test('supports acquire with await using', async () => {
    await using tmp = await tmpdir('flock-test-')
    const dir = path.join(tmp.path, 'locks')
    const key = 'flock:acquire'
    const lockDir = lock(dir, key)

    {
      await using _ = await Flock.acquire(key, {
        dir,
        staleMs: 1_000,
        timeoutMs: 3_000,
      })
      expect(await exists(lockDir)).toBe(true)
    }

    expect(await exists(lockDir)).toBe(false)
  })

  test('refuses token mismatch release and recovers from stale', async () => {
    await using tmp = await tmpdir('flock-test-')
    const dir = path.join(tmp.path, 'locks')
    const key = 'flock:token'
    const lockDir = lock(dir, key)
    const meta = path.join(lockDir, 'meta.json')

    const err = await Flock.withLock(
      key,
      async () => {
        const json = await readJson<{token?: string}>(meta)
        json.token = 'tampered'
        await fs.writeFile(meta, JSON.stringify(json, null, 2))
      },
      {
        dir,
        staleMs: 500,
        timeoutMs: 3_000,
      },
    ).catch((err) => err)

    expect(err).toBeInstanceOf(Error)
    if (!(err instanceof Error)) throw err
    expect(err.message).toContain('token mismatch')
    expect(await exists(lockDir)).toBe(true)

    let hit = false
    await Flock.withLock(
      key,
      async () => {
        hit = true
      },
      {
        dir,
        staleMs: 500,
        timeoutMs: 6_000,
      },
    )
    expect(hit).toBe(true)
  })

  test('fails clearly on unwritable lock roots', async () => {
    if (process.platform === 'win32') return

    await using tmp = await tmpdir('flock-test-')
    const dir = path.join(tmp.path, 'locks')
    const key = 'flock:perm'

    await fs.mkdir(dir, {recursive: true})
    await fs.chmod(dir, 0o500)

    try {
      const err = await Flock.withLock(key, async () => {}, {
        dir,
        staleMs: 100,
        timeoutMs: 500,
      }).catch((err) => err)

      expect(err).toBeInstanceOf(Error)
      if (!(err instanceof Error)) throw err
      const text = err.message
      expect(text.includes('EACCES') || text.includes('EPERM')).toBe(true)
    } finally {
      await fs.chmod(dir, 0o700)
    }
  })
})
