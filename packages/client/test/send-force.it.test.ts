import {afterEach, describe, expect, it} from 'vitest'
import type {UIMessage} from '@tanstack/ai'
import {makeRpcClient} from '@conciv/contract'
import {defineExtension, type ServerApi} from '@conciv/extension'
import {chatConnection} from '../src/chat-connection.js'
import {bootClientKit, type ClientKit} from './helpers/boot.js'

type Captured = {server?: ServerApi<Record<never, never>>}

let kit: ClientKit | undefined
afterEach(async () => {
  await kit?.cleanup()
  kit = undefined
})

function probeExtension(captured: Captured) {
  return defineExtension({name: 'force-probe'}).server((server) => {
    captured.server = server
    return {context: {}}
  })
}

function userMessage(id: string, text: string): UIMessage {
  return {id, role: 'user', parts: [{type: 'text', content: text}]}
}

describe('chatConnection force', () => {
  it('carries force to chat.send only while the force option is on', async () => {
    const captured: Captured = {}
    const booted = await bootClientKit({extensions: [probeExtension(captured)]})
    kit = booted
    const server = captured.server
    if (!server) throw new Error('server api not captured')
    const seen: boolean[] = []
    server.sessions.beforeSend((_sessionId, opts) => {
      seen.push(opts.force)
      return opts.force ? {allow: true} : {allow: false, code: 'EXTERNAL_ACTIVE', message: 'terminal is working'}
    })

    const sessionId = await booted.session()
    const forced = {on: false}
    const connection = chatConnection(makeRpcClient(booted.base), sessionId, {
      force: () => forced.on,
      busyTimeoutMs: 1_000,
    })

    await expect(connection.send([userMessage('m1', 'hi')], undefined, undefined)).rejects.toMatchObject({
      code: 'EXTERNAL_ACTIVE',
    })

    forced.on = true
    await connection.send([userMessage('m2', 'hi again')], undefined, undefined)
    expect(seen).toEqual([false, true])
  }, 30_000)
})
