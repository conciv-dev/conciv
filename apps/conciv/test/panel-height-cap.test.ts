import {describe, expect, it} from 'vitest'
import {defaultPanelHeight, panelHeightCap} from '../src/routes/panel-height.js'

describe('panelHeightCap', () => {
  it('matches the CSS max-height formula of 100vh minus 7.5rem', () => {
    expect(panelHeightCap(800, 16)).toBe(680)
  })

  it('scales with a non-default root font size, matching how CSS rem resolves', () => {
    expect(panelHeightCap(800, 20)).toBe(650)
  })
})

describe('defaultPanelHeight', () => {
  it('never exceeds the CSS max-height cap even when 90vh would allow more', () => {
    expect(defaultPanelHeight(800, 16)).toBe(680)
  })

  it('uses the design default when neither 90vh nor the css cap constrain it', () => {
    expect(defaultPanelHeight(2000, 16)).toBe(750)
  })
})
