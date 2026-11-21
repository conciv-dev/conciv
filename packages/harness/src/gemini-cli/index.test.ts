import {describe, expect, it} from 'vitest'
import {geminiCli} from './index.js'

describe('gemini', () => {
  it('offers its four models and no terminal, slash menu, history or image attach', () => {
    expect(geminiCli.models).toEqual([
      {id: 'gemini-3-pro-preview', name: 'gemini-3-pro-preview', group: 'Gemini'},
      {id: 'gemini-3-flash-preview', name: 'gemini-3-flash-preview', group: 'Gemini'},
      {id: 'gemini-2.5-pro', name: 'gemini-2.5-pro', group: 'Gemini'},
      {id: 'gemini-2.5-flash', name: 'gemini-2.5-flash', group: 'Gemini'},
    ])
    expect(geminiCli).toMatchObject({
      defaultModel: 'gemini-3-pro-preview',
      tty: undefined,
      commands: undefined,
      history: undefined,
      capabilities: {slashCommands: 'none', transcriptHistory: false, imageInput: false},
    })
  })
})
