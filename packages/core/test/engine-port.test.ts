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
