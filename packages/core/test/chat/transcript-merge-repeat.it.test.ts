import {describe, it, expect} from 'vitest'
import {writeFileSync} from 'node:fs'
import {userTexts} from '../helpers/snapshots.js'
import {freshSnapshot, ONE_PIXEL_PNG, useTranscriptFixture} from '../helpers/transcript-fixture.js'

function transcriptLine(role: 'user' | 'assistant', text: string, id?: string): string {
  return JSON.stringify({type: role, message: {...(id ? {id} : {}), content: [{type: 'text', text}]}})
}

describe('merging the CLI transcript with db-owned history (IT, claude capabilities)', () => {
  const fixture = useTranscriptFixture('conciv-merge-repeat')

  it('T11-B: a repeated opening prompt does not duplicate the turns between it', {timeout: 90_000}, async () => {
    const open = await fixture.open()
    const {kit, sessionId, keeper, transcript} = open

    await kit.rpc.chat.send({
      runId: 'merge-repeat-1',
      sessionId,
      content: [
        {type: 'text', content: 'say it again'},
        {type: 'image', source: {type: 'data', mimeType: 'image/png', value: ONE_PIXEL_PNG}},
      ],
    })
    await keeper.done({hangGuardMs: 25_000})
    writeFileSync(
      transcript,
      [transcriptLine('user', 'say it again'), transcriptLine('assistant', 'hello from fake', 'a1')].join('\n'),
    )

    await kit.rpc.chat.send({runId: 'merge-repeat-2', sessionId, text: 'and something else'})
    await keeper.done({hangGuardMs: 25_000})
    writeFileSync(
      transcript,
      [
        transcriptLine('user', 'say it again'),
        transcriptLine('assistant', 'hello from fake', 'a1'),
        transcriptLine('user', 'and something else'),
        transcriptLine('assistant', 'hello from fake', 'a2'),
      ].join('\n'),
    )

    await kit.rpc.chat.send({runId: 'merge-repeat-3', sessionId, text: 'say it again'})
    await keeper.done({hangGuardMs: 25_000})
    writeFileSync(
      transcript,
      [
        transcriptLine('user', 'say it again'),
        transcriptLine('assistant', 'hello from fake', 'a1'),
        transcriptLine('user', 'and something else'),
        transcriptLine('assistant', 'hello from fake', 'a2'),
        transcriptLine('user', 'say it again'),
        transcriptLine('assistant', 'hello from fake', 'a3'),
      ].join('\n'),
    )

    expect(userTexts(await freshSnapshot(open))).toEqual(['say it again', 'and something else', 'say it again'])
  })
})
