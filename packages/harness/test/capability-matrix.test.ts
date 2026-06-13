import {describe, it, expect} from 'vitest'
import {listHarnesses} from '../src/registry.js'

const STUB_IDS = new Set(['gemini-cli', 'opencode', 'pi'])

describe('harness capability matrix', () => {
  for (const adapter of listHarnesses().filter((a) => !STUB_IDS.has(a.id))) {
    describe(adapter.id, () => {
      it('transcriptHistory <=> a history implementation is present', () => {
        if (adapter.capabilities.transcriptHistory) {
          expect(typeof adapter.history?.transcriptPath).toBe('function')
          expect(typeof adapter.history?.parse).toBe('function')
        } else {
          expect(adapter.history).toBeUndefined()
        }
      })

      it('declares a non-empty id, binName, and a decode generator', () => {
        expect(adapter.id).toBeTruthy()
        expect(adapter.binName).toBeTruthy()
        expect(typeof adapter.decode).toBe('function')
      })

      it('permissionGate is one of hook|none and systemPrompt one of file|flag|none', () => {
        expect(['hook', 'none']).toContain(adapter.capabilities.permissionGate)
        expect(['file', 'flag', 'none']).toContain(adapter.capabilities.systemPrompt)
      })
    })
  }
})
