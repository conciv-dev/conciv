import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import {z} from 'zod'
import {collectClientTools, defineExtension, defineTool} from '@conciv/extension'
import type {ElementCapture, PageCaptureBundle} from '@conciv/protocol/element-capture-types'
import {makeDomPageDriver, type PageDriver} from '../src/page-driver.js'

const readValue = defineTool({
  name: 'probe.readvalue',
  description: 'reads a value without capturing',
  inputSchema: z.object({selector: z.string()}),
  outputSchema: z.object({value: z.string()}),
  meta: {summary: 'read a value', category: 'read'},
}).client((input, ctx) => {
  const el = ctx.target(input)
  return {value: el instanceof HTMLInputElement ? el.value : (el.textContent ?? '')}
})

const actFill = defineTool({
  name: 'probe.fill',
  description: 'types into an input',
  inputSchema: z.object({selector: z.string(), value: z.string()}),
  outputSchema: z.object({ok: z.literal(true)}),
  meta: {summary: 'fill an input', category: 'act', mutating: true, capture: 'after'},
}).client((input, ctx) => {
  const el = ctx.target(input)
  if (el instanceof HTMLInputElement) el.value = input.value
  return {ok: true as const}
})

const editText = defineTool({
  name: 'probe.settext',
  description: 'replaces the text of an element',
  inputSchema: z.object({selector: z.string(), text: z.string()}),
  outputSchema: z.object({ok: z.literal(true)}),
  meta: {summary: 'set element text', category: 'edit-live', mutating: true, capture: 'before-after'},
}).client((input, ctx) => {
  ctx.target(input).textContent = input.text
  return {ok: true as const}
})

const editRemove = defineTool({
  name: 'probe.remove',
  description: 'removes an element',
  inputSchema: z.object({selector: z.string()}),
  outputSchema: z.object({ok: z.literal(true)}),
  meta: {summary: 'remove an element', category: 'edit-live', mutating: true, capture: 'before-after'},
}).client((input, ctx) => {
  ctx.target(input).remove()
  return {ok: true as const}
})

const actMark = defineTool({
  name: 'probe.mark',
  description: 'marks an element without touching its children',
  inputSchema: z.object({selector: z.string()}),
  outputSchema: z.object({ok: z.literal(true)}),
  meta: {summary: 'mark an element', category: 'act', mutating: true, capture: 'after'},
}).client((input, ctx) => {
  ctx.target(input).setAttribute('data-marked', 'true')
  return {ok: true as const}
})

const probes = defineExtension({
  name: 'capture-probes',
  tools: [readValue, actFill, editText, editRemove, actMark],
}).client(() => ({value: {}}))

const PASSWORD = 'hunter2-not-in-any-payload'

let host: HTMLElement
let style: HTMLStyleElement
let driver: PageDriver

beforeEach(() => {
  style = document.createElement('style')
  style.textContent = '.capture-form .cta {color: rgb(1, 2, 3);}'
  document.head.appendChild(style)
  host = document.createElement('div')
  host.className = 'capture-form'
  host.innerHTML = `
    <section id="panel" class="theme-light">
      <button id="cta" class="cta">Send it</button>
      <p id="prose">original prose</p>
      <input id="secret" type="password" autocomplete="current-password" value="${PASSWORD}">
      <input id="card" autocomplete="cc-number" value="4111111111111111">
      <span id="doomed">temporary</span>
      <div id="hostile">
        <a id="hostile-link" href="javascript:window.__xssCapture = true" onmouseover="window.__xssCapture = true">click</a>
        <img id="hostile-img" src="x" onerror="window.__xssCapture = true">
        <iframe id="hostile-frame" srcdoc="&lt;script&gt;window.__xssCapture = true&lt;/script&gt;"></iframe>
        <link id="hostile-sheet" rel="stylesheet" href="/conciv-capture-probe/linked.css">
      </div>
    </section>
  `
  const hostileScript = document.createElement('script')
  hostileScript.id = 'hostile-script'
  hostileScript.textContent = 'window.__xssCapture = true'
  host.querySelector('#hostile')?.appendChild(hostileScript)
  const hostileOverflowLink = document.createElement('a')
  hostileOverflowLink.id = 'hostile-overflow-link'
  hostileOverflowLink.setAttribute('href', '&#x110000;javascript:window.__xssCapture = true')
  hostileOverflowLink.textContent = 'overflowing'
  host.querySelector('#hostile')?.appendChild(hostileOverflowLink)
  const hostileTabLink = document.createElement('a')
  hostileTabLink.id = 'hostile-tab-link'
  hostileTabLink.setAttribute('href', 'java\tscript:window.__xssCapture = true')
  hostileTabLink.textContent = 'click too'
  host.querySelector('#hostile')?.appendChild(hostileTabLink)
  document.body.appendChild(host)
  driver = makeDomPageDriver({tools: collectClientTools([probes])})
})

afterEach(() => {
  driver.dispose()
  host.remove()
  style.remove()
})

async function captureOf(name: string, input: Record<string, unknown>): Promise<PageCaptureBundle> {
  const outcome = await driver.execute({name, input})
  if (!outcome.ok) throw new Error(`the ${name} call failed: ${outcome.error.message}`)
  if (outcome.capture === undefined) throw new Error(`the ${name} call carried no capture`)
  return outcome.capture
}

function serializedText(capture: ElementCapture): string {
  return JSON.stringify(capture.node ?? null)
}

type ProbeNode = {
  tagName?: string
  attributes?: Record<string, unknown>
  childNodes?: ProbeNode[]
}

function isProbeNode(value: unknown): value is ProbeNode {
  return typeof value === 'object' && value !== null
}

function findById(node: unknown, id: string): ProbeNode | undefined {
  if (!isProbeNode(node)) return undefined
  if (node.attributes?.['id'] === id) return node
  for (const child of node.childNodes ?? []) {
    const found = findById(child, id)
    if (found !== undefined) return found
  }
  return undefined
}

describe('a page tool capture freezes the element as it was when the tool ran', () => {
  it('survives a later class flip and a later deletion of the captured node', async () => {
    const bundle = await captureOf('probe.settext', {selector: '#prose', text: 'rewritten'})
    const after = bundle.after
    if (after === undefined) throw new Error('the edit carried no after capture')
    expect(after.descriptor.accessibleName).toBe('rewritten')
    expect(bundle.before?.descriptor.accessibleName).toBe('original prose')

    document.querySelector('#panel')?.classList.replace('theme-light', 'theme-dark')
    document.querySelector('#prose')?.remove()

    expect(bundle.before?.descriptor.accessibleName).toBe('original prose')
    expect(serializedText(after)).toContain('theme-light')
    expect(serializedText(after)).not.toContain('theme-dark')
  })

  it('carries the ancestor skeleton down to a marked target so page css still matches', async () => {
    const bundle = await captureOf('probe.fill', {selector: '#card', value: '4111111111111111'})
    const node = JSON.stringify(bundle.after?.node ?? null)
    expect(node).toContain('data-rr-target')
    expect(node).toContain('capture-form')
    expect(bundle.after?.cssBundleId).toMatch(/^css/)
    expect(bundle.cssBundle?.css).toContain('.capture-form .cta')
  })

  it('carries the css bundle on every capture so a dropped one never leaves a dangling reference', async () => {
    const first = await captureOf('probe.fill', {selector: '#card', value: '1'})
    const second = await captureOf('probe.fill', {selector: '#card', value: '2'})
    expect(second.after?.cssBundleId).toBe(first.after?.cssBundleId)
    expect(second.cssBundle?.hash).toBe(second.after?.cssBundleId)
    expect(second.cssBundle?.css).toBe(first.cssBundle?.css)
  })

  it('keeps a password and a payment field out of the capture payload and out of the result', async () => {
    const outcome = await driver.execute({name: 'probe.fill', input: {selector: '#secret', value: 'typed'}})
    if (!outcome.ok) throw new Error('the fill failed')
    expect(JSON.stringify(outcome.result)).not.toContain(PASSWORD)
    expect(JSON.stringify(outcome.capture)).not.toContain(PASSWORD)
    expect(JSON.stringify(outcome.capture)).not.toContain('4111111111111111')
    expect(outcome.capture?.after?.descriptor.value).toBe('***')
  })

  it('takes no capture for a read verb', async () => {
    const outcome = await driver.execute({name: 'probe.readvalue', input: {selector: '#prose'}})
    expect(outcome).toEqual({ok: true, result: {value: 'original prose'}})
  })

  it('records a before side and no after side when the verb detaches the element', async () => {
    const bundle = await captureOf('probe.remove', {selector: '#doomed'})
    expect(bundle.before?.descriptor.accessibleName).toBe('temporary')
    expect(bundle.after).toBeUndefined()
  })

  it('degrades to a descriptor when the target subtree holds the conciv widget', async () => {
    const widget = document.createElement('div')
    widget.setAttribute('data-conciv-root', '')
    document.querySelector('#panel')?.appendChild(widget)
    const bundle = await captureOf('probe.settext', {selector: '#panel', text: 'wiped'})
    expect(bundle.before?.node).toBeUndefined()
    expect(bundle.before?.descriptor.selectorPath).toContain('#panel')
  })

  it('strips event-handler attributes, javascript: URLs, and iframe/object/embed nodes from the captured subtree', async () => {
    const bundle = await captureOf('probe.mark', {selector: '#hostile'})
    const node = bundle.after?.node
    expect(node).toBeDefined()

    const link = findById(node, 'hostile-link')
    expect(link).toBeDefined()
    expect(link?.attributes?.['onmouseover']).toBeUndefined()
    expect(link?.attributes?.['href']).toBeUndefined()

    const img = findById(node, 'hostile-img')
    expect(img).toBeDefined()
    expect(img?.attributes?.['onerror']).toBeUndefined()

    expect(findById(node, 'hostile-frame')).toBeUndefined()

    const tabLink = findById(node, 'hostile-tab-link')
    expect(tabLink).toBeDefined()
    expect(tabLink?.attributes?.['href']).toBeUndefined()

    const serialized = JSON.stringify(node)
    expect(serialized).not.toContain('onerror')
    expect(serialized).not.toContain('onmouseover')
    expect(serialized).not.toContain('javascript:')
    expect(serialized.toLowerCase()).not.toContain('iframe')
  })

  it('keeps script and stylesheet-link nodes out of the serialized payload', async () => {
    const bundle = await captureOf('probe.mark', {selector: '#hostile'})
    const node = bundle.after?.node
    expect(node).toBeDefined()

    expect(findById(node, 'hostile-script')).toBeUndefined()
    expect(findById(node, 'hostile-sheet')).toBeUndefined()

    const serialized = JSON.stringify(node).toLowerCase()
    expect(serialized).not.toContain('"script"')
    expect(serialized).not.toContain('"link"')
    expect(serialized).not.toContain('conciv-capture-probe')
  })

  it('still produces a capture when an attribute carries an out-of-range numeric character reference', async () => {
    const bundle = await captureOf('probe.mark', {selector: '#hostile'})
    const node = bundle.after?.node
    expect(node).toBeDefined()

    const overflowLink = findById(node, 'hostile-overflow-link')
    expect(overflowLink).toBeDefined()
    expect(overflowLink?.attributes?.['href']).toBeUndefined()
  })
})
