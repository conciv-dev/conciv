import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {z} from 'zod'
import {collectClientTools, defineExtension, defineTool, toolError} from '@conciv/extension'
import {makeDomPageDriver, type PageDriver} from '../src/page-driver.js'

const readText = defineTool({
  name: 'probe.text',
  description: 'reads text through the dispatcher ctx',
  inputSchema: z.object({selector: z.string().optional(), ref: z.string().optional()}),
  outputSchema: z.object({text: z.string()}),
  meta: {summary: 'read text through the dispatcher', category: 'read'},
}).client((input, ctx) => ({text: ctx.target(input).textContent ?? ''}))

const mirroredClick = defineTool({
  name: 'probe.click',
  description: 'clicks through the dispatcher ctx and mirrors',
  inputSchema: z.object({selector: z.string()}),
  outputSchema: z.object({ok: z.literal(true)}),
  meta: {summary: 'click through the dispatcher', category: 'act', mutating: true, mirrors: true},
}).client((input, ctx) => {
  const el = ctx.target(input)
  if (!(el instanceof HTMLElement)) throw toolError('NOT_CLICKABLE')
  el.click()
  return {ok: true}
})

const refMaker = defineTool({
  name: 'probe.mark',
  description: 'adds a ref for the target element',
  inputSchema: z.object({selector: z.string()}),
  outputSchema: z.object({ref: z.string()}),
  meta: {summary: 'add a ref through the dispatcher', category: 'read'},
}).client((input, ctx) => ({ref: ctx.addRef(ctx.target(input))}))

const raiser = defineTool({
  name: 'probe.raise',
  description: 'throws a typed tool error',
  inputSchema: z.object({}),
  outputSchema: z.object({}),
  errors: {NO_LUCK: {message: 'nothing to raise'}},
  meta: {summary: 'raise a declared error through the dispatcher', category: 'read'},
}).client(() => {
  throw toolError('NO_LUCK', {message: 'not today'})
})

const misbehaved = defineTool({
  name: 'probe.badresult',
  description: 'returns a non-record result',
  inputSchema: z.object({}),
  outputSchema: z.object({}),
  meta: {summary: 'return a non-record result', category: 'read'},
}).client(() => 42)

const probes = defineExtension({
  name: 'probes',
  tools: [readText, mirroredClick, refMaker, raiser, misbehaved],
}).client(() => ({value: {}}))

let host: HTMLElement
let driver: PageDriver

beforeAll(() => {
  host = document.createElement('div')
  host.innerHTML = `
    <p id="prose">hello dispatcher</p>
    <button id="btn" onclick="this.textContent='clicked'">press</button>
  `
  document.body.appendChild(host)
  driver = makeDomPageDriver({tools: collectClientTools([probes])})
})

afterAll(() => {
  driver.dispose()
  host.remove()
})

describe('the page-tool dispatcher', () => {
  it('runs a client body by registry name with a lazily resolved target', async () => {
    expect(await driver.execute({name: 'probe.text', input: {selector: '#prose'}})).toEqual({
      ok: true,
      result: {text: 'hello dispatcher'},
    })
  })

  it('rejects an undeclared name as unknown-verb', async () => {
    expect(await driver.execute({name: 'probe.nothing', input: {}})).toEqual({
      ok: false,
      error: {code: 'unknown-verb', message: 'no mounted extension declares a client tool named "probe.nothing"'},
    })
  })

  it('explains each way a target can be missing, as an invalid-args failure', async () => {
    const stale = await driver.execute({name: 'probe.text', input: {ref: 'v999'}})
    expect(stale).toEqual({ok: false, error: {code: 'invalid-args', message: 'stale ref v999; re-run page snapshot'}})
    const missing = await driver.execute({name: 'probe.text', input: {selector: '#nope'}})
    expect(missing).toEqual({ok: false, error: {code: 'invalid-args', message: 'no element for selector #nope'}})
    const bare = await driver.execute({name: 'probe.text', input: {}})
    expect(bare).toEqual({ok: false, error: {code: 'invalid-args', message: 'no target: pass ref, selector, or name'}})
  })

  it('mirrors an action when the declaration says so and shares refs across calls', async () => {
    const marked = await driver.execute({name: 'probe.mark', input: {selector: '#btn'}})
    if (!marked.ok) throw new Error('mark failed')
    const ref = String(marked.result.ref)
    expect(await driver.execute({name: 'probe.click', input: {selector: '#btn'}})).toEqual({
      ok: true,
      result: {ok: true},
    })
    expect(document.querySelector('[data-conciv-cursor]')).not.toBeNull()
    expect(await driver.execute({name: 'probe.text', input: {ref}})).toEqual({ok: true, result: {text: 'clicked'}})
  })

  it('carries a thrown toolError as a raised handler-error', async () => {
    expect(await driver.execute({name: 'probe.raise', input: {}})).toEqual({
      ok: false,
      error: {code: 'handler-error', message: 'not today', raised: {code: 'NO_LUCK', message: 'not today'}},
    })
  })

  it('reports a schema-rejected input as invalid-args', async () => {
    const outcome = await driver.execute({name: 'probe.click', input: {}})
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.error.code).toBe('invalid-args')
  })

  it('refuses a non-record result', async () => {
    expect(await driver.execute({name: 'probe.badresult', input: {}})).toEqual({
      ok: false,
      error: {code: 'handler-error', message: 'probe.badresult returned a non-serializable result'},
    })
  })
})
