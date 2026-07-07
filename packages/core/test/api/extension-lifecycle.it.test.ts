import {expect, test} from 'vitest'
import {z} from 'zod'
import {Hono} from 'hono'
import {createMCPClient} from '@tanstack/ai-mcp'
import {defineExtension, defineTool} from '@conciv/extension'
import {bootKit} from '../helpers/boot.js'

function toolNamed(name: string) {
  return defineTool({name, description: 'd', inputSchema: z.object({})}).server(() => ({ok: name}))
}

test('two extensions mount isolated namespaces; both routes serve and both tools register', async () => {
  const alpha = defineExtension({name: 'alpha', tools: [toolNamed('alpha_do')]}).server(() => ({
    context: {},
    app: new Hono().get('/where', (c) => c.json({who: 'alpha'})),
  }))
  const beta = defineExtension({name: 'beta', tools: [toolNamed('beta_do')]}).server(() => ({
    context: {},
    app: new Hono().get('/where', (c) => c.json({who: 'beta'})),
  }))
  const kit = await bootKit({extensions: [alpha, beta]})
  const {base, cleanup: close} = kit
  try {
    expect(((await (await fetch(`${base}/api/ext/alpha/where`)).json()) as {who: string}).who).toBe('alpha')
    expect(((await (await fetch(`${base}/api/ext/beta/where`)).json()) as {who: string}).who).toBe('beta')
    const mcp = await createMCPClient({transport: {type: 'http', url: `${base}/api/mcp`}})
    const names = (await mcp.tools()).map((candidate) => candidate.name)
    expect(names).toEqual(expect.arrayContaining(['alpha_do', 'beta_do']))
    await mcp.close()
  } finally {
    await close()
  }
}, 30_000)

test('a tool-name collision across extensions is rejected at mount', async () => {
  const a = defineExtension({name: 'a', tools: [toolNamed('dup_tool')]})
  const b = defineExtension({name: 'b', tools: [toolNamed('dup_tool')]})
  await expect(bootKit({extensions: [a, b]})).rejects.toThrow(/collision/)
})

test('an extension-name collision is rejected at mount', async () => {
  await expect(
    bootKit({extensions: [defineExtension({name: 'same'}), defineExtension({name: 'same'})]}),
  ).rejects.toThrow(/collision/)
})

test('parseConfig applies schema defaults when the user omits config', async () => {
  const ext = defineExtension({
    name: 'cfg',
    configSchema: z.object({factor: z.number().default(7)}),
  }).server((server) => ({
    context: {},
    app: new Hono().get('/factor', (c) => c.json({factor: server.config.factor})),
  }))
  const kit = await bootKit({extensions: [ext]})
  const {base, cleanup: close} = kit
  try {
    expect(((await (await fetch(`${base}/api/ext/cfg/factor`)).json()) as {factor: number}).factor).toBe(7)
  } finally {
    await close()
  }
}, 30_000)

test('server.app serves non-GET verbs with a request body', async () => {
  const ext = defineExtension({name: 'echo'}).server(() => ({
    context: {},
    app: new Hono().post('/shout', async (c) => {
      const body = (await c.req.json()) as {text: string}
      return c.json({shouted: body.text.toUpperCase()})
    }),
  }))
  const kit = await bootKit({extensions: [ext]})
  const {base, cleanup: close} = kit
  try {
    const res = await fetch(`${base}/api/ext/echo/shout`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({text: 'hi'}),
    })
    expect(((await res.json()) as {shouted: string}).shouted).toBe('HI')
  } finally {
    await close()
  }
}, 30_000)
