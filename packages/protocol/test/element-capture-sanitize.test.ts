import {describe, expect, it} from 'vitest'
import {
  decodeEntities,
  isDangerousTag,
  isDroppableAttribute,
  isLocalReference,
  neutralizeSubtree,
  type SanitizableNode,
} from '../src/element-capture-sanitize.js'

function elementNode(
  tagName: string,
  attributes: Record<string, unknown>,
  children: SanitizableNode[] = [],
): SanitizableNode {
  return {type: 2, tagName, attributes, childNodes: children}
}

describe('decodeEntities refuses to guess at an entity it cannot decode', () => {
  it('decodes hexadecimal, decimal and named entities', () => {
    expect(decodeEntities('&#x6a;&#97;&amp;')).toBe('ja&')
  })

  it('returns undefined for a code point above the unicode maximum instead of throwing', () => {
    expect(decodeEntities('&#x110000;')).toBeUndefined()
    expect(decodeEntities('&#1114112;')).toBeUndefined()
  })

  it('leaves an unknown named entity untouched', () => {
    expect(decodeEntities('&nosuchentity;')).toBe('&nosuchentity;')
  })
})

describe('isLocalReference fails closed', () => {
  it('accepts fragments and data URIs', () => {
    expect(isLocalReference('#gradient')).toBe(true)
    expect(isLocalReference('data:image/png;base64,AAAA')).toBe(true)
  })

  it('rejects remote URLs, javascript URLs and obfuscated variants', () => {
    expect(isLocalReference('https://example.com/a.png')).toBe(false)
    expect(isLocalReference('/local/a.png')).toBe(false)
    expect(isLocalReference('javascript:alert(1)')).toBe(false)
    expect(isLocalReference('java\tscript:alert(1)')).toBe(false)
    expect(isLocalReference('&#x6a;avascript:alert(1)')).toBe(false)
  })

  it('rejects a value carrying an undecodable entity', () => {
    expect(isLocalReference('&#x110000;#')).toBe(false)
  })
})

describe('isDroppableAttribute', () => {
  it('drops every event handler attribute', () => {
    expect(isDroppableAttribute('onerror', 'boom()')).toBe(true)
    expect(isDroppableAttribute('ONCLICK', 'boom()')).toBe(true)
  })

  it('drops url-bearing attributes unless the value is local', () => {
    expect(isDroppableAttribute('src', 'https://example.com/a.png')).toBe(true)
    expect(isDroppableAttribute('srcset', '/a.png 1x')).toBe(true)
    expect(isDroppableAttribute('poster', '/a.png')).toBe(true)
    expect(isDroppableAttribute('background', '/a.png')).toBe(true)
    expect(isDroppableAttribute('action', '/submit')).toBe(true)
    expect(isDroppableAttribute('data', '/thing.swf')).toBe(true)
    expect(isDroppableAttribute('xlink:href', '#gradient')).toBe(false)
    expect(isDroppableAttribute('src', 'data:image/png;base64,AAAA')).toBe(false)
  })

  it('drops an inline style only when it references a url', () => {
    expect(isDroppableAttribute('style', 'background-image:url(/a.png)')).toBe(true)
    expect(isDroppableAttribute('style', 'background:image-set("/a.png" 1x)')).toBe(true)
    expect(isDroppableAttribute('style', 'color:red')).toBe(false)
  })

  it('keeps ordinary attributes', () => {
    expect(isDroppableAttribute('class', 'card')).toBe(false)
    expect(isDroppableAttribute('value', 'ada@example.com')).toBe(false)
  })
})

describe('isDangerousTag', () => {
  it('flags the tags that execute or fetch on rebuild', () => {
    for (const tagName of ['iframe', 'object', 'embed', 'script', 'link', 'style', 'SCRIPT']) {
      expect(isDangerousTag({type: 2, tagName})).toBe(true)
    }
  })

  it('leaves ordinary tags alone', () => {
    expect(isDangerousTag({type: 2, tagName: 'div'})).toBe(false)
    expect(isDangerousTag({type: 3})).toBe(false)
  })
})

describe('neutralizeSubtree', () => {
  it('strips dangerous children, handler attributes, remote urls and the custom-element flag', () => {
    const tree: SanitizableNode = {
      type: 2,
      tagName: 'div',
      isCustom: true,
      attributes: {class: 'card', onclick: 'boom()'},
      childNodes: [
        elementNode('script', {}),
        elementNode('link', {rel: 'stylesheet', href: '/sheet.css'}),
        elementNode('img', {src: 'https://example.com/a.png', srcset: '/a.png 1x'}),
        elementNode('a', {href: 'javascript:alert(1)'}, [elementNode('span', {onmouseover: 'boom()'})]),
      ],
    }

    neutralizeSubtree(tree)

    expect(tree.isCustom).toBeUndefined()
    expect(tree.attributes).toEqual({class: 'card'})
    expect(tree.childNodes?.map((child) => child.tagName)).toEqual(['img', 'a'])
    expect(tree.childNodes?.[0]?.attributes).toEqual({})
    expect(tree.childNodes?.[1]?.attributes).toEqual({})
    expect(tree.childNodes?.[1]?.childNodes?.[0]?.attributes).toEqual({})
  })

  it('never throws on an attribute carrying an out-of-range numeric character reference', () => {
    const tree = elementNode('a', {href: '&#x110000;javascript:alert(1)'})

    neutralizeSubtree(tree)

    expect(tree.attributes).toEqual({})
  })
})
