import {describe, expect, it} from 'vitest'
import {parseConcivSettings} from '../src/data/settings.js'

describe('parseConcivSettings', () => {
  it('returns defaults for empty or invalid raw config', () => {
    const expected = {
      modal: {enabled: true, position: 'bottom-right'},
      quickTerminal: {enabled: true, hotkeys: ['Mod+`']},
    }
    expect(parseConcivSettings('')).toEqual(expected)
    expect(parseConcivSettings('{nope')).toEqual(expected)
    expect(parseConcivSettings('[1,2]')).toEqual(expected)
  })

  it('disables surfaces on explicit false', () => {
    const settings = parseConcivSettings('{"modal": false, "quickTerminal": false}')
    expect(settings.modal.enabled).toBe(false)
    expect(settings.quickTerminal.enabled).toBe(false)
  })

  it('reads modal position and validates unknown values back to the default', () => {
    expect(parseConcivSettings('{"modal": {"position": "top-left"}}').modal.position).toBe('top-left')
    expect(parseConcivSettings('{"modal": {"position": "under-the-sea"}}').modal.position).toBe('bottom-right')
  })

  it('accepts hotkey as string or array', () => {
    expect(parseConcivSettings('{"quickTerminal": {"hotkey": "Mod+k"}}').quickTerminal.hotkeys).toEqual(['Mod+k'])
    expect(parseConcivSettings('{"quickTerminal": {"hotkey": ["Mod+k", "Mod+j"]}}').quickTerminal.hotkeys).toEqual([
      'Mod+k',
      'Mod+j',
    ])
  })
})
