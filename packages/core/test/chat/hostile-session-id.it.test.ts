import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {eq} from 'drizzle-orm'
import {afterEach, describe, expect, it} from 'vitest'
import {sessions} from '@conciv/db'
import type {Kit} from '@conciv/harness-testkit'
import {adoptLiveSession} from '../../src/chat/adopt.js'
import {transcriptMessages} from '../../src/chat/attach.js'
import {makeChatFixture} from '../helpers/chat-fixture.js'
import {bootKit} from '../helpers/boot.js'

const HOSTILE = '../../etc/passwd'

const opened: Kit[] = []
const scratch: string[] = []

afterEach(async () => {
  await Promise.all(opened.splice(0).map((kit) => kit.cleanup()))
  for (const dir of scratch.splice(0)) rmSync(dir, {recursive: true, force: true})
})

function encodeProjectDir(cwd: string): string {
  return cwd.replace(/[^a-zA-Z0-9]/g, '-')
}

describe('hostile session ids', () => {
  it('the adopt store refuses a harness session id that is not a bare token', async () => {
    const fixture = await makeChatFixture()
    scratch.push(fixture.stateRoot)
    const outcome = await adoptLiveSession(fixture.chat, {
      harnessSessionId: HOSTILE,
      pid: process.pid,
      force: false,
      requestUrl: 'http://127.0.0.1:1234/rpc/sessions/attachAdopt',
    })
    expect(outcome.ok).toBe(false)
    expect(outcome.ok ? '' : outcome.detail).toContain('not a valid session id')
  })

  it('the rpc contract refuses a hostile attachAdopt session id before the store runs', async () => {
    const kit = await bootKit()
    opened.push(kit)
    const outcome = await kit.rpc.sessions
      .attachAdopt({harnessSessionId: HOSTILE, pid: process.pid})
      .then(() => 'accepted')
      .catch((error: unknown) => String(error))
    expect(outcome).toContain('alidation')
  })

  it('the rpc contract refuses a hostile attachDetach session id', async () => {
    const kit = await bootKit()
    opened.push(kit)
    const outcome = await kit.rpc.sessions
      .attachDetach({sessionId: HOSTILE})
      .then(() => 'accepted')
      .catch((error: unknown) => String(error))
    expect(outcome).toContain('alidation')
  })

  it('never reads a transcript outside the project directory', async () => {
    const home = mkdtempSync(join(tmpdir(), 'conciv-home-'))
    scratch.push(home)
    const fixture = await makeChatFixture()
    scratch.push(fixture.stateRoot)
    mkdirSync(join(home, '.claude', 'projects', encodeProjectDir(fixture.chat.cwd)), {recursive: true})
    writeFileSync(
      join(home, '.claude', 'secret.jsonl'),
      JSON.stringify({type: 'user', message: {role: 'user', content: 'TOP SECRET'}}),
    )
    await fixture.db.update(sessions).set({harnessSessionId: '../../secret'}).where(eq(sessions.id, fixture.sessionId))
    const deps = {...fixture.chat, claudeHome: home}
    const history = await transcriptMessages(deps, fixture.sessionId)
    expect(JSON.stringify(history)).not.toContain('TOP SECRET')
  })
})
