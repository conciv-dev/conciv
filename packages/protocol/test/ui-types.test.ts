import {describe, it, expect} from 'vitest'
import {EventType} from '@tanstack/ai'
import {aguiSnapshotFor, UiAnswerSchema, UiAnswerValueSchema, UiInputSchema} from '../src/ui-types.js'

describe('snapshot event', () => {
  it('snapshot is a native MESSAGES_SNAPSHOT chunk carrying UIMessages verbatim', () => {
    const messages = [{id: 'm1', role: 'user' as const, parts: [{type: 'text' as const, content: 'hi'}]}]
    const chunk = aguiSnapshotFor(messages)
    expect(chunk.type).toBe(EventType.MESSAGES_SNAPSHOT)
    if (chunk.type === EventType.MESSAGES_SNAPSHOT) expect(chunk.messages).toEqual(messages)
  })
})

describe('blocking conciv_ui schemas', () => {
  it('UiInputSchema accepts each kind with its fields', () => {
    expect(UiInputSchema.parse({kind: 'choices', question: 'theme?', options: ['light', 'dark']}).kind).toBe('choices')
    expect(UiInputSchema.parse({kind: 'confirm', question: 'run?', detail: 'pnpm build'}).kind).toBe('confirm')
    expect(UiInputSchema.parse({kind: 'diff', file: 'a.ts', before: 'x', after: 'y'}).kind).toBe('diff')
    expect(UiInputSchema.parse({kind: 'form', fields: [{name: 'path', label: 'Path', type: 'text'}]}).kind).toBe('form')
    expect(UiInputSchema.safeParse({kind: 'vitest'}).success).toBe(false)
  })

  it('UiAnswerValueSchema is a string or a string record, nothing else', () => {
    expect(UiAnswerValueSchema.parse('yes')).toBe('yes')
    expect(UiAnswerValueSchema.parse({path: '/docs'})).toEqual({path: '/docs'})
    expect(UiAnswerValueSchema.safeParse(42).success).toBe(false)
    expect(UiAnswerValueSchema.safeParse({n: 42}).success).toBe(false)
  })

  it('UiAnswerSchema is the answered/unanswered union', () => {
    expect(UiAnswerSchema.parse({answered: true, value: 'yes'})).toEqual({answered: true, value: 'yes'})
    expect(UiAnswerSchema.parse({answered: false, note: 'timed out'})).toEqual({answered: false, note: 'timed out'})
    expect(UiAnswerSchema.safeParse({answered: true}).success).toBe(false)
    expect(UiAnswerSchema.safeParse({answered: false, value: 'yes'}).success).toBe(false)
  })
})
