import type {PageError} from '@conciv/protocol/page-types'
import {makeDomPageDriver, type PageDriver} from '../src/page-driver.js'
import {installReactBridge} from '../src/react-bridge.js'
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest'
import {page} from 'vitest/browser'
import {createRoot, type Root} from 'react-dom/client'
import {ControlledForm, FixtureApp} from './fixtures/react-app.js'

let container: HTMLElement
let reactRoot: Root
let driver: PageDriver

const leaf = () => page.getByRole('button', {name: /^A:/})
const counter = () => page.getByRole('status')
const formState = () => page.getByText(/^subscribed:/)

type Query = Parameters<PageDriver['execute']>[0]

const resultOf = async (query: Query): Promise<Record<string, unknown>> => {
  const outcome = await driver.execute(query)
  if (!outcome.ok) throw new Error(`expected a result for ${query.kind}, got ${outcome.error.code}`)
  return {...outcome.result}
}

const failureOf = async (query: Query): Promise<PageError> => {
  const outcome = await driver.execute(query)
  if (outcome.ok) throw new Error(`expected a failure for ${query.kind}, got a result`)
  return outcome.error
}

beforeAll(async () => {
  installReactBridge()
  container = document.createElement('div')
  container.innerHTML = `
    <input id="field" type="text" />
    <form id="frm"><button id="inner" type="button">inner</button></form>
    <p id="prose">hello page</p>
    <span id="failprobe">probe</span>
  `
  document.body.appendChild(container)
  const mount = document.createElement('div')
  container.appendChild(mount)
  reactRoot = createRoot(mount)
  reactRoot.render(
    <>
      <FixtureApp />
      <ControlledForm />
    </>,
  )
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

  it('explains each way a target can be missing, as an invalid-args failure', async () => {
    expect(await failureOf({kind: 'click', ref: 'v999'})).toEqual({
      code: 'invalid-args',
      message: 'stale ref v999; re-run page snapshot',
    })
    expect(await failureOf({kind: 'click', name: 'Nope'})).toEqual({
      code: 'invalid-args',
      message: 'no React component named "Nope" found',
    })
    expect(await failureOf({kind: 'click', selector: '#missing'})).toEqual({
      code: 'invalid-args',
      message: 'no element for selector #missing',
    })
    expect(await failureOf({kind: 'click'})).toEqual({
      code: 'invalid-args',
      message: 'no target: pass --ref, --selector, or --name',
    })
  })
})

describe('failures are distinguishable from results', () => {
  it('reports a handler that throws as handler-error carrying the thrown message', async () => {
    const throwing = makeDomPageDriver({
      handlers: {
        text: () => {
          throw new Error('kaboom')
        },
      },
    })
    const outcome = await throwing.execute({kind: 'text', selector: '#failprobe'})
    expect(outcome).toEqual({ok: false, error: {code: 'handler-error', message: 'kaboom'}})
    throwing.dispose()
  })

  it('reports an unregistered extension verb as unknown-verb', async () => {
    expect(await failureOf({kind: 'ext', extension: 'nobody', verb: 'nothing'})).toEqual({
      code: 'unknown-verb',
      message: 'nobody.nothing is not registered',
    })
  })

  it('wraps a successful handler result under ok, leaving the result untouched', async () => {
    expect(await driver.execute({kind: 'text', selector: '#failprobe'})).toEqual({
      ok: true,
      result: {text: 'probe'},
    })
  })
})

describe('dom verbs', () => {
  it('clicks through React handlers and mirrors the action', async () => {
    expect(await resultOf({kind: 'click', selector: '[data-fixture="leaf"]'})).toEqual({ok: true})
    await expect.element(leaf()).toHaveTextContent(':1:')
    expect(document.querySelector('[data-conciv-cursor]')).not.toBeNull()
  })

  it('fills form fields with native events', async () => {
    expect(await resultOf({kind: 'fill', selector: '#field', value: 'typed'})).toEqual({ok: true, value: 'typed'})
    expect(await resultOf({kind: 'value', selector: '#field'})).toEqual({value: 'typed'})
    expect(await failureOf({kind: 'fill', selector: '#prose', value: 'x'})).toEqual({
      code: 'invalid-args',
      message: 'fill target is not an input/textarea/select',
    })
  })

  it('drives React-controlled checkboxes and radios so component state follows', async () => {
    expect(await resultOf({kind: 'check', selector: '#subscribe'})).toEqual({ok: true, checked: true})
    await expect.element(formState()).toHaveTextContent('subscribed: true')

    expect(await resultOf({kind: 'check', selector: '#subscribe'})).toEqual({ok: true, checked: true})
    await expect.element(formState()).toHaveTextContent('subscribed: true')

    expect(await resultOf({kind: 'uncheck', selector: '#subscribe'})).toEqual({ok: true, checked: false})
    await expect.element(formState()).toHaveTextContent('subscribed: false')

    expect(await resultOf({kind: 'check', selector: '#plan-pro'})).toEqual({ok: true, checked: true})
    await expect.element(formState()).toHaveTextContent('plan: pro')

    expect(await failureOf({kind: 'uncheck', selector: '#plan-pro'})).toEqual({
      code: 'invalid-args',
      message: 'cannot uncheck a radio; check another radio in the same group instead',
    })
    await expect.element(formState()).toHaveTextContent('plan: pro')

    expect(await resultOf({kind: 'check', selector: '#plan-free'})).toEqual({ok: true, checked: true})
    await expect.element(formState()).toHaveTextContent('plan: free')
  })

  it('mutates attributes, classes, styles, text, and structure', async () => {
    await resultOf({kind: 'setattr', selector: '#prose', attribute: 'data-mark', value: 'on'})
    expect(document.querySelector('#prose')?.getAttribute('data-mark')).toBe('on')
    expect(await failureOf({kind: 'setattr', selector: '#prose', name: 'data-mark', value: 'on'})).toEqual({
      code: 'invalid-args',
      message: 'setattr needs an attribute (and value)',
    })
    await resultOf({kind: 'removeattr', selector: '#prose', attribute: 'data-mark'})
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
    expect(query.count).toBe(4)
  })

  it('waits for visibility and times out with an explanation', async () => {
    expect(await resultOf({kind: 'wait', selector: '#prose', state: 'visible', timeout: 500})).toEqual({
      ok: true,
      state: 'visible',
    })
    expect(await failureOf({kind: 'wait', selector: '#missing', state: 'visible', timeout: 150})).toEqual({
      code: 'handler-error',
      message: 'wait timed out for #missing (visible)',
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
    expect(await failureOf({kind: 'inspect', name: 'Leaf', path: 'props.missing.deep'})).toEqual({
      code: 'invalid-args',
      message: 'path not found: props.missing.deep',
    })
  })

  it('overrides props and validates its inputs', async () => {
    expect(await failureOf({kind: 'override', name: 'Counter'})).toEqual({
      code: 'invalid-args',
      message: 'override requires --target (props|state|hooks|context)',
    })
    expect(await failureOf({kind: 'override', name: 'Counter', target: 'state', json: '{nope'})).toEqual({
      code: 'invalid-args',
      message: '--json is not valid JSON: {nope',
    })
    const set = await resultOf({kind: 'override', name: 'Counter', target: 'state', path: 'value', json: '77'})
    expect(set.ok).toBe(true)
    await expect.element(counter()).toHaveTextContent('77')
  })

  it('tracks renders between start and stop', async () => {
    await resultOf({kind: 'track', action: 'start'})
    await resultOf({kind: 'click', name: 'Leaf'})
    await expect.element(leaf()).toHaveTextContent(':2:')
    const report = await resultOf({kind: 'track', action: 'report'})
    const components = Array.isArray(report.components) ? report.components : []
    expect(
      components.some(
        (entry) => typeof entry === 'object' && entry !== null && 'component' in entry && entry.component === 'Leaf',
      ),
    ).toBe(true)
    const stopped = await resultOf({kind: 'track', action: 'stop'})
    expect(stopped.tracking).toBe(false)
  })
})
