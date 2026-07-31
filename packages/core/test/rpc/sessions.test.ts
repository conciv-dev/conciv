import {rmSync} from 'node:fs'
import {afterEach, describe, expect, it} from 'vitest'
import type {HarnessAdapter, HarnessHistory, HarnessSessionMeta, TranscriptHandle} from '@conciv/protocol/harness-types'
import {rpcSessionList} from '../../src/api/rpc/sessions.js'
import {createSession} from '../../src/chat/session.js'
import type {ChatDeps} from '../../src/chat/runtime.js'
import {makeChatFixture, type ChatFixture} from '../helpers/chat-fixture.js'

const fixtures: ChatFixture[] = []

const BAD = 'tok-unreadable'
const GOOD = 'tok-readable'

const emptyHandle = (): TranscriptHandle => ({
  revision: () => Promise.resolve({ok: false, reason: 'missing', detail: 'no transcript'}),
  read: () => Promise.resolve({ok: false, reason: 'missing', detail: 'no transcript'}),
  close: () => {},
})

function metaFor(token: string): Promise<HarnessSessionMeta | null> {
  if (token === BAD) return Promise.reject(new Error('transcript is unreadable'))
  return Promise.resolve({
    id: token,
    derivedTitle: 'counted the files',
    updatedAt: 42,
    messageCount: 3,
    model: null,
    totalTokens: 0,
    lastMessage: null,
  })
}

const history: HarnessHistory = {
  messages: () => Promise.resolve([]),
  observe: () => emptyHandle(),
  list: () => Promise.resolve([]),
  meta: (_cwd, token) => metaFor(token),
}

async function seedForeign(chat: ChatDeps, id: string, token: string): Promise<void> {
  await createSession(chat.db, {
    id,
    harnessSessionId: token,
    harnessKind: chat.harness.id,
    origin: 'chat',
    title: null,
    model: null,
    usage: null,
    cwd: chat.cwd,
    transcriptCwd: '/workspace/elsewhere',
  })
}

describe('rpcSessionList tolerates an unreadable foreign transcript', () => {
  afterEach(() => {
    for (const fixture of fixtures.splice(0)) rmSync(fixture.stateRoot, {recursive: true, force: true})
  })

  it('still lists the sessions whose meta resolved', async () => {
    const fixture = await makeChatFixture({seedSession: false})
    fixtures.push(fixture)
    const commands = fixture.chat.harness.commands
    if (!commands) throw new Error('fixture harness lacks slash commands')
    const harness: HarnessAdapter = {
      ...fixture.chat.harness,
      capabilities: {...fixture.chat.harness.capabilities, transcriptHistory: true, slashCommands: 'live'},
      commands,
      history,
    }
    const chat: ChatDeps = {...fixture.chat, harness}
    await seedForeign(chat, 'conciv_bad', BAD)
    await seedForeign(chat, 'conciv_good', GOOD)

    const listed = await rpcSessionList(chat)
    expect(listed.find((meta) => meta.id === 'conciv_good')?.title).toBe('counted the files')
    expect(listed.map((meta) => meta.id).toSorted()).toEqual(['conciv_bad', 'conciv_good'])
  })
})
