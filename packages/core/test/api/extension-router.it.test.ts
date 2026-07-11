import {afterEach, expect, test} from 'vitest'
import {os} from '@orpc/server'
import {z} from 'zod'
import {defineExtension, makeExtRpcClient} from '@conciv/extension'
import type {Kit} from '@conciv/harness-testkit'
import {bootKit} from '../helpers/boot.js'

const probeOs = os.$context<{request: Request}>()

function makeProbeRouter() {
  return probeOs.router({
    ping: probeOs
      .input(z.object({value: z.string()}))
      .output(z.object({pong: z.string(), origin: z.string()}))
      .handler(({input, context}) => ({pong: input.value, origin: new URL(context.request.url).origin})),
  })
}

type ProbeRouter = ReturnType<typeof makeProbeRouter>

const probeExtension = defineExtension({name: 'Router Probe'}).server(() => ({
  context: {},
  router: makeProbeRouter(),
}))

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})

async function bootProbe(): Promise<Kit> {
  const kit = await bootKit({extensions: [probeExtension]})
  cleanups.push(() => kit.cleanup())
  return kit
}

test('an extension-contributed router round-trips through /rpc/ext/<slug>', async () => {
  const kit = await bootProbe()
  const client = makeExtRpcClient<ProbeRouter>(kit.base, 'router-probe')
  const result = await client.ping({value: 'hello'})
  expect(result.pong).toBe('hello')
  expect(result.origin).toBe(kit.base)
}, 30_000)

test('a non-loopback Origin is rejected on the extension rpc mount', async () => {
  const kit = await bootProbe()
  const forbidden = await fetch(`${kit.base}/rpc/ext/router-probe/ping`, {
    method: 'POST',
    headers: {origin: 'http://evil.com', 'content-type': 'application/json'},
    body: JSON.stringify({json: {value: 'x'}}),
  })
  expect(forbidden.status).toBe(403)
}, 30_000)
