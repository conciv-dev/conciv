import {describe, expect} from 'vitest'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import {NodeFileSystem} from '@effect/platform-node'
import {Cause, Effect, Exit, Layer} from 'effect'
import {testEffect} from '../lib/effect'
import {EffectFlock} from '../../../src/util/effect-flock.js'
import {FSUtil} from '../../../src/util/fs-util.js'
import {Global} from '../../../src/util/global.js'
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

const testGlobal = Global.layerWith({
  cache: os.tmpdir(),
  state: os.tmpdir(),
})

const testLayer = EffectFlock.layer.pipe(
  Layer.provide(testGlobal),
  Layer.provide(FSUtil.layer),
  Layer.provide(NodeFileSystem.layer),
)

describe('util.effect-flock', () => {
  const it = testEffect(testLayer)

  it.live(
    'acquire and release via scoped Effect',
    Effect.gen(function* () {
      const flock = yield* EffectFlock.Service
      const tmp = (yield* Effect.acquireDisposable(Effect.promise(() => tmpdir('eflock-test-')))).path
      const dir = path.join(tmp, 'locks')
      const lockDir = lock(dir, 'eflock:acquire')

      yield* Effect.scoped(flock.acquire('eflock:acquire', dir))

      expect(yield* Effect.promise(() => exists(lockDir))).toBe(false)
    }),
  )

  it.live(
    'supports an acquisition timeout',
    Effect.gen(function* () {
      const flock = yield* EffectFlock.Service
      const tmp = (yield* Effect.acquireDisposable(Effect.promise(() => tmpdir('eflock-test-')))).path
      const dir = path.join(tmp, 'locks')
      const key = 'eflock:timeout'

      yield* Effect.scoped(
        Effect.gen(function* () {
          yield* flock.acquire(key, dir)
          const error = yield* Effect.scoped(flock.acquire(key, dir, {staleMs: 10_000, timeoutMs: 300})).pipe(
            Effect.flip,
          )
          expect(error._tag).toBe('LockTimeoutError')
        }),
      )
    }),
  )

  it.live(
    'withLock data-first',
    Effect.gen(function* () {
      const flock = yield* EffectFlock.Service
      const tmp = (yield* Effect.acquireDisposable(Effect.promise(() => tmpdir('eflock-test-')))).path
      const dir = path.join(tmp, 'locks')

      let hit = false
      yield* flock.withLock(
        Effect.sync(() => {
          hit = true
        }),
        'eflock:df',
        dir,
      )
      expect(hit).toBe(true)
    }),
  )

  it.live(
    'withLock pipeable',
    Effect.gen(function* () {
      const flock = yield* EffectFlock.Service
      const tmp = (yield* Effect.acquireDisposable(Effect.promise(() => tmpdir('eflock-test-')))).path
      const dir = path.join(tmp, 'locks')

      let hit = false
      yield* Effect.sync(() => {
        hit = true
      }).pipe(flock.withLock('eflock:pipe', dir))
      expect(hit).toBe(true)
    }),
  )

  it.live(
    'writes owner metadata',
    Effect.gen(function* () {
      const flock = yield* EffectFlock.Service
      const tmp = (yield* Effect.acquireDisposable(Effect.promise(() => tmpdir('eflock-test-')))).path
      const dir = path.join(tmp, 'locks')
      const key = 'eflock:meta'
      const file = path.join(lock(dir, key), 'meta.json')

      yield* Effect.scoped(
        Effect.gen(function* () {
          yield* flock.acquire(key, dir)
          const json = yield* Effect.promise(() =>
            readJson<{token?: unknown; pid?: unknown; hostname?: unknown; createdAt?: unknown}>(file),
          )
          expect(typeof json.token).toBe('string')
          expect(typeof json.pid).toBe('number')
          expect(typeof json.hostname).toBe('string')
          expect(typeof json.createdAt).toBe('string')
        }),
      )
    }),
  )

  it.live(
    'advances the heartbeat timestamp while the lock is held',
    Effect.gen(function* () {
      const flock = yield* EffectFlock.Service
      const tmp = yield* Effect.promise(() => fs.mkdtemp(path.join(os.tmpdir(), 'eflock-test-')))
      const dir = path.join(tmp, 'locks')
      const heartbeat = path.join(lock(dir, 'eflock:heartbeat'), 'heartbeat')
      yield* Effect.addFinalizer(() => Effect.promise(() => fs.rm(tmp, {recursive: true, force: true})))

      yield* Effect.scoped(
        Effect.gen(function* () {
          yield* flock.acquire('eflock:heartbeat', dir, {staleMs: 300})
          yield* Effect.sleep(150)
          const first = yield* Effect.promise(() => fs.stat(heartbeat))
          yield* Effect.sleep(250)
          const second = yield* Effect.promise(() => fs.stat(heartbeat))

          expect(second.mtimeMs).toBeGreaterThan(first.mtimeMs)
        }),
      )
    }),
  )

  it.live(
    'breaks stale lock dirs',
    Effect.gen(function* () {
      const flock = yield* EffectFlock.Service
      const tmp = (yield* Effect.acquireDisposable(Effect.promise(() => tmpdir('eflock-test-')))).path
      const dir = path.join(tmp, 'locks')
      const key = 'eflock:stale'
      const lockDir = lock(dir, key)

      yield* Effect.promise(async () => {
        await fs.mkdir(lockDir, {recursive: true})
        const old = new Date(Date.now() - 120_000)
        await fs.utimes(lockDir, old, old)
      })

      let hit = false
      yield* flock.withLock(
        Effect.sync(() => {
          hit = true
        }),
        key,
        dir,
      )
      expect(hit).toBe(true)
    }),
  )

  it.live(
    'recovers from stale breaker',
    Effect.gen(function* () {
      const flock = yield* EffectFlock.Service
      const tmp = (yield* Effect.acquireDisposable(Effect.promise(() => tmpdir('eflock-test-')))).path
      const dir = path.join(tmp, 'locks')
      const key = 'eflock:stale-breaker'
      const lockDir = lock(dir, key)
      const breaker = lockDir + '.breaker'

      yield* Effect.promise(async () => {
        await fs.mkdir(lockDir, {recursive: true})
        await fs.mkdir(breaker)
        const old = new Date(Date.now() - 120_000)
        await fs.utimes(lockDir, old, old)
        await fs.utimes(breaker, old, old)
      })

      let hit = false
      yield* flock.withLock(
        Effect.sync(() => {
          hit = true
        }),
        key,
        dir,
      )
      expect(hit).toBe(true)
      expect(yield* Effect.promise(() => exists(breaker))).toBe(false)
    }),
  )

  it.live(
    'detects compromise when lock dir removed',
    Effect.gen(function* () {
      const flock = yield* EffectFlock.Service
      const tmp = (yield* Effect.acquireDisposable(Effect.promise(() => tmpdir('eflock-test-')))).path
      const dir = path.join(tmp, 'locks')
      const key = 'eflock:compromised'
      const lockDir = lock(dir, key)

      const result = yield* flock
        .withLock(
          Effect.promise(() => fs.rm(lockDir, {recursive: true, force: true})),
          key,
          dir,
        )
        .pipe(Effect.exit)

      expect(Exit.isFailure(result)).toBe(true)
      expect(Exit.isFailure(result) ? Cause.pretty(result.cause) : '').toContain('missing')
    }),
  )

  it.live(
    'detects token mismatch',
    Effect.gen(function* () {
      const flock = yield* EffectFlock.Service
      const tmp = (yield* Effect.acquireDisposable(Effect.promise(() => tmpdir('eflock-test-')))).path
      const dir = path.join(tmp, 'locks')
      const key = 'eflock:token'
      const lockDir = lock(dir, key)
      const meta = path.join(lockDir, 'meta.json')

      const result = yield* flock
        .withLock(
          Effect.promise(async () => {
            const json = await readJson<{token?: string}>(meta)
            json.token = 'tampered'
            await fs.writeFile(meta, JSON.stringify(json, null, 2))
          }),
          key,
          dir,
        )
        .pipe(Effect.exit)

      expect(Exit.isFailure(result)).toBe(true)
      expect(Exit.isFailure(result) ? Cause.pretty(result.cause) : '').toContain('token mismatch')
      expect(yield* Effect.promise(() => exists(lockDir))).toBe(true)
    }),
  )

  it.live(
    'fails on unwritable lock roots',
    Effect.gen(function* () {
      if (process.platform === 'win32') return
      const flock = yield* EffectFlock.Service
      const tmp = (yield* Effect.acquireDisposable(Effect.promise(() => tmpdir('eflock-test-')))).path
      const dir = path.join(tmp, 'locks')

      yield* Effect.promise(async () => {
        await fs.mkdir(dir, {recursive: true})
      })
      yield* Effect.addFinalizer(() => Effect.promise(() => fs.chmod(dir, 0o700)))
      yield* Effect.promise(() => fs.chmod(dir, 0o500))

      const result = yield* flock.withLock(Effect.void, 'eflock:perm', dir).pipe(Effect.exit)
      expect(String(result)).toContain('PermissionDenied')
    }),
  )
})
