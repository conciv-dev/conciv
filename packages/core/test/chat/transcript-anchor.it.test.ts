import {describe, expect, it} from 'vitest'
import {writeFileSync} from 'node:fs'
import {userTexts} from '../helpers/snapshots.js'
import {freshSnapshot, ONE_PIXEL_PNG, useTranscriptFixture} from '../helpers/transcript-fixture.js'

function transcriptLine(role: 'user' | 'assistant', text: string, uuid: string, messageId?: string): string {
  return JSON.stringify({
    type: role,
    uuid,
    message: {...(messageId ? {id: messageId} : {}), content: [{type: 'text', text}]},
  })
}

describe('the transcript merge anchors on native record ids (IT, claude capabilities)', () => {
  const fixture = useTranscriptFixture('conciv-anchor')

  it(
    'does not replay the CLI copy of a turn whose stored prompt carries no matching text',
    {timeout: 90_000},
    async () => {
      const open = await fixture.open()
      const {kit, sessionId, transcript} = open

      const turn1 = await kit.turn(
        {content: [{type: 'image', source: {type: 'data', mimeType: 'image/png', value: ONE_PIXEL_PNG}}]},
        {session: sessionId, runId: 'anchor-image-1'},
      )
      await turn1.done({hangGuardMs: 25_000})

      writeFileSync(
        transcript,
        [
          transcriptLine('user', '[image #1 attached]', 'rec-user-1'),
          transcriptLine('assistant', 'hello from fake', 'rec-asst-1', 'a1'),
        ].join('\n'),
      )

      const snapshot = await freshSnapshot(open)
      expect(snapshot.messages.map((message) => message.role)).toEqual(['user', 'assistant'])
    },
  )

  it('keeps the settled CLI turns that precede the first folded run', {timeout: 90_000}, async () => {
    const open = await fixture.open()
    const {kit, sessionId, transcript} = open

    const turn2 = await kit.turn('first turn', {session: sessionId, runId: 'anchor-text-1'})
    await turn2.done({hangGuardMs: 25_000})
    writeFileSync(
      transcript,
      [
        transcriptLine('user', 'first turn', 'rec-user-1'),
        transcriptLine('assistant', 'hello from fake', 'rec-asst-1', 'a1'),
      ].join('\n'),
    )

    const turn3 = await kit.turn(
      {content: [{type: 'image', source: {type: 'data', mimeType: 'image/png', value: ONE_PIXEL_PNG}}]},
      {session: sessionId, runId: 'anchor-image-2'},
    )
    await turn3.done({hangGuardMs: 25_000})
    writeFileSync(
      transcript,
      [
        transcriptLine('user', 'first turn', 'rec-user-1'),
        transcriptLine('assistant', 'hello from fake', 'rec-asst-1', 'a1'),
        transcriptLine('user', '[image #1 attached]', 'rec-user-2'),
        transcriptLine('assistant', 'hello from fake', 'rec-asst-2', 'a2'),
      ].join('\n'),
    )

    const snapshot = await freshSnapshot(open)
    expect(userTexts(snapshot)).toEqual(['first turn', ''])
    expect(snapshot.messages.map((message) => message.role)).toEqual(['user', 'assistant', 'user', 'assistant'])
  })
})
