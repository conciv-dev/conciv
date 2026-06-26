import {createJazzContext} from 'jazz-tools/backend'
import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {startJazzRunner, type JazzRunner} from '../src/server/jazz/runner.js'
import {app} from '../src/shared/schema.js'
import permissions from '../src/shared/permissions.js'

const state: {runner: JazzRunner} = {runner: undefined as never}

beforeAll(async () => {
  state.runner = await startJazzRunner({inMemory: true})
})

afterAll(async () => {
  await state.runner?.stop()
})

describe('startJazzRunner', () => {
  it('resolves with a reachable server url and app id', () => {
    expect(state.runner.serverUrl).toMatch(/^http/)
    expect(state.runner.appId.length).toBeGreaterThan(0)
  })

  it('serves the whiteboard schema so a backend can write and read a scoped row', async () => {
    const context = createJazzContext({
      appId: state.runner.appId,
      app,
      permissions,
      driver: {type: 'memory'},
      serverUrl: state.runner.serverUrl,
      backendSecret: state.runner.backendSecret,
    })
    const db = context.asBackend()
    const written = db.insert(app.canvasElements, {
      room: 'local:local',
      elementId: 'rect-1',
      data: {kind: 'rectangle'},
      version: 1,
    })
    await written.wait({tier: 'local'})
    const rows = await db.all(app.canvasElements.where({room: 'local:local'}))
    expect(rows.map((row) => row.elementId)).toContain('rect-1')
    await context.shutdown()
  })
})
