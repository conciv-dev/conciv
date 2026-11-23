import {describe, expect, test} from 'vitest'
import {neutralizeSubtree, type SanitizableNode} from './element-capture-sanitize.js'

describe('a captured element replayed in the preview frame', () => {
  test('loses its handlers, script urls, hostile inline images, url styles and active tags, and keeps local references and a raster image', () => {
    const element = (tagName: string, attributes: Record<string, unknown>, childNodes: SanitizableNode[] = []) => ({
      type: 2,
      tagName,
      attributes,
      childNodes,
    })
    const capture: SanitizableNode = {
      ...element('div', {onclick: 'steal()', ONMOUSEOVER: 'steal()', class: 'card'}, [
        element('a', {href: 'jav&#x61;script:steal()'}),
        element('a', {href: '#pricing'}),
        element('img', {
          src: 'https://tracker.example.com/pixel.gif',
          rr_dataURL: 'data:text/html,<script>steal()</script>',
        }),
        element('img', {rr_dataURL: 'data:image/png;base64,iVBORw0KGgo='}),
        element('span', {style: 'background: url(https://tracker.example.com/x)'}),
        element('meta', {'http-equiv': 'refresh', content: '0;url=https://evil.example.com'}),
        element('script', {}),
        element('iframe', {srcdoc: '<script>steal()</script>'}),
      ]),
      isCustom: true,
    }

    neutralizeSubtree(capture)

    expect(capture).toEqual(
      element('div', {class: 'card'}, [
        element('a', {}),
        element('a', {href: '#pricing'}),
        element('img', {}),
        element('img', {rr_dataURL: 'data:image/png;base64,iVBORw0KGgo='}),
        element('span', {}),
      ]),
    )
  })
})
