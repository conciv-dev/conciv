import {fileURLToPath} from 'node:url'
import {createJazzContext, type JazzContext} from 'jazz-tools/backend'
import {deploy} from 'jazz-tools/dev'
import {afterAll, beforeAll, describe, it} from 'vitest'
import {startJazzRunner, type JazzRunner} from '../src/server/jazz/runner.js'
import {app} from '../src/shared/schema.js'
import permissions from '../src/shared/permissions.js'

const schemaDir = fileURLToPath(new URL('../src/shared', import.meta.url))

const connect = (runner: JazzRunner): JazzContext =>
  createJazzContext({
    appId: runner.appId,
    app,
    permissions,
    driver: {type: 'memory'},
    serverUrl: runner.serverUrl,
    backendSecret: runner.backendSecret,
  })

const state: {runner: JazzRunner} = {runner: undefined as never}

beforeAll(async () => {
  state.runner = await startJazzRunner({inMemory: true})
  await deploy({
    serverUrl: state.runner.serverUrl,
    appId: state.runner.appId,
    adminSecret: state.runner.adminSecret,
    schemaDir,
  })
})

afterAll(async () => {
  await state.runner?.stop()
})

describe('two clients over the deployed jazz server', () => {
  it('propagates a write from one connection to another connection subscription', async () => {
    const writer = connect(state.runner)
    const reader = connect(state.runner)
    const writerDb = writer.asBackend()
    const readerDb = reader.asBackend()
    const room = 'local:peer-sync'

    const observed = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('reader never observed the write')), 15000)
      const unsubscribe = readerDb.subscribeAll(app.canvasElements.where({room}), (delta) => {
        if (!delta.all.some((row) => row.elementId === 'peer-rect')) return
        clearTimeout(timeout)
        unsubscribe()
        resolve()
      })
    })

    await writerDb
      .insert(app.canvasElements, {room, elementId: 'peer-rect', data: {kind: 'rectangle'}, version: 1})
      .wait({tier: 'edge'})
    await observed

    await writer.shutdown()
    await reader.shutdown()
  })
})
