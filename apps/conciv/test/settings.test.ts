import {describe, expect, it} from 'vitest'
import {parseConcivSettings} from '../src/data/settings.js'

describe('parseConcivSettings', () => {
  it('returns defaults for empty or invalid raw config', () => {
    const expected = {
      modal: {enabled: true, position: 'bottom-right'},
      quickTerminal: {enabled: true, hotkeys: ['Mod+`']},
      defaultOpen: false,
      launcher: 'mascot',
      transport: 'auto',
      theme: {accent: undefined, hue: undefined},
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

  describe('theme', () => {
    it('parses a valid accent and hue', () => {
      expect(parseConcivSettings('{"theme": {"accent": "oklch(0.7 0.19 32)", "hue": 30}}').theme).toEqual({
        accent: 'oklch(0.7 0.19 32)',
        hue: 30,
      })
    })

    it('accepts hex accents in 3, 6, and 8 digit form', () => {
      expect(parseConcivSettings('{"theme": {"accent": "#f0a"}}').theme?.accent).toBe('#f0a')
      expect(parseConcivSettings('{"theme": {"accent": "#ff00aa"}}').theme?.accent).toBe('#ff00aa')
      expect(parseConcivSettings('{"theme": {"accent": "#ff00aacc"}}').theme?.accent).toBe('#ff00aacc')
    })

    it('rejects an injection-like accent string and falls back to undefined', () => {
      expect(parseConcivSettings('{"theme": {"accent": "red; background: url(x)"}}').theme?.accent).toBeUndefined()
      expect(parseConcivSettings('{"theme": {"accent": "javascript:alert(1)"}}').theme?.accent).toBeUndefined()
    })

    it('rejects an out-of-range hue and falls back to undefined while keeping a valid accent', () => {
      expect(parseConcivSettings('{"theme": {"accent": "#ff0000", "hue": 720}}').theme).toEqual({
        accent: '#ff0000',
        hue: undefined,
      })
      expect(parseConcivSettings('{"theme": {"hue": -10}}').theme?.hue).toBeUndefined()
    })

    it('defaults theme to an empty object when absent', () => {
      expect(parseConcivSettings('{}').theme).toEqual({accent: undefined, hue: undefined})
    })
  })
})
