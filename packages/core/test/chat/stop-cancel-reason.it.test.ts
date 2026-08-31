import {describe, expect, it} from 'vitest'
import {SessionId} from '@conciv/protocol/chat-types'
import {startTurn} from '../helpers/detached-turn.js'
import {stopSession} from '../../src/chat/stop.js'
import {bootMadeApp} from '../helpers/boot.js'
import {useMadeApps} from '../helpers/made-apps.js'
import {requireClaude} from '../helpers/adapters.js'

describe('a user stop is distinguishable from a disconnect (IT)', () => {
  const apps = useMadeApps()
  const tmp = apps.tmp

  it('records the cancel and an aborted status on the run record, not a detach', {timeout: 30_000}, async () => {
    const made = await bootMadeApp(
      {
        stateRoot: tmp('conciv-stop-cancel-state-'),
        cwd: tmp('conciv-stop-cancel-cwd-'),
        harness: requireClaude(),
      },
      {fakeClaude: {env: () => ({CONCIV_FAKE_HANG: '1'})}},
    )
    apps.keep(made)
    const sessionId = SessionId.parse('conciv_stop_cancel')
    const runId = 'stop-cancel-reason-1'

    await startTurn(made.chat, sessionId, runId, 'hang around')
    await stopSession(made.chat, sessionId)

    const record = await made.chat.runs.get(runId)
    expect(record).toMatchObject({cancelRequested: true, status: 'aborted'})
    expect(record?.detachedSince ?? null).toBeNull()
  })
})
