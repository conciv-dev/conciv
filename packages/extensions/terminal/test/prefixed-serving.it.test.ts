import {randomUUID} from 'node:crypto'
import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {EventType} from '@tanstack/ai'
import {start, type Engine} from '@conciv/core'
import {createFakeHarness, makeRpcClient, type RpcClient} from '@conciv/harness-testkit'
import {makeExtRpcClient} from '@conciv/extension'
import {CONCIV_SESSION_HEADER} from '@conciv/protocol/chat-types'
import type {HarnessAdapter, HarnessConnectContext} from '@conciv/protocol/harness-types'
import terminalExtension, {type TerminalRouter} from '../src/server.js'

const TOKEN = '8a1e7d5c-3b2f-4e6a-9c0d-1f2e3a4b5c6d'

describe('prefixed serving over the real wire (start with an access token)', () => {
  const captured: HarnessConnectContext[] = []
  let root: string
  let engine: Engine
  let base: string
  let rpc: RpcClient

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'conciv-prefixed-wire-'))
    const harness: HarnessAdapter = {
      ...createFakeHarness({id: 'fake-prefixed-wire', text: 'prefixed ok'}),
      connect: {
        plan: (ctx) => {
          captured.push(ctx)
          return {
            argv: ['fake-cli', ...(ctx.mcpUrl ? ['--mcp', ctx.mcpUrl] : [])],
            env: {},
            files: [],
          }
        },
      },
    }
    engine = await start({
      options: {stateRoot: root, systemPrompt: false, harness: 'fake-prefixed-wire'},
      root,
      harness,
      extensions: [terminalExtension],
      launchEditor: () => {},
      accessToken: TOKEN,
    })
    base = `http://127.0.0.1:${engine.port}/t/${TOKEN}`
    rpc = makeRpcClient(base)
  })

  afterAll(async () => {
    await engine?.stop()
    rmSync(root, {recursive: true, force: true})
  })

  it(
    'serves the terminal connect command through the prefixed route and the handed-out mcp url answers mcp',
    {timeout: 15_000},
    async () => {
      const {sessionId} = await rpc.sessions.create(undefined)
      const terminalRpc = makeExtRpcClient<TerminalRouter>(base, 'terminal')
      const {command} = await terminalRpc.connectCommand({sessionId})
      expect(command).toContain(`/t/${TOKEN}/api/mcp`)

      const mcpUrl = captured.at(-1)?.mcpUrl
      if (!mcpUrl) throw new Error('the harness connect plan never received an mcp url')
      expect(mcpUrl).toBe(`http://127.0.0.1:${engine.port}/t/${TOKEN}/api/mcp`)

      const initialize = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: {name: 'prefixed-wire-test', version: '0.0.0'},
        },
      }
      const headers = {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        [CONCIV_SESSION_HEADER]: sessionId,
      }
      const response = await fetch(mcpUrl, {method: 'POST', headers, body: JSON.stringify(initialize)})
      expect(response.status).toBe(200)
      const payload = await response.json()
      expect(payload).toMatchObject({jsonrpc: '2.0', id: 1, result: {serverInfo: {name: 'conciv'}}})

      const unprefixed = await fetch(`http://127.0.0.1:${engine.port}/api/mcp`, {
        method: 'POST',
        headers,
        body: JSON.stringify(initialize),
      })
      expect(unprefixed.status).toBe(404)
    },
  )

  it('streams a chat turn over subscribe through the prefixed route', {timeout: 15_000}, async () => {
    const {sessionId} = await rpc.sessions.create(undefined)
    const abort = new AbortController()
    const iterator = await rpc.chat.subscribe({sessionId}, {signal: abort.signal})
    try {
      await rpc.chat.send({runId: randomUUID(), sessionId, text: 'hello through the prefix'})
      const types: string[] = []
      while (types.at(-1) !== EventType.RUN_FINISHED) {
        const next = await iterator.next()
        if (next.done) break
        types.push(next.value.type)
      }
      expect(types[0]).toBe(EventType.MESSAGES_SNAPSHOT)
      expect(types).toContain(EventType.RUN_FINISHED)
    } finally {
      abort.abort()
      await iterator.return(undefined).catch(() => {})
    }
  })

  it('answers chat.permissionDecision through the prefixed route', {timeout: 15_000}, async () => {
    const {sessionId} = await rpc.sessions.create(undefined)
    const sessionRpc = makeRpcClient(base, {headers: {[CONCIV_SESSION_HEADER]: sessionId}})
    await expect(
      sessionRpc.chat.permissionDecision({approvalId: 'none-pending', approved: false}),
    ).rejects.toMatchObject({code: 'UNKNOWN_REQUEST'})
  })
})
