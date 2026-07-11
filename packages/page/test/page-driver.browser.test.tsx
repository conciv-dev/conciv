import {makeDomPageDriver, type PageDriver} from '../src/page-driver.js'
import {installReactBridge} from '../src/react-bridge.js'
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest'
import {createRoot, type Root} from 'react-dom/client'
import {FixtureApp} from './fixtures/react-app.js'

let container: HTMLElement
let reactRoot: Root
let driver: PageDriver

const resultOf = async (query: Parameters<PageDriver['execute']>[0]): Promise<Record<string, unknown>> => {
  const result = await driver.execute(query)
  return typeof result === 'object' && result !== null ? {...result} : {}
}

beforeAll(async () => {
  installReactBridge()
  container = document.createElement('div')
  container.innerHTML = `
    <input id="field" type="text" />
    <input id="box" type="checkbox" />
    <form id="frm"><button id="inner" type="button">inner</button></form>
    <p id="prose">hello page</p>
  `
  document.body.appendChild(container)
  const mount = document.createElement('div')
  container.appendChild(mount)
  reactRoot = createRoot(mount)
  reactRoot.render(<FixtureApp />)
  driver = makeDomPageDriver()
  await vi.waitFor(() => {
    if (!document.querySelector('[data-fixture="leaf"]')) throw new Error('fixture not rendered yet')
  })
})

afterAll(() => {
  reactRoot.unmount()
  container.remove()
})

describe('target resolution', () => {
  it('resolves selector, snapshot ref, and React component name targets', async () => {
    expect(await resultOf({kind: 'text', selector: '#prose'})).toEqual({text: 'hello page'})
    const snapshot = await resultOf({kind: 'snapshot'})
    const nodes = Array.isArray(snapshot.nodes) ? snapshot.nodes : []
    expect(nodes.length).toBeGreaterThan(0)
    const first = nodes[0] && typeof nodes[0] === 'object' ? {...nodes[0]} : {}
    const viaRef = await resultOf({kind: 'text', ref: String(first.ref)})
    expect(typeof viaRef.text).toBe('string')
    const viaName = await resultOf({kind: 'text', name: 'Leaf'})
    expect(String(viaName.text)).toContain('A:')
  })

  it('explains each way a target can be missing', async () => {
    expect(await resultOf({kind: 'click', ref: 'v999'})).toEqual({error: 'stale ref v999 — re-run page snapshot'})
    expect(await resultOf({kind: 'click', name: 'Nope'})).toEqual({error: 'no React component named "Nope" found'})
    expect(await resultOf({kind: 'click', selector: '#missing'})).toEqual({error: 'no element for selector #missing'})
    expect(await resultOf({kind: 'click'})).toEqual({error: 'no target — pass --ref, --selector, or --name'})
  })
})

describe('dom verbs', () => {
  it('clicks through React handlers and mirrors the action', async () => {
    expect(await resultOf({kind: 'click', selector: '[data-fixture="leaf"]'})).toEqual({ok: true})
    await expect.poll(() => document.querySelector('[data-fixture="leaf"]')?.textContent).toContain(':1:')
    expect(document.querySelector('[data-conciv-cursor]')).not.toBeNull()
  })

  it('fills, checks, and unchecks form fields with native events', async () => {
    expect(await resultOf({kind: 'fill', selector: '#field', value: 'typed'})).toEqual({ok: true, value: 'typed'})
    expect(await resultOf({kind: 'value', selector: '#field'})).toEqual({value: 'typed'})
    expect(await resultOf({kind: 'check', selector: '#box'})).toEqual({ok: true, checked: true})
    expect(await resultOf({kind: 'uncheck', selector: '#box'})).toEqual({ok: true, checked: false})
    expect(await resultOf({kind: 'fill', selector: '#prose', value: 'x'})).toEqual({
      error: 'fill target is not an input/textarea/select',
    })
  })

  it('mutates attributes, classes, styles, text, and structure', async () => {
    await resultOf({kind: 'setattr', selector: '#prose', name: 'data-mark', value: 'on'})
    expect(document.querySelector('#prose')?.getAttribute('data-mark')).toBe('on')
    await resultOf({kind: 'removeattr', selector: '#prose', name: 'data-mark'})
    expect(document.querySelector('#prose')?.hasAttribute('data-mark')).toBe(false)
    await resultOf({kind: 'addclass', selector: '#prose', class: 'hot'})
    expect(document.querySelector('#prose')?.classList.contains('hot')).toBe(true)
    await resultOf({kind: 'settext', selector: '#prose', text: 'rewritten'})
    expect(document.querySelector('#prose')?.textContent).toBe('rewritten')
    await resultOf({kind: 'insert', selector: '#prose', html: '<em id="added">x</em>', position: 'after'})
    expect(document.querySelector('#added')).not.toBeNull()
    await resultOf({kind: 'remove', selector: '#added'})
    expect(document.querySelector('#added')).toBeNull()
  })

  it('reports route, existence, and query matches', async () => {
    const route = await resultOf({kind: 'route'})
    expect(route.pathname).toBe(location.pathname)
    expect(await resultOf({kind: 'exists', selector: '#frm'})).toEqual({exists: true, count: 1})
    const query = await resultOf({kind: 'query', selector: 'input'})
    expect(query.count).toBe(2)
  })

  it('waits for visibility and times out with an explanation', async () => {
    expect(await resultOf({kind: 'wait', selector: '#prose', state: 'visible', timeout: 500})).toEqual({
      ok: true,
      state: 'visible',
    })
    expect(await resultOf({kind: 'wait', selector: '#missing', state: 'visible', timeout: 150})).toEqual({
      error: 'wait timed out for #missing (visible)',
    })
  })

  it('evaluates code and serializes element results', async () => {
    const value = await resultOf({kind: 'eval', code: 'return 2 + 3'})
    expect(value).toEqual({result: 5})
    const element = await resultOf({kind: 'eval', code: 'return document.querySelector("#frm")'})
    expect(element.result).toMatchObject({tagName: 'form'})
  })

  it('injects css stylesheets', async () => {
    expect(await resultOf({kind: 'css', text: '#prose{letter-spacing:3px}'})).toEqual({ok: true})
    expect(document.querySelector('style[data-vibe-css]')?.textContent).toContain('letter-spacing')
  })
})

describe('react verbs through the driver', () => {
  it('inspects a component and navigates into its props by path', async () => {
    const full = await resultOf({kind: 'inspect', name: 'Leaf'})
    expect(full.component).toBe('Leaf')
    const byPath = await resultOf({kind: 'inspect', name: 'Leaf', path: 'props.label'})
    expect(byPath.value).toBe('A')
    expect(await resultOf({kind: 'inspect', name: 'Leaf', path: 'props.missing.deep'})).toEqual({
      error: 'path not found: props.missing.deep',
    })
  })

  it('overrides props and validates its inputs', async () => {
    expect(await resultOf({kind: 'override', name: 'Counter'})).toEqual({
      error: 'override requires --target (props|state|hooks|context)',
    })
    expect(await resultOf({kind: 'override', name: 'Counter', target: 'state', json: '{nope'})).toEqual({
      error: '--json is not valid JSON: {nope',
    })
    const set = await resultOf({kind: 'override', name: 'Counter', target: 'state', path: 'value', json: '77'})
    expect(set.ok).toBe(true)
    await expect.poll(() => document.querySelector('[data-fixture="class"]')?.textContent).toBe('77')
  })

  it('tracks renders between start and stop', async () => {
    await resultOf({kind: 'track', action: 'start'})
    await resultOf({kind: 'click', name: 'Leaf'})
    await expect
      .poll(async () => {
        const report = await resultOf({kind: 'track', action: 'report'})
        const components = Array.isArray(report.components) ? report.components : []
        return components.some(
          (entry) => typeof entry === 'object' && entry !== null && 'component' in entry && entry.component === 'Leaf',
        )
      })
      .toBe(true)
    const stopped = await resultOf({kind: 'track', action: 'stop'})
    expect(stopped.tracking).toBe(false)
  })
})
