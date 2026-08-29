import {describe, it, expect} from 'vitest'
import {firstSnapshot, userTexts} from '../helpers/snapshots.js'
import {freshSubscriberSnapshot, useFakeSessions} from '../helpers/fake-session.js'

describe('transcript snapshots survive a re-subscribe (IT, DB-owned history)', () => {
  const sessions = useFakeSessions()

  it(
    'T1/T2: a between-runs subscriber cannot rewind the next run, and a later subscriber sees both turns',
    {timeout: 60_000},
    async () => {
      const {kit, sessionId, keeper} = await sessions.open()

      await kit.turn('turn one', {session: sessionId, runId: 'resubscribe-1'})
      const firstTurn = await keeper.done({hangGuardMs: 15_000})

      const poisoner = await freshSubscriberSnapshot(kit, sessionId)
      expect(userTexts(poisoner)).toEqual(['turn one'])

      await kit.turn('turn two', {session: sessionId, runId: 'resubscribe-2'})
      const secondTurn = await keeper.done({hangGuardMs: 15_000})

      const runStart = firstSnapshot(secondTurn.all.slice(firstTurn.all.length))
      expect(userTexts(runStart)).toEqual(['turn one', 'turn two'])

      const latecomer = await freshSubscriberSnapshot(kit, sessionId)
      expect(userTexts(latecomer)).toEqual(['turn one', 'turn two'])
      expect(latecomer.messages.map((message) => message.role)).toEqual(['user', 'assistant', 'user', 'assistant'])
    },
  )
})
