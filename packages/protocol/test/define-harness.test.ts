import {describe, it, expect} from 'vitest'
import type {AnyTextAdapter} from '@tanstack/ai'
import {defineHarness, type TranscriptHandle} from '../src/harness-types.js'

const stubHandle: TranscriptHandle = {
  revision: () => Promise.resolve({ok: false, reason: 'missing', detail: 'stub'}),
  read: () => Promise.resolve({ok: false, reason: 'missing', detail: 'stub'}),
  close: () => {},
}

const fakeAdapter: AnyTextAdapter = {
  kind: 'text',
  name: 'fake',
  model: 'fake',
  '~types': {
    providerOptions: {},
    inputModalities: ['text'],
    messageMetadataByModality: {
      text: undefined,
      image: undefined,
      audio: undefined,
      video: undefined,
      document: undefined,
    },
    toolCapabilities: [],
    toolCallMetadata: undefined,
    systemPromptMetadata: undefined,
  },
  chatStream: async function* () {},
  structuredOutput: () => Promise.reject(new Error('fake adapter')),
}

const base = {
  id: 'x',
  binName: 'x',
  chatConfig: () => ({adapter: fakeAdapter}),
}

describe('defineHarness (generic typed factory; history↔transcriptHistory enforced by the type)', () => {
  it('returns the adapter unchanged when capabilities match members', () => {
    const adapter = defineHarness({
      ...base,
      capabilities: {
        resume: false,
        permissionGate: 'none',
        transcriptHistory: false,
        compaction: false,
        systemPrompt: 'none',
        mcp: 'none',
        slashCommands: 'none',
        imageInput: false,
      },
    })
    expect(adapter.id).toBe('x')

    expect('history' in adapter).toBe(false)
  })

  it('accepts a transcriptHistory harness that provides a history implementation', () => {
    const adapter = defineHarness({
      ...base,
      capabilities: {
        resume: false,
        permissionGate: 'none',
        transcriptHistory: true,
        compaction: false,
        systemPrompt: 'none',
        mcp: 'none',
        slashCommands: 'none',
        imageInput: false,
      },
      history: {
        messages: () => Promise.resolve([]),
        transcriptStat: () => Promise.resolve(null),
        observe: () => stubHandle,
        list: () => Promise.resolve([]),
      },
    })
    expect(typeof adapter.history?.messages).toBe('function')
  })
})
