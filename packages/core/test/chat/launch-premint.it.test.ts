import {mkdirSync, rmSync, writeFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {afterEach, describe, expect, it} from 'vitest'
import {renderConnectCommand} from '../../src/chat/connect-exec.js'
import type {ChatDeps} from '../../src/chat/runtime.js'
import {connectPlanFor, sessionById} from '../../src/chat/session.js'
import {makeChatFixture, type ChatFixture} from '../helpers/chat-fixture.js'
import {requireClaude, requireTranscriptPath} from '../helpers/adapters.js'

const claude = requireClaude()
const fixtures: ChatFixture[] = []

type Launchable = {fixture: ChatFixture; deps: ChatDeps}

async function freshLaunchable(): Promise<Launchable> {
  const fixture = await makeChatFixture({seedSession: false})
  fixtures.push(fixture)
  return {fixture, deps: {...fixture.chat, claudeHome: join(fixture.stateRoot, 'claude-home')}}
}

async function planCommand({fixture, deps}: Launchable): Promise<string> {
  const plan = await connectPlanFor(deps, {sessionId: fixture.sessionId, requestUrl: 'http://127.0.0.1:1/'})
  if (!plan) throw new Error('harness produced no connect plan')
  return renderConnectCommand(plan, deps.cwd)
}

function seedTranscript({deps}: Launchable, token: string): void {
  const path = requireTranscriptPath(claude)(deps.cwd, token, deps.claudeHome)
  mkdirSync(dirname(path), {recursive: true})
  writeFileSync(path, `${JSON.stringify({type: 'user', message: {role: 'user', content: 'hi'}})}\n`)
}

const MINTED = /'--session-id' '([0-9a-f-]{36})'/

function mintedId(command: string): string {
  const found = MINTED.exec(command)?.[1]
  if (!found) throw new Error(`no minted session id in: ${command}`)
  return found
}

describe('harness token pre-mint on launch', () => {
  afterEach(() => {
    for (const fixture of fixtures.splice(0)) rmSync(fixture.stateRoot, {recursive: true, force: true})
  })

  it('mints a harness session id for a fresh session and records it', async () => {
    const launchable = await freshLaunchable()
    const minted = mintedId(await planCommand(launchable))
    expect((await sessionById(launchable.fixture.db, launchable.fixture.sessionId))?.harnessSessionId).toBe(minted)
  })

  it('reuses the recorded id without resuming while no transcript exists', async () => {
    const launchable = await freshLaunchable()
    const first = mintedId(await planCommand(launchable))
    const second = await planCommand(launchable)
    expect(mintedId(second)).toBe(first)
    expect(second).not.toContain('--resume')
  })

  it('resumes once the harness has written a transcript for the recorded id', async () => {
    const launchable = await freshLaunchable()
    const minted = mintedId(await planCommand(launchable))
    seedTranscript(launchable, minted)
    expect(await planCommand(launchable)).toContain(`'--resume' '${minted}'`)
  })
})
