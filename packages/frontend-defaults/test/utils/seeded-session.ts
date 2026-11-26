import type {FakeSession} from '@conciv/client/testing'

export function seededSession(exchanges: readonly number[]): FakeSession {
  return {
    id: 'ses_seeded',
    title: 'Seeded thread',
    messages: exchanges.flatMap((index) => [
      {id: `seeded-question-${index}`, role: 'user', parts: [{type: 'text', content: `seeded exchange ${index}`}]},
      {id: `seeded-answer-${index}`, role: 'assistant', parts: [{type: 'text', content: `seeded answer ${index}`}]},
    ]),
  }
}
