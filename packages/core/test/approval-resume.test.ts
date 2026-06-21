import {H3} from 'h3'
import {z} from 'zod'
import {describe, expect, it} from 'vitest'
import type {ExtensionServerTool} from '@mandarax/extensions'
import {registerToolRunRoute} from '../src/api/tools/run.js'
import {createHistory} from '../src/history/history.js'

async function post(app: H3, body: unknown): Promise<Response> {
  return app.fetch(
    new Request('http://127.0.0.1/api/tools/run', {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify(body),
    }),
  )
}

describe('approval resume (widget-direct)', () => {
  it('gates an ask tool until confirmed, then runs it exactly once', async () => {
    let calls = 0
    const danger: ExtensionServerTool = {
      name: 'danger',
      description: 'destructive',
      inputSchema: z.object({}),
      execute: async () => {
        calls += 1
        return 'done'
      },
    }
    const app = new H3()
    registerToolRunRoute(app, {
      tools: [danger],
      approvals: {danger: 'ask'},
      previewId: 'p',
      history: createHistory(),
      fire: () => {},
    })

    const gated = await post(app, {name: 'danger', input: {}})
    expect(gated.status).toBe(403)
    expect(await gated.json()).toEqual({
      error: 'tool danger requires approval',
      needsApproval: true,
      name: 'danger',
      input: {},
    })
    expect(calls).toBe(0)

    const ok = await post(app, {name: 'danger', input: {}, confirmed: true})
    expect(ok.status).toBe(200)
    expect(await ok.json()).toEqual({result: 'done'})
    expect(calls).toBe(1)
  })
})
