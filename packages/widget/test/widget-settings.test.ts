import {describe, it, expect} from 'vitest'
import {parseWidgetSettings} from '../src/widget-settings.js'

describe('parseWidgetSettings', () => {
  it('defaults both layouts on when config is empty', () => {
    expect(parseWidgetSettings('{}')).toEqual({
      modal: {enabled: true, position: 'bottom-right'},
      quickTerminal: {enabled: true, hotkeys: ['Mod+`']},
    })
  })

  it('falls back to defaults on missing or malformed input', () => {
    const def = {
      modal: {enabled: true, position: 'bottom-right'},
      quickTerminal: {enabled: true, hotkeys: ['Mod+`']},
    }
    expect(parseWidgetSettings('')).toEqual(def)
    expect(parseWidgetSettings('not json')).toEqual(def)
    expect(parseWidgetSettings('null')).toEqual(def)
  })

  it('disables each layout with false', () => {
    const s = parseWidgetSettings(JSON.stringify({modal: false, quickTerminal: false}))
    expect(s.modal.enabled).toBe(false)
    expect(s.quickTerminal.enabled).toBe(false)
  })

  it('reads the modal position from an object config', () => {
    const s = parseWidgetSettings(JSON.stringify({modal: {position: 'top-left'}}))
    expect(s.modal).toEqual({enabled: true, position: 'top-left'})
  })

  it('normalizes a single hotkey string into an array', () => {
    const s = parseWidgetSettings(JSON.stringify({quickTerminal: {hotkey: 'Control+k'}}))
    expect(s.quickTerminal.hotkeys).toEqual(['Control+k'])
  })

  it('keeps a hotkey array as-is', () => {
    const s = parseWidgetSettings(JSON.stringify({quickTerminal: {hotkey: ['Mod+`', 'Control+k']}}))
    expect(s.quickTerminal.hotkeys).toEqual(['Mod+`', 'Control+k'])
  })

  it('treats quickTerminal: true as enabled with the default hotkey', () => {
    const s = parseWidgetSettings(JSON.stringify({quickTerminal: true}))
    expect(s.quickTerminal).toEqual({enabled: true, hotkeys: ['Mod+`']})
  })
})
