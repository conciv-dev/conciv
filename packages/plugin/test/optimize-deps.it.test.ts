import {describe, expect, it} from 'vitest'
import {WIDGET_CJS_DEPS, concivSolidConfig, widgetInstalled} from '../src/core/vite-plumbing.js'

describe('vite optimizeDeps for the widget graph', () => {
  it('lists the CJS leaves that Vite dev serves raw with broken interop', () => {
    expect(WIDGET_CJS_DEPS).toContain('partial-json')
    expect(WIDGET_CJS_DEPS).toContain('js-beautify')
  })

  it('resolves @conciv/widget as a workspace dependency', () => {
    expect(widgetInstalled()).toBe(true)
  })

  it('excludes the widget/extension runtime but force-includes their CJS leaves', () => {
    const {optimizeDeps} = concivSolidConfig()
    expect(optimizeDeps.exclude).toEqual(['@conciv/widget', '@conciv/extension'])
    for (const dep of WIDGET_CJS_DEPS) expect(optimizeDeps.include).toContain(dep)
  })
})
