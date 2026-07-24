import {describe, expect, it} from 'vitest'
import {parseConcivSettings} from '../src/data/settings.js'

describe('parseConcivSettings', () => {
  it('returns defaults for empty or invalid raw config', () => {
    const expected = {
      modal: {enabled: true, position: 'bottom-right'},
      quickTerminal: {enabled: true, hotkeys: ['Mod+`']},
      defaultOpen: false,
      launcher: 'mascot',
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

  it('defaults the launcher to the mascot and reads native or false explicitly', () => {
    expect(parseConcivSettings('{}').launcher).toBe('mascot')
    expect(parseConcivSettings('{"launcher": "mascot"}').launcher).toBe('mascot')
    expect(parseConcivSettings('{"launcher": "native"}').launcher).toBe('native')
    expect(parseConcivSettings('{"launcher": false}').launcher).toBe(false)
    expect(parseConcivSettings('{"launcher": "bogus"}').launcher).toBe('mascot')
  })

  it('defaultOpen only on explicit true', () => {
    expect(parseConcivSettings('{"defaultOpen": true}').defaultOpen).toBe(true)
    expect(parseConcivSettings('{"defaultOpen": "yes"}').defaultOpen).toBe(false)
    expect(parseConcivSettings('{}').defaultOpen).toBe(false)
  })

  it('accepts hotkey as string or array', () => {
    expect(parseConcivSettings('{"quickTerminal": {"hotkey": "Mod+k"}}').quickTerminal.hotkeys).toEqual(['Mod+k'])
    expect(parseConcivSettings('{"quickTerminal": {"hotkey": ["Mod+k", "Mod+j"]}}').quickTerminal.hotkeys).toEqual([
      'Mod+k',
      'Mod+j',
    ])
  })
})
