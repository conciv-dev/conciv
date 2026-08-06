import {readFileSync} from 'node:fs'
import {basename} from 'node:path'
import {describe, expect, it} from 'vitest'
import {widgetBundleFile} from '../src/core/widget-bundle.js'

describe('widgetBundleFile', () => {
  it('resolves the prebuilt self-contained global bundle inside @conciv/embed dist', () => {
    const file = widgetBundleFile()
    expect(basename(file)).toBe('conciv-widget.global.js')
    const source = readFileSync(file, 'utf8')
    expect(source.length).toBeGreaterThan(10_000)
  })
})
