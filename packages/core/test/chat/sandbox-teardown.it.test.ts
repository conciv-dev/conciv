import {describe, expect, it, vi} from 'vitest'
import {SessionId} from '@conciv/protocol/chat-types'
import type {MadeApp} from '../../src/app.js'
import {makeSend} from '../../src/chat/run.js'
import {stopSession} from '../../src/chat/stop.js'
import {bootMadeApp} from '../helpers/boot.js'
import {useMadeApps} from '../helpers/made-apps.js'
import {requireClaude} from '../helpers/adapters.js'

const claude = requireClaude()

describe('sandbox teardown (IT)', () => {
  const apps = useMadeApps()
  const tmp = apps.tmp

  async function boot(env: NodeJS.ProcessEnv): Promise<MadeApp> {
    const made = await bootMadeApp(
      {stateRoot: tmp('conciv-teardown-state-'), cwd: tmp('conciv-teardown-cwd-'), harness: claude},
      {fakeClaude: {env: () => env}},
    )
    apps.keep(made)
    return made
  }

  it('a stopped turn tears the thread sandbox down, so nothing is left to resume', async () => {
    const made = await boot({CONCIV_FAKE_HANG: '1'})
    const sessionId = SessionId.parse('conciv_teardown-stop')
    const ensureCtx = {threadId: sessionId, runId: 'teardown-stop-1'}
    await makeSend(made.chat)(sessionId, ensureCtx.runId, 'hang around')
    await vi.waitFor(async () => expect(await made.chat.sandbox.ensureExisting(ensureCtx)).not.toBeNull(), {
      timeout: 8000,
      interval: 50,
    })

    await stopSession(made.chat, sessionId)

    expect(await made.chat.sandbox.ensureExisting(ensureCtx)).toBeNull()
  }, 30_000)

  it('a turn that finishes on its own keeps the thread sandbox for the next turn', async () => {
    const made = await boot({})
    const sessionId = SessionId.parse('conciv_teardown-finish')
    const ensureCtx = {threadId: sessionId, runId: 'teardown-finish-1'}
    await makeSend(made.chat)(sessionId, ensureCtx.runId, 'hi')
    await vi.waitFor(async () => expect(await made.chat.runs.findActiveRun(sessionId)).toBeNull(), {
      timeout: 8000,
      interval: 50,
    })

    expect(await made.chat.sandbox.ensureExisting(ensureCtx)).not.toBeNull()
  }, 30_000)
})
