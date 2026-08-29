import {describe, it, expect} from 'vitest'
import {firstSnapshot, userTexts} from '../helpers/snapshots.js'
import {hydratedSnapshot, useFakeSessions} from '../helpers/fake-session.js'

describe('transcript snapshots survive a fresh hydrate (IT, DB-owned history)', () => {
  const sessions = useFakeSessions()

  it(
    'T1/T2: a between-runs hydrate cannot rewind the next run, and a later hydrate sees both turns',
    {timeout: 60_000},
    async () => {
      const {kit, sessionId} = await sessions.open()

      const first = await kit.turn('turn one', {session: sessionId, runId: 'resubscribe-1'})
      await first.done({hangGuardMs: 15_000})

      const poisoner = await hydratedSnapshot(kit, sessionId)
      expect(userTexts(poisoner)).toEqual(['turn one'])

      const second = await kit.turn('turn two', {session: sessionId, runId: 'resubscribe-2'})
      const secondTurn = await second.done({hangGuardMs: 15_000})

      const runStart = firstSnapshot(secondTurn.all)
      expect(userTexts(runStart)).toEqual(['turn one', 'turn two'])

      const latecomer = await hydratedSnapshot(kit, sessionId)
      expect(userTexts(latecomer)).toEqual(['turn one', 'turn two'])
      expect(latecomer.messages.map((message) => message.role)).toEqual(['user', 'assistant', 'user', 'assistant'])
    },
  )
})
