import {describe, expect, it} from 'vitest'
import {createComponent, createRoot} from 'solid-js'
import {HostProvider, useHost, useSlot} from '../src/host.js'
import type {HostApi} from '../src/host-types.js'

const fakeHost = {chat: {send: () => {}}} as unknown as HostApi

function renderWithHost<Captured>(capture: () => Captured): Captured {
  let captured: Captured | undefined
  createRoot((dispose) => {
    createComponent(HostProvider, {
      host: fakeHost,
      slot: 'composer',
      get children() {
        captured = capture()
        return null
      },
    })
    dispose()
  })
  if (captured === undefined) throw new Error('children never evaluated')
  return captured
}

describe('host doorway', () => {
  it('useHost returns the provided host', () => {
    expect(renderWithHost(() => useHost())).toBe(fakeHost)
  })

  it('useSlot returns the mount slot', () => {
    const slot = renderWithHost(() => useSlot())
    expect(slot()).toBe('composer')
  })

  it('useHost outside a provider throws a typed extension error', () => {
    createRoot((dispose) => {
      expect(() => useHost()).toThrowError(
        expect.objectContaining({code: 'missing-host', userCode: 'extension.missing-host'}),
      )
      dispose()
    })
  })
})
