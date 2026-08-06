import type {PageError} from '@conciv/protocol/page-types'
import {collectClientTools} from '@conciv/extension'
import {installReactBridge, makeDomPageDriver, type PageDriver} from '@conciv/page'
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest'
import {page} from 'vitest/browser'
import {createRoot, type Root} from 'react-dom/client'
import pageExtension from '../src/client.js'
import {PAGE_TOOL_DEFS, PAGE_TOOL_PREFIX} from '../src/shared/defs.js'
import {ControlledForm, FixtureApp} from './fixtures/react-app.js'

let container: HTMLElement
let reactRoot: Root
let driver: PageDriver

const leaf = () => page.getByRole('button', {name: /^A:/})
const counter = () => page.getByRole('status')
const formState = () => page.getByText(/^subscribed:/)

const declaredOutputOf = (verb: string) => {
  const tool = PAGE_TOOL_DEFS.find((candidate) => candidate.name === `${PAGE_TOOL_PREFIX}${verb}`)
  const output = tool?.outputSchema
  if (!output) throw new Error(`no page tool declares an output for page.${verb}`)
  return output
}

const resultOf = async (verb: string, input: Record<string, unknown> = {}): Promise<Record<string, unknown>> => {
  const outcome = await driver.execute({name: `${PAGE_TOOL_PREFIX}${verb}`, input})
  if (!outcome.ok) throw new Error(`expected a result for ${verb}, got ${outcome.error.code}`)
  const result = {...outcome.result}
  expect(declaredOutputOf(verb).parse(result)).toEqual(result)
  return result
}

const failureOf = async (verb: string, input: Record<string, unknown> = {}): Promise<PageError> => {
  const outcome = await driver.execute({name: `${PAGE_TOOL_PREFIX}${verb}`, input})
  if (outcome.ok) throw new Error(`expected a failure for ${verb}, got a result`)
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
  driver = makeDomPageDriver({tools: collectClientTools([pageExtension])})
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
    expect(await resultOf('text', {selector: '#prose'})).toEqual({text: 'hello page'})
    const snapshot = await resultOf('snapshot')
    const nodes = Array.isArray(snapshot.nodes) ? snapshot.nodes : []
    expect(nodes.length).toBeGreaterThan(0)
    const first = nodes[0] && typeof nodes[0] === 'object' ? {...nodes[0]} : {}
    const viaRef = await resultOf('text', {ref: String(first.ref)})
    expect(typeof viaRef.text).toBe('string')
    const viaName = await resultOf('text', {name: 'Leaf'})
    expect(String(viaName.text)).toContain('A:')
  })

  it('explains each way a target can be missing, as an invalid-args failure', async () => {
    expect(await failureOf('click', {ref: 'v999'})).toEqual({
      code: 'invalid-args',
      message: 'stale ref v999; re-run page snapshot',
    })
    expect(await failureOf('click', {name: 'Nope'})).toEqual({
      code: 'invalid-args',
      message: 'no React component named "Nope" found',
    })
    expect(await failureOf('click', {selector: '#missing'})).toEqual({
      code: 'invalid-args',
      message: 'no element for selector #missing',
    })
    expect(await failureOf('click')).toEqual({
      code: 'invalid-args',
      message: 'no target: pass ref, selector, or name',
    })
  })
})

describe('dom verbs', () => {
  it('clicks through React handlers and mirrors the action', async () => {
    expect(await resultOf('click', {selector: '[data-fixture="leaf"]'})).toEqual({ok: true})
    await expect.element(leaf()).toHaveTextContent(':1:')
    expect(document.querySelector('[data-conciv-cursor]')).not.toBeNull()
  })

  it('fills form fields with native events', async () => {
    expect(await resultOf('fill', {selector: '#field', value: 'typed'})).toEqual({ok: true, value: 'typed'})
    expect(await resultOf('value', {selector: '#field'})).toEqual({value: 'typed'})
    expect(await failureOf('fill', {selector: '#prose', value: 'x'})).toEqual({
      code: 'invalid-args',
      message: 'fill target is not an input/textarea/select',
    })
  })

  it('drives React-controlled checkboxes and radios so component state follows', async () => {
    expect(await resultOf('check', {selector: '#subscribe'})).toEqual({ok: true, checked: true})
    await expect.element(formState()).toHaveTextContent('subscribed: true')

    expect(await resultOf('check', {selector: '#subscribe'})).toEqual({ok: true, checked: true})
    await expect.element(formState()).toHaveTextContent('subscribed: true')

    expect(await resultOf('uncheck', {selector: '#subscribe'})).toEqual({ok: true, checked: false})
    await expect.element(formState()).toHaveTextContent('subscribed: false')

    expect(await resultOf('check', {selector: '#plan-pro'})).toEqual({ok: true, checked: true})
    await expect.element(formState()).toHaveTextContent('plan: pro')

    expect(await failureOf('uncheck', {selector: '#plan-pro'})).toEqual({
      code: 'invalid-args',
      message: 'cannot uncheck a radio; check another radio in the same group instead',
    })
    await expect.element(formState()).toHaveTextContent('plan: pro')

    expect(await resultOf('check', {selector: '#plan-free'})).toEqual({ok: true, checked: true})
    await expect.element(formState()).toHaveTextContent('plan: free')
  })

  it('mutates attributes, classes, styles, text, and structure', async () => {
    await resultOf('setattr', {selector: '#prose', attribute: 'data-mark', value: 'on'})
    expect(document.querySelector('#prose')?.getAttribute('data-mark')).toBe('on')
    expect((await failureOf('setattr', {selector: '#prose', value: 'on'})).code).toBe('invalid-args')
    await resultOf('removeattr', {selector: '#prose', attribute: 'data-mark'})
    expect(document.querySelector('#prose')?.hasAttribute('data-mark')).toBe(false)
    await resultOf('addclass', {selector: '#prose', class: 'hot'})
    expect(document.querySelector('#prose')?.classList.contains('hot')).toBe(true)
    await resultOf('settext', {selector: '#prose', text: 'rewritten'})
    expect(document.querySelector('#prose')?.textContent).toBe('rewritten')
    await resultOf('insert', {selector: '#prose', html: '<em id="added">x</em>', position: 'after'})
    expect(document.querySelector('#added')).not.toBeNull()
    await resultOf('remove', {selector: '#added'})
    expect(document.querySelector('#added')).toBeNull()
  })

  it('reports route, existence, and query matches', async () => {
    const route = await resultOf('route')
    expect(route.pathname).toBe(location.pathname)
    expect(await resultOf('exists', {selector: '#frm'})).toEqual({exists: true, count: 1})
    const query = await resultOf('query', {selector: 'input'})
    expect(query.count).toBe(4)
  })

  it('waits for visibility and times out with an explanation', async () => {
    expect(await resultOf('wait', {selector: '#prose', state: 'visible', timeout: 500})).toEqual({
      ok: true,
      state: 'visible',
    })
    expect(await failureOf('wait', {selector: '#missing', state: 'visible', timeout: 150})).toEqual({
      code: 'handler-error',
      message: 'wait timed out for #missing (visible)',
    })
  })

  it('evaluates code and serializes element results', async () => {
    const value = await resultOf('eval', {code: 'return 2 + 3'})
    expect(value).toEqual({result: 5})
    const element = await resultOf('eval', {code: 'return document.querySelector("#frm")'})
    expect(element.result).toMatchObject({tagName: 'form'})
  })

  it('injects css stylesheets', async () => {
    expect(await resultOf('css', {text: '#prose{letter-spacing:3px}'})).toEqual({ok: true})
    expect(document.querySelector('style[data-vibe-css]')?.textContent).toContain('letter-spacing')
  })
})

describe('react verbs through the dispatcher', () => {
  it('inspects a component and navigates into its props by path', async () => {
    const full = await resultOf('inspect', {name: 'Leaf'})
    expect(full.component).toBe('Leaf')
    const byPath = await resultOf('inspect', {name: 'Leaf', path: 'props.label'})
    expect(byPath.value).toBe('A')
    expect(await failureOf('inspect', {name: 'Leaf', path: 'props.missing.deep'})).toEqual({
      code: 'invalid-args',
      message: 'path not found: props.missing.deep',
    })
  })

  it('overrides props and validates its inputs', async () => {
    expect((await failureOf('override', {name: 'Counter'})).code).toBe('invalid-args')
    expect(await failureOf('override', {name: 'Counter', target: 'state', json: '{nope'})).toEqual({
      code: 'invalid-args',
      message: '--json is not valid JSON: {nope',
    })
    const set = await resultOf('override', {name: 'Counter', target: 'state', path: 'value', json: '77'})
    expect(set.ok).toBe(true)
    await expect.element(counter()).toHaveTextContent('77')
  })

  it('tracks renders between start and stop', async () => {
    await resultOf('track', {action: 'start'})
    await resultOf('click', {name: 'Leaf'})
    await expect.element(leaf()).toHaveTextContent(':2:')
    const report = await resultOf('track', {action: 'report'})
    const components = Array.isArray(report.components) ? report.components : []
    expect(
      components.some(
        (entry) => typeof entry === 'object' && entry !== null && 'component' in entry && entry.component === 'Leaf',
      ),
    ).toBe(true)
    const stopped = await resultOf('track', {action: 'stop'})
    expect(stopped.tracking).toBe(false)
  })
})

describe('stale refs', () => {
  it('a snapshot ref whose element React removed fails as stale instead of acting on a detached node', async () => {
    const ephemeral = document.createElement('button')
    ephemeral.id = 'ephemeral-btn'
    ephemeral.textContent = 'Ephemeral target'
    container.appendChild(ephemeral)
    const snapshot = await resultOf('snapshot')
    const nodes = Array.isArray(snapshot.nodes) ? snapshot.nodes : []
    const entry = nodes.flatMap((node) =>
      typeof node === 'object' && node !== null && 'name' in node && node.name === 'Ephemeral target' ? [node] : [],
    )[0]
    const ref = entry && 'ref' in entry ? String(entry.ref) : ''
    expect(ref).not.toBe('')
    expect(await resultOf('text', {ref})).toEqual({text: 'Ephemeral target'})
    ephemeral.remove()
    expect(await failureOf('text', {ref})).toEqual({
      code: 'invalid-args',
      message: `stale ref ${ref}; re-run page snapshot`,
    })
  })
})

describe('the effect stub', () => {
  it('fails honestly, as documented in the catalog hint', async () => {
    expect(await failureOf('effect', {effect: 'confetti'})).toEqual({
      code: 'handler-error',
      message: 'effects not initialized',
    })
  })
})
