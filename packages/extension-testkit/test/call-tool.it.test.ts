import {expect, test} from 'vitest'
import {z} from 'zod'
import ping from './fixtures/ping/server.js'
import {bootExtensionServer} from '../src/boot-server.js'
import {makeCallTool, makeRunTypescript, resolveSession} from '@conciv/harness-testkit'

test('calls a real extension tool over MCP', async () => {
  const {apiBase, stop} = await bootExtensionServer(ping)
  try {
    const session = await resolveSession(apiBase)
    const callTool = makeCallTool(apiBase, session)
    const result = await callTool('ping.echo', {text: 'marco-polo'})
    expect(JSON.stringify(result)).toContain('marco-polo')
  } finally {
    await stop()
  }
})

test('an oversized tool reply fails loud, and aggregating inside the sandbox stays within the cap', async () => {
  const {apiBase, stop} = await bootExtensionServer(ping)
  try {
    const session = await resolveSession(apiBase)
    const callTool = makeCallTool(apiBase, session)
    await expect(callTool('ping.flood', {})).rejects.toThrow(/truncated/)
    const runTypescript = makeRunTypescript(apiBase, session)
    const length = await runTypescript(`
      const found = await external_catalog({name: 'ping.flood'})
      const reply = await globalThis[found.call]({})
      return reply.payload.length
    `)
    expect(z.number().parse(length)).toBe(120_000)
  } finally {
    await stop()
  }
}, 30_000)

test('a tool result merely shaped like the truncation envelope passes through untouched', async () => {
  const {apiBase, stop} = await bootExtensionServer(ping)
  try {
    const session = await resolveSession(apiBase)
    const callTool = makeCallTool(apiBase, session)
    const result = await callTool('ping.decoy', {})
    expect(result).toEqual({truncated: true, reason: 'looks like an envelope', head: 'not really'})
  } finally {
    await stop()
  }
}, 30_000)
