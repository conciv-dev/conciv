import {describe, expect, it} from 'vitest'
import {hostDocument} from '../../src/api/native-page.js'

describe('native host document', () => {
  it('pins the viewport so the WebView cannot pinch-zoom or rescale the overlay', () => {
    const html = hostDocument()
    const viewport = /<meta name="viewport" content="([^"]+)">/.exec(html)?.[1]
    expect(viewport).toContain('maximum-scale=1')
    expect(viewport).toContain('user-scalable=no')
    expect(viewport).toContain('viewport-fit=cover')
  })

  it('loads the native bundle with a prefix-relative src so token-scoped mounts resolve', () => {
    expect(hostDocument()).toContain('<script src="native/conciv-widget-native.global.js"></script>')
  })
})
