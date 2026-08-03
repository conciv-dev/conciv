import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {eq} from 'drizzle-orm'
import {afterEach, describe, expect, it} from 'vitest'
import {sessions} from '@conciv/db'
import {sessionSnapshot} from '../../src/chat/transcript.js'
import {makeChatFixture} from '../helpers/chat-fixture.js'

const scratch: string[] = []

afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, {recursive: true, force: true})
})

function encodeProjectDir(cwd: string): string {
  return cwd.replace(/[^a-zA-Z0-9]/g, '-')
}

describe('hostile session ids', () => {
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
    const history = await sessionSnapshot(deps, fixture.sessionId)
    expect(JSON.stringify(history)).not.toContain('TOP SECRET')
  })
})
