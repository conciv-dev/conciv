import {describe, it, expect} from 'vitest'
import {initContributions} from '@conciv/harness-init/registry'
import {listHarnesses} from '../src/registry.js'

const STUB_IDS = new Set(['gemini-cli'])

describe('harness capability matrix', () => {
  for (const adapter of listHarnesses().filter((a) => !STUB_IDS.has(a.id))) {
    describe(adapter.id, () => {
      it('transcriptHistory <=> a history implementation is present', () => {
        if (adapter.capabilities.transcriptHistory) {
          expect(typeof adapter.history?.messages).toBe('function')
          expect(typeof adapter.history?.observe).toBe('function')
        } else {
          expect(adapter.history).toBeUndefined()
        }
      })

      it('declares a non-empty id, binName, and a chatConfig factory', () => {
        expect(adapter.id).toBeTruthy()
        expect(adapter.binName).toBeTruthy()
        expect(typeof adapter.chatConfig).toBe('function')
      })

      it('permissionGate is one of callback|none and systemPrompt one of file|flag|none', () => {
        expect(['callback', 'none']).toContain(adapter.capabilities.permissionGate)
        expect(['file', 'flag', 'none']).toContain(adapter.capabilities.systemPrompt)
      })

      it('init files <=> an init contribution sidecar is present', () => {
        if (adapter.capabilities.init === 'files') {
          expect(adapter.init?.harnessId).toBe(adapter.id)
          expect(typeof adapter.init?.plan).toBe('function')
          expect(typeof adapter.init?.installed).toBe('function')
        } else {
          expect(adapter.init).toBeUndefined()
        }
      })
    })
  }

  it('every registered harness declares an init contribution whose kind matches its capability', () => {
    const contributions = Object.values(initContributions)
    for (const adapter of listHarnesses()) {
      const contribution = contributions.find((one) => one.harnessId === adapter.id)
      expect(contribution, adapter.id).toBeDefined()
      expect(contribution?.init, adapter.id).toBe(adapter.capabilities.init)
      expect(contribution?.detection.bin, adapter.id).toBe(adapter.binName)
    }
  })

  it('claude exposes listSessions for the session selector', () => {
    const claude = listHarnesses().find((a) => a.id === 'claude')
    expect(typeof claude?.history?.list).toBe('function')
  })
})
