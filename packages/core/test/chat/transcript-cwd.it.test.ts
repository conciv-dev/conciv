import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {dirname, join} from 'node:path'
import {eq} from 'drizzle-orm'
import {afterEach, describe, expect, it} from 'vitest'
import {sessions} from '@conciv/db'
import {transcriptMessages} from '../../src/chat/attach.js'
import {transcriptCwdFor} from '../../src/chat/session.js'
import {makeChatFixture} from '../helpers/chat-fixture.js'
import {requireClaude, requireTranscriptPath} from '../helpers/adapters.js'

const claude = requireClaude()
const dirs: string[] = []

function tmp(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  dirs.push(dir)
  return dir
}

function seedTranscript(cwd: string, token: string, home: string): void {
  const path = requireTranscriptPath(claude)(cwd, token, home)
  mkdirSync(dirname(path), {recursive: true})
  writeFileSync(
    path,
    [
      JSON.stringify({type: 'user', message: {role: 'user', content: 'from another workdir'}}),
      JSON.stringify({type: 'assistant', message: {role: 'assistant', content: [{type: 'text', text: 'answered'}]}}),
    ].join('\n'),
  )
}

describe('per-session transcript cwd', () => {
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, {recursive: true, force: true})
  })

  it('reads the transcript from the record cwd, not the engine cwd', async () => {
    const fixture = await makeChatFixture()
    dirs.push(fixture.stateRoot)
    const transcriptCwd = tmp('conciv-transcript-cwd-')
    const claudeHome = tmp('conciv-transcript-home-')
    const token = 'tok-transcript-cwd'
    seedTranscript(transcriptCwd, token, claudeHome)
    await fixture.db
      .update(sessions)
      .set({harnessSessionId: token, transcriptCwd})
      .where(eq(sessions.id, fixture.sessionId))

    expect(await transcriptCwdFor(fixture.db, token)).toBe(transcriptCwd)
    const messages = await transcriptMessages({...fixture.chat, claudeHome}, fixture.sessionId)
    expect(messages.map((message) => message.role)).toEqual(['user', 'assistant'])
  })

  it('falls back to the engine cwd when the record has no transcript cwd', async () => {
    const fixture = await makeChatFixture()
    dirs.push(fixture.stateRoot)
    const claudeHome = tmp('conciv-transcript-home-')
    const token = 'tok-engine-cwd'
    seedTranscript(fixture.chat.cwd, token, claudeHome)
    await fixture.db.update(sessions).set({harnessSessionId: token}).where(eq(sessions.id, fixture.sessionId))

    expect(await transcriptCwdFor(fixture.db, token)).toBeNull()
    const messages = await transcriptMessages({...fixture.chat, claudeHome}, fixture.sessionId)
    expect(messages.map((message) => message.role)).toEqual(['user', 'assistant'])
  })
})
