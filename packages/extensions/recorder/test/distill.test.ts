import {describe, expect, it} from 'vitest'
import {distill} from '../src/server/distill.js'
import type {RrwebEvent} from '../src/shared/protocol.js'
import {buttonFixture, pageFixture} from './fixtures/page.js'

const page = pageFixture([
  buttonFixture(4, 5, 'Save'),
  {id: 6, type: 2, tagName: 'input', attributes: {id: 'email', type: 'text'}, childNodes: []},
])

const stream: RrwebEvent[] = [
  {type: 4, data: {href: 'http://localhost:3000/checkout', width: 800, height: 600}, timestamp: 1000},
  {type: 2, data: {node: page}, timestamp: 1001},
  {type: 3, data: {source: 2, type: 2, id: 4}, timestamp: 2000},
  {type: 3, data: {source: 5, id: 6, text: 'a@b.co', isChecked: false}, timestamp: 3000},
  {type: 3, data: {source: 3, id: 1, x: 0, y: 400}, timestamp: 4000},
  {type: 3, data: {source: 3, id: 1, x: 0, y: 800}, timestamp: 4300},
  {type: 6, data: {plugin: 'rrweb/console@1', payload: {level: 'error', payload: ['"boom"']}}, timestamp: 5000},
  {type: 4, data: {href: 'http://localhost:3000/done', width: 800, height: 600}, timestamp: 6000},
  {type: 2, data: {node: page}, timestamp: 6001},
]

describe('distill', () => {
  it('produces a semantic action log from an rrweb stream', () => {
    const log = distill(stream)
    expect(log.map((entry) => entry.kind)).toEqual([
      'navigation',
      'click',
      'input',
      'scroll',
      'console',
      'navigation',
      'reload',
    ])
  })

  it('describes click targets by tag and text', () => {
    const click = distill(stream).find((entry) => entry.kind === 'click')
    expect(click?.detail).toContain('button')
    expect(click?.detail).toContain('Save')
  })

  it('includes typed text and identifies the field', () => {
    const input = distill(stream).find((entry) => entry.kind === 'input')
    expect(input?.detail).toContain('a@b.co')
    expect(input?.detail).toContain('email')
  })

  it('coalesces consecutive scrolls on the same node into one entry', () => {
    const scrolls = distill(stream).filter((entry) => entry.kind === 'scroll')
    expect(scrolls).toHaveLength(1)
  })

  it('does not mark periodic checkout snapshots as reloads', () => {
    const checkoutStream: RrwebEvent[] = [
      {type: 4, data: {href: 'http://localhost:3000/app', width: 800, height: 600}, timestamp: 1000},
      {type: 2, data: {node: page}, timestamp: 1001},
      {type: 2, data: {node: page}, timestamp: 61_001},
    ]
    expect(distill(checkoutStream).filter((entry) => entry.kind === 'reload')).toHaveLength(0)
  })

  it('drops blocked-target (id -1) clicks, inputs, scrolls', () => {
    const incremental = (data: object): RrwebEvent => ({type: 3, data, timestamp: 1000})
    expect(distill([incremental({source: 2, type: 2, id: -1})])).toEqual([])
    expect(distill([incremental({source: 5, id: -1, text: 'hi'})])).toEqual([])
    expect(distill([incremental({source: 3, id: -1})])).toEqual([])
  })

  it('drops empty typed inputs', () => {
    expect(distill([{type: 3, data: {source: 5, id: 4, text: ''}, timestamp: 1000}])).toEqual([])
  })

  it('resolves targets added later by flat parentId mutations (real rrweb shape)', () => {
    const withMutation: RrwebEvent[] = [
      {type: 2, data: {node: page}, timestamp: 1000},
      {
        type: 3,
        data: {
          source: 0,
          adds: [
            {parentId: 3, node: {id: 9, type: 2, tagName: 'a', attributes: {href: '/x'}, childNodes: []}},
            {parentId: 9, node: {id: 10, type: 3, textContent: 'Details'}},
          ],
          removes: [],
          attributes: [],
          texts: [],
        },
        timestamp: 1500,
      },
      {type: 3, data: {source: 2, type: 2, id: 9}, timestamp: 2000},
    ]
    const click = distill(withMutation).find((entry) => entry.kind === 'click')
    expect(click?.detail).toContain('Details')
  })
})
