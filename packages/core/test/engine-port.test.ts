import {createServer} from 'node:net'
import {mkdtempSync, readFileSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {test, expect} from 'vitest'
import getPort from 'get-port'
import {start} from '../src/start.js'
import {statePaths} from '../src/lib/state-paths.js'

function bootEngine(root: string) {
  return start({
    options: {harnessBin: 'true', stateRoot: root, systemPrompt: false},
    root,
    launchEditor: () => {},
  })
}

function recordedPort(root: string): unknown {
  return JSON.parse(readFileSync(statePaths(root).server, 'utf8'))
}

function holdPort(port: number): Promise<() => Promise<void>> {
  const blocker = createServer()
  return new Promise((resolve, reject) => {
    blocker.once('error', reject)
    blocker.listen(port, '127.0.0.1', () => resolve(() => new Promise<void>((done) => blocker.close(() => done()))))
  })
}

test('start boots on the requested fixed port', async () => {
  const root = mkdtempSync(join(tmpdir(), 'conciv-engine-port-'))
  try {
    const engine = await start({
      options: {harnessBin: 'true', stateRoot: root},
      root,
      launchEditor: () => {},
      port: {exact: 41799},
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

test('an exact port that is already taken fails loudly instead of landing somewhere else', async () => {
  const root = mkdtempSync(join(tmpdir(), 'conciv-engine-port-'))
  const taken = await getPort()
  const release = await holdPort(taken)
  try {
    await expect(
      start({options: {harnessBin: 'true', stateRoot: root}, root, launchEditor: () => {}, port: {exact: taken}}),
    ).rejects.toMatchObject({code: 'EADDRINUSE'})
  } finally {
    await release()
    rmSync(root, {recursive: true, force: true})
  }
})

test('a preferred port that is already taken falls back to a free port the engine really serves on', async () => {
  const rootFirst = mkdtempSync(join(tmpdir(), 'conciv-engine-port-'))
  const rootSecond = mkdtempSync(join(tmpdir(), 'conciv-engine-port-'))
  const preferred = await getPort()
  const first = await start({
    options: {harnessBin: 'true', stateRoot: rootFirst},
    root: rootFirst,
    launchEditor: () => {},
    port: {preferred},
  })
  try {
    expect(first.port).toBe(preferred)
    const second = await start({
      options: {harnessBin: 'true', stateRoot: rootSecond},
      root: rootSecond,
      launchEditor: () => {},
      port: {preferred},
    })
    try {
      expect(second.port).not.toBe(preferred)
      expect((await fetch(`http://127.0.0.1:${second.port}/health`)).ok).toBe(true)
      expect((await fetch(`http://127.0.0.1:${first.port}/health`)).ok).toBe(true)
    } finally {
      await second.stop()
    }
  } finally {
    await first.stop()
    rmSync(rootFirst, {recursive: true, force: true})
    rmSync(rootSecond, {recursive: true, force: true})
  }
}, 20_000)

test('a fresh boot takes its port straight from the listening socket, leaving it free for nobody', async () => {
  const root = mkdtempSync(join(tmpdir(), 'conciv-engine-port-'))
  try {
    const engine = await bootEngine(root)
    const port = engine.port
    await engine.stop()
    expect(await getPort({port})).toBe(port)
  } finally {
    rmSync(root, {recursive: true, force: true})
  }
})

test('start reuses the port persisted in the state dir across restarts', async () => {
  const root = mkdtempSync(join(tmpdir(), 'conciv-engine-port-'))
  try {
    const first = await bootEngine(root)
    const firstPort = first.port
    await first.stop()
    expect(recordedPort(root)).toEqual({port: firstPort})

    const second = await bootEngine(root)
    try {
      expect(second.port).toBe(firstPort)
    } finally {
      await second.stop()
    }
    expect(recordedPort(root)).toEqual({port: firstPort})
  } finally {
    rmSync(root, {recursive: true, force: true})
  }
})

test('start falls back to a free port and records it when the persisted port is taken', async () => {
  const root = mkdtempSync(join(tmpdir(), 'conciv-engine-port-'))
  try {
    const first = await bootEngine(root)
    const takenPort = first.port
    await first.stop()

    const release = await holdPort(takenPort)
    try {
      const second = await bootEngine(root)
      try {
        expect(second.port).not.toBe(takenPort)
        expect(recordedPort(root)).toEqual({port: second.port})
      } finally {
        await second.stop()
      }
    } finally {
      await release()
    }
  } finally {
    rmSync(root, {recursive: true, force: true})
  }
})
