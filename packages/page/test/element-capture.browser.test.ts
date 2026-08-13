import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
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
  return {ok: true}
})

const editText = defineTool({
  name: 'probe.settext',
  description: 'replaces the text of an element',
  inputSchema: z.object({selector: z.string(), text: z.string()}),
  outputSchema: z.object({ok: z.literal(true)}),
  meta: {summary: 'set element text', category: 'edit-live', mutating: true, capture: 'before-after'},
}).client((input, ctx) => {
  ctx.target(input).textContent = input.text
  return {ok: true}
})

const editRemove = defineTool({
  name: 'probe.remove',
  description: 'removes an element',
  inputSchema: z.object({selector: z.string()}),
  outputSchema: z.object({ok: z.literal(true)}),
  meta: {summary: 'remove an element', category: 'edit-live', mutating: true, capture: 'before-after'},
}).client((input, ctx) => {
  ctx.target(input).remove()
  return {ok: true}
})

const editStyled = defineTool({
  name: 'probe.settextstyled',
  description: 'replaces the text of an element while the page injects a rule',
  inputSchema: z.object({selector: z.string(), text: z.string()}),
  outputSchema: z.object({ok: z.literal(true)}),
  meta: {summary: 'set element text under a new rule', category: 'edit-live', mutating: true, capture: 'before-after'},
}).client((input, ctx) => {
  const el = ctx.target(input)
  const injected = document.createElement('style')
  injected.id = 'injected-sheet'
  injected.textContent = '.capture-form .injected {color: rgb(9, 9, 9);}'
  document.head.appendChild(injected)
  el.textContent = input.text
  return {ok: true}
})

const actMark = defineTool({
  name: 'probe.mark',
  description: 'marks an element without touching its children',
  inputSchema: z.object({selector: z.string()}),
  outputSchema: z.object({ok: z.literal(true)}),
  meta: {summary: 'mark an element', category: 'act', mutating: true, capture: 'after'},
}).client((input, ctx) => {
  ctx.target(input).setAttribute('data-marked', 'true')
  return {ok: true}
})

const probes = defineExtension({
  name: 'capture-probes',
  tools: [readValue, actFill, editText, editRemove, editStyled, actMark],
}).client(() => ({value: {}}))

const PASSWORD = 'hunter2-not-in-any-payload'
const CARD_SENTINEL = 'card-sentinel-0000'

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
      <input id="card" autocomplete="cc-number" value="${CARD_SENTINEL}">
      <span id="doomed">temporary</span>
      <div id="hostile">
        <a id="hostile-link" href="javascript:window.__xssCapture = true" onmouseover="window.__xssCapture = true">click</a>
        <img id="hostile-img" src="x" onerror="window.__xssCapture = true">
        <iframe id="hostile-frame" srcdoc="&lt;script&gt;window.__xssCapture = true&lt;/script&gt;"></iframe>
        <object id="hostile-object" data="javascript:window.__xssCapture = true"></object>
        <embed id="hostile-embed" src="javascript:window.__xssCapture = true">
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
  document.getElementById('injected-sheet')?.remove()
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

const FIXTURE_IMAGE_URL = new URL('./fixtures/sample.png', import.meta.url).href

function crossOriginFixtureImageUrl(): string {
  const fixture = new URL(FIXTURE_IMAGE_URL)
  fixture.hostname = '[::1]'
  return fixture.href
}

function mediaContainer(): HTMLDivElement {
  const panel = host.querySelector('#panel')
  if (panel === null) throw new Error('the fixture panel is missing')
  const media = document.createElement('div')
  media.id = 'media'
  panel.appendChild(media)
  return media
}

function solidPaint(context: CanvasRenderingContext2D, width: number, height: number): void {
  context.fillStyle = 'rgb(200, 30, 30)'
  context.fillRect(0, 0, width, height)
}

function noisePaint(context: CanvasRenderingContext2D, width: number, height: number): void {
  const pixels = context.createImageData(width, height)
  for (let index = 0; index < pixels.data.length; index += 1) {
    pixels.data[index] = Math.floor(Math.random() * 256)
  }
  context.putImageData(pixels, 0, 0)
}

async function paintedBlobUrl(
  width: number,
  height: number,
  paint: (context: CanvasRenderingContext2D, width: number, height: number) => void,
): Promise<string> {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (context === null) throw new Error('the canvas exposes no context')
  paint(context, width, height)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve))
  if (blob === null) throw new Error('the canvas produced no blob')
  return URL.createObjectURL(blob)
}

async function appendLoadedImage(parent: Element, id: string, src: string): Promise<HTMLImageElement> {
  const image = document.createElement('img')
  image.id = id
  image.src = src
  parent.appendChild(image)
  await image.decode()
  return image
}

function requiredDataUrl(node: unknown, id: string): string {
  const value = findById(node, id)?.attributes?.['rr_dataURL']
  if (typeof value !== 'string') throw new Error(`the ${id} image carries no inlined data url`)
  return value
}

function inlineImageCost(dataUrl: string): number {
  return dataUrl.length + 'rr_dataURL'.length + 6
}

async function decodedDataUrlSize(dataUrl: string): Promise<{width: number; height: number}> {
  const probe = new Image()
  probe.src = dataUrl
  await probe.decode()
  return {width: probe.naturalWidth, height: probe.naturalHeight}
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
    const bundle = await captureOf('probe.fill', {selector: '#card', value: CARD_SENTINEL})
    const node = JSON.stringify(bundle.after?.node ?? null)
    expect(node).toContain('data-rr-target')
    expect(node).toContain('capture-form')
    expect(bundle.after?.cssBundleId).toMatch(/^css/)
    expect(bundle.cssBundles?.at(0)?.css).toContain('.capture-form .cta')
  })

  it('carries the css bundle on every capture so a dropped one never leaves a dangling reference', async () => {
    const first = await captureOf('probe.fill', {selector: '#card', value: '1'})
    const second = await captureOf('probe.fill', {selector: '#card', value: '2'})
    expect(second.after?.cssBundleId).toBe(first.after?.cssBundleId)
    expect(second.cssBundles?.at(0)?.hash).toBe(second.after?.cssBundleId)
    expect(second.cssBundles?.at(0)?.css).toBe(first.cssBundles?.at(0)?.css)
  })

  it('keeps a css bundle for each side when the page injects a rule while the tool runs', async () => {
    const bundle = await captureOf('probe.settextstyled', {selector: '#prose', text: 'restyled'})
    const beforeId = bundle.before?.cssBundleId
    const afterId = bundle.after?.cssBundleId
    expect(beforeId).toBeDefined()
    expect(afterId).toBeDefined()
    expect(beforeId).not.toBe(afterId)

    const byHash = new Map((bundle.cssBundles ?? []).map((entry) => [entry.hash, entry.css]))
    expect(byHash.size).toBe(2)
    expect(byHash.get(beforeId ?? '')).not.toContain('.injected')
    expect(byHash.get(afterId ?? '')).toContain('.injected')
  })

  it('keeps a password out of the capture payload and out of the result', async () => {
    const outcome = await driver.execute({name: 'probe.fill', input: {selector: '#secret', value: 'typed'}})
    if (!outcome.ok) throw new Error('the fill failed')
    expect(JSON.stringify(outcome.result)).not.toContain(PASSWORD)
    expect(JSON.stringify(outcome.capture)).not.toContain(PASSWORD)
    expect(outcome.capture?.after?.descriptor.value).toBe('***')
  })

  it('keeps a payment field out of the capture payload and out of the result', async () => {
    const outcome = await driver.execute({name: 'probe.fill', input: {selector: '#card', value: CARD_SENTINEL}})
    if (!outcome.ok) throw new Error('the fill failed')
    expect(JSON.stringify(outcome.result)).not.toContain(CARD_SENTINEL)
    expect(JSON.stringify(outcome.capture)).not.toContain(CARD_SENTINEL)
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
    expect(findById(node, 'hostile-object')).toBeUndefined()
    expect(findById(node, 'hostile-embed')).toBeUndefined()

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

  it('inlines a same-origin image as a webp data url at rendered size while its remote src is stripped', async () => {
    const media = mediaContainer()
    const image = await appendLoadedImage(media, 'fixture-image', FIXTURE_IMAGE_URL)
    image.style.width = '24px'
    image.style.height = '16px'

    const bundle = await captureOf('probe.mark', {selector: '#media'})
    const imageNode = findById(bundle.after?.node, 'fixture-image')

    expect(imageNode).toBeDefined()
    expect(imageNode?.attributes?.['src']).toBeUndefined()
    const dataUrl = imageNode?.attributes?.['rr_dataURL']
    if (typeof dataUrl !== 'string') throw new Error('the image carries no inlined data url')
    expect(dataUrl.startsWith('data:image/webp')).toBe(true)
    expect(await decodedDataUrlSize(dataUrl)).toEqual({width: 24, height: 16})
  })

  it('admits images in document order: with room for only one of two equal images, the first wins', async () => {
    const media = mediaContainer()
    const noiseUrl = await paintedBlobUrl(64, 64, noisePaint)
    await appendLoadedImage(media, 'first-image', noiseUrl)
    await appendLoadedImage(media, 'second-image', noiseUrl)

    const unconstrained = await captureOf('probe.mark', {selector: '#media'})
    const probeNode = unconstrained.after?.node
    const firstCost = inlineImageCost(requiredDataUrl(probeNode, 'first-image'))
    const secondCost = inlineImageCost(requiredDataUrl(probeNode, 'second-image'))
    const baseBytes = JSON.stringify(probeNode).length - firstCost - secondCost

    const filler = document.createElement('div')
    filler.id = 'filler'
    filler.textContent = 'x'.repeat(200_000 - baseBytes - firstCost - Math.floor(firstCost / 2))
    media.appendChild(filler)

    const bundle = await captureOf('probe.mark', {selector: '#media'})
    const node = bundle.after?.node

    expect(node).toBeDefined()
    expect(requiredDataUrl(node, 'first-image').startsWith('data:image/webp')).toBe(true)
    expect(findById(node, 'second-image')).toBeDefined()
    expect(findById(node, 'second-image')?.attributes?.['rr_dataURL']).toBeUndefined()
    expect(JSON.stringify(node).length).toBeLessThanOrEqual(200_000)
  })

  it('measures the payload budget in utf-8 bytes, not utf-16 code units', async () => {
    const media = mediaContainer()
    const filler = document.createElement('div')
    filler.id = 'wide-filler'
    filler.textContent = '€'.repeat(69_000)
    media.appendChild(filler)

    const bundle = await captureOf('probe.mark', {selector: '#media'})

    expect(bundle.after?.descriptor.selectorPath).toContain('#media')
    expect(bundle.after?.node).toBeUndefined()
  })

  it('rejects an encoder failure instead of admitting a non-image data url, while a sibling image still inlines', async () => {
    const media = mediaContainer()
    const oversized = await appendLoadedImage(media, 'oversized-image', await paintedBlobUrl(8, 8, solidPaint))
    oversized.style.width = '70000px'
    oversized.style.height = '10px'
    await appendLoadedImage(media, 'sibling-image', await paintedBlobUrl(8, 8, solidPaint))

    const bundle = await captureOf('probe.mark', {selector: '#media'})
    const node = bundle.after?.node

    expect(findById(node, 'sibling-image')?.attributes?.['rr_dataURL']).toBeDefined()
    expect(findById(node, 'oversized-image')).toBeDefined()
    expect(findById(node, 'oversized-image')?.attributes?.['rr_dataURL']).toBeUndefined()
  })

  it('leaves the live element untouched and silent when the canvas taints, while a sibling image still inlines', async () => {
    const media = mediaContainer()
    const tainted = await appendLoadedImage(media, 'tainted-image', crossOriginFixtureImageUrl())
    await appendLoadedImage(media, 'clean-image', await paintedBlobUrl(8, 8, solidPaint))
    const attributeNamesBefore = tainted.getAttributeNames().join(',')
    const warnSpy = vi.spyOn(console, 'warn')
    const errorSpy = vi.spyOn(console, 'error')
    const listenerSpy = vi.spyOn(tainted, 'addEventListener')

    const bundle = await captureOf('probe.mark', {selector: '#media'})
    const node = bundle.after?.node

    expect(findById(node, 'clean-image')?.attributes?.['rr_dataURL']).toBeDefined()
    expect(findById(node, 'tainted-image')).toBeDefined()
    expect(findById(node, 'tainted-image')?.attributes?.['rr_dataURL']).toBeUndefined()
    expect(tainted.getAttributeNames().join(',')).toBe(attributeNamesBefore)
    expect(tainted.getAttribute('crossorigin')).toBeNull()
    expect(listenerSpy).not.toHaveBeenCalled()
    expect(warnSpy).not.toHaveBeenCalled()
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('never inlines a conciv-block image, direct or nested', async () => {
    const media = mediaContainer()
    const blockedImage = await appendLoadedImage(media, 'blocked-image', await paintedBlobUrl(8, 8, solidPaint))
    blockedImage.className = 'conciv-block'
    const blockedWrap = document.createElement('div')
    blockedWrap.className = 'conciv-block'
    media.appendChild(blockedWrap)
    await appendLoadedImage(blockedWrap, 'nested-blocked-image', await paintedBlobUrl(8, 8, solidPaint))
    await appendLoadedImage(media, 'plain-image', await paintedBlobUrl(8, 8, solidPaint))

    const bundle = await captureOf('probe.mark', {selector: '#media'})
    const node = bundle.after?.node

    expect(findById(node, 'plain-image')?.attributes?.['rr_dataURL']).toBeDefined()
    expect(findById(node, 'nested-blocked-image')).toBeUndefined()
    const serialized = JSON.stringify(node)
    expect(serialized.split('rr_dataURL').length - 1).toBe(1)
  })

  it('omits the serialized node and keeps the descriptor when the subtree blows past the payload budget', async () => {
    const panel = host.querySelector('#panel')
    if (panel === null) throw new Error('the fixture panel is missing')
    const bloat = document.createElement('div')
    bloat.id = 'bloated'
    for (let index = 0; index < 20_000; index += 1) {
      const span = document.createElement('span')
      span.textContent = `padding-row-${index}`
      bloat.appendChild(span)
    }
    panel.appendChild(bloat)

    const bundle = await captureOf('probe.mark', {selector: '#bloated'})

    expect(bundle.after?.descriptor.selectorPath).toContain('#bloated')
    expect(bundle.after?.node).toBeUndefined()
  })
})
