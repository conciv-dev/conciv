import {expect, test} from 'vitest'
import {z} from 'zod'
import {createMCPClient} from '@tanstack/ai-mcp'
import {defineExtension, defineTool} from '@conciv/extension'
import {startTestServer} from '../helpers/server.js'

function toolNamed(name: string) {
  return defineTool({name, description: 'd', inputSchema: z.object({})}).server(() => ({ok: name}))
}

test('two extensions mount isolated namespaces; both routes serve and both tools register', async () => {
  const alpha = defineExtension({name: 'alpha', tools: [toolNamed('alpha_do')]}).server((server) => {
    server.app.get('/where', () => ({who: 'alpha'}))
    return {context: {}}
  })
  const beta = defineExtension({name: 'beta', tools: [toolNamed('beta_do')]}).server((server) => {
    server.app.get('/where', () => ({who: 'beta'}))
    return {context: {}}
  })
  const {base, close} = await startTestServer({extensions: [alpha, beta]})
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
  await expect(startTestServer({extensions: [a, b]})).rejects.toThrow(/collision/)
})

test('an extension-name collision is rejected at mount', async () => {
  await expect(
    startTestServer({extensions: [defineExtension({name: 'same'}), defineExtension({name: 'same'})]}),
  ).rejects.toThrow(/collision/)
})

test('parseConfig applies schema defaults when the user omits config', async () => {
  const ext = defineExtension({
    name: 'cfg',
    configSchema: z.object({factor: z.number().default(7)}),
  }).server((server) => {
    server.app.get('/factor', () => ({factor: server.config.factor}))
    return {context: {}}
  })
  const {base, close} = await startTestServer({extensions: [ext]})
  try {
    expect(((await (await fetch(`${base}/api/ext/cfg/factor`)).json()) as {factor: number}).factor).toBe(7)
  } finally {
    await close()
  }
}, 30_000)

test('server.app serves non-GET verbs with a request body', async () => {
  const ext = defineExtension({name: 'echo'}).server((server) => {
    server.app.post('/shout', async (event) => {
      const body = (await event.req.json()) as {text: string}
      return {shouted: body.text.toUpperCase()}
    })
    return {context: {}}
  })
  const {base, close} = await startTestServer({extensions: [ext]})
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
