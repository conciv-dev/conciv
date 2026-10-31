import {afterEach, describe, expect, it, beforeEach, vi, beforeAll, test, afterAll} from 'vitest'
import {captureElement} from '../src/react-grab/capture-element.js'
import {z} from 'zod'
import {collectClientTools, defineExtension, defineTool, toolError, type ClientEffect} from '@conciv/extension'
import type {ElementCapture, PageCaptureBundle} from '@conciv/protocol/element-capture-types'
import {makeDomPageDriver, type PageDriver} from '../src/page-driver.js'
import {loadSnapshotLibrary} from '../src/element-capture.js'
import pageFont from '@fontsource-variable/wix-madefor-text/files/wix-madefor-text-latin-wght-normal.woff2?inline'
import {grabToFile, parseGrabPayload} from '@conciv/grab/grab-attachment'
import type {Grab, ImagePreview} from '@conciv/grab'
import {fitImagePreview} from '../src/grab-fit.js'
import {elementSnippet, groundGrabText} from '../src/react-grab/grab-text.js'
import {page} from 'vitest/browser'
import {
  addRef,
  buildSnapshot,
  describeElement,
  type RefAdder,
  type Refs,
  type SnapNode,
  addRef as addRefTo,
} from '../src/page-snapshot.js'
import {
  componentHostAt,
  describe as describeHost,
  elementByName,
  find,
  inspect,
  locate,
  override,
  tree,
} from '../src/react-bridge.js'
import {_fiberRoots} from 'bippy'
import {createRoot, type Root} from 'react-dom/client'
import {Counter, FixtureApp, Leaf} from './fixtures/react-app.js'

describe('a tool that outlasts the preview library load', () => {
  const editAfterLoad = defineTool({
    name: 'probe_edit_after_load',
    description: 'edits an element once the preview library has loaded',
    inputSchema: z.object({selector: z.string()}),
    outputSchema: z.object({ok: z.literal(true)}),
    meta: {summary: 'edit after load', category: 'edit-live', mutating: true, capture: 'before-after'},
  }).client(async (input, ctx) => {
    const el = ctx.target(input)
    await loadSnapshotLibrary()
    el.textContent = 'edited'
    return {ok: true}
  })

  const probes = defineExtension({name: 'probe-late-library', tools: [editAfterLoad]}).client(() => ({value: {}}))

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('previews the after state even though the before state was captured without the library', async () => {
    document.body.innerHTML = '<p id="late-library">original</p>'
    const driver = makeDomPageDriver({tools: collectClientTools([probes])})
    const outcome = await driver.execute({name: 'probe_edit_after_load', input: {selector: '#late-library'}})
    driver.dispose()
    if (!outcome.ok) throw new Error(`the tool failed: ${outcome.error.message}`)
    expect(outcome.capture?.before?.node).toBeUndefined()
    expect(JSON.stringify(outcome.capture?.after?.node)).toContain('edited')
  })
})

describe('capture element', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    document.head.querySelectorAll('style[data-test-capture]').forEach((node) => node.remove())
  })

  function mountStyled(): HTMLElement {
    const style = document.createElement('style')
    style.setAttribute('data-test-capture', '')
    style.textContent = '.badge::before{content:"★";color:rgb(255, 0, 0)}'
    document.head.appendChild(style)
    const host = document.createElement('div')
    host.innerHTML = `
    <section id="card" class="badge" style="position:fixed;margin:24px;color:rgb(0, 128, 0)">
      <span id="label" style="font-weight:700">tagged</span>
    </section>
  `
    document.body.appendChild(host)
    const section = host.querySelector('section')
    if (!section) throw new Error('fixture missing')
    return section instanceof HTMLElement ? section : host
  }

  function rebuild(html: string): HTMLElement {
    const host = document.createElement('div')
    host.innerHTML = html
    return host
  }

  describe('captureElement', () => {
    it('captures the clone as markup carrying the inlined styles', async () => {
      const el = mountStyled()
      const preview = await captureElement(el)
      expect(preview.width).toBeGreaterThan(0)
      expect(preview.html.startsWith('<div')).toBe(true)
      expect(preview.html).toContain('tagged')
      const rebuilt = rebuild(preview.html)
      const clone = rebuilt.querySelector('section')
      expect(clone).not.toBeNull()
      expect(clone instanceof HTMLElement ? clone.style.color : '').toBe('rgb(0, 128, 0)')
      const child = rebuilt.querySelector('span')
      expect(child instanceof HTMLElement ? child.style.fontWeight : '').toBe('700')
    })

    it('captures pseudo-element rules into a scoped stylesheet', async () => {
      const el = mountStyled()
      const preview = await captureElement(el)
      const rebuilt = rebuild(preview.html)
      const sheet = rebuilt.querySelector('style')?.textContent ?? ''
      expect(sheet).toContain('::before')
      expect(sheet).toContain('content:"★"')
      const clone = rebuilt.querySelector('section')
      expect([...(clone?.classList ?? [])].some((cls) => cls.startsWith('conciv-grab-pseudo-'))).toBe(true)
    })

    it('strips ids and neutralizes the root layout', async () => {
      const el = mountStyled()
      const preview = await captureElement(el)
      const rebuilt = rebuild(preview.html)
      expect(rebuilt.querySelector('[id]')).toBeNull()
      const clone = rebuilt.querySelector('section')
      expect(clone instanceof HTMLElement ? clone.style.position : '').toBe('static')
      expect(clone instanceof HTMLElement ? clone.style.margin : '').toBe('0px')
    })
  })

  describe('captureElement with svg', () => {
    it('keeps the markup of a grabbed svg element', async () => {
      const host = document.createElement('div')
      host.innerHTML = `
      <svg width="60" height="30" viewBox="0 0 60 30" style="color:rgb(0, 0, 255)">
        <rect x="0" y="0" width="60" height="30" fill="currentColor"></rect>
        <text x="4" y="20">logo</text>
      </svg>
    `
      document.body.appendChild(host)
      const svg = host.querySelector('svg')
      if (!svg) throw new Error('fixture missing')

      const preview = await captureElement(svg)

      expect(preview.html).toContain('<svg')
      expect(preview.html).toContain('logo')
      expect(preview.width).toBeGreaterThan(0)
    })
  })
})

describe('element capture', () => {
  const readValue = defineTool({
    name: 'probe_readvalue',
    description: 'reads a value without capturing',
    inputSchema: z.object({selector: z.string()}),
    outputSchema: z.object({value: z.string()}),
    meta: {summary: 'read a value', category: 'read'},
  }).client((input, ctx) => {
    const el = ctx.target(input)
    return {value: el instanceof HTMLInputElement ? el.value : (el.textContent ?? '')}
  })

  const actFill = defineTool({
    name: 'probe_fill',
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
    name: 'probe_settext',
    description: 'replaces the text of an element',
    inputSchema: z.object({selector: z.string(), text: z.string()}),
    outputSchema: z.object({ok: z.literal(true)}),
    meta: {summary: 'set element text', category: 'edit-live', mutating: true, capture: 'before-after'},
  }).client((input, ctx) => {
    ctx.target(input).textContent = input.text
    return {ok: true}
  })

  const editRemove = defineTool({
    name: 'probe_remove',
    description: 'removes an element',
    inputSchema: z.object({selector: z.string()}),
    outputSchema: z.object({ok: z.literal(true)}),
    meta: {summary: 'remove an element', category: 'edit-live', mutating: true, capture: 'before-after'},
  }).client((input, ctx) => {
    ctx.target(input).remove()
    return {ok: true}
  })

  const editStyled = defineTool({
    name: 'probe_settextstyled',
    description: 'replaces the text of an element while the page injects a rule',
    inputSchema: z.object({selector: z.string(), text: z.string()}),
    outputSchema: z.object({ok: z.literal(true)}),
    meta: {
      summary: 'set element text under a new rule',
      category: 'edit-live',
      mutating: true,
      capture: 'before-after',
    },
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
    name: 'probe_mark',
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

  beforeEach(async () => {
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
    await loadSnapshotLibrary()
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
      const bundle = await captureOf('probe_settext', {selector: '#prose', text: 'rewritten'})
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
      const bundle = await captureOf('probe_fill', {selector: '#card', value: CARD_SENTINEL})
      const node = JSON.stringify(bundle.after?.node ?? null)
      expect(node).toContain('data-rr-target')
      expect(node).toContain('capture-form')
      expect(bundle.after?.cssBundleId).toMatch(/^css/)
      expect(bundle.cssBundles?.at(0)?.css).toContain('.capture-form .cta')
    })

    it('carries the css bundle on every capture so a dropped one never leaves a dangling reference', async () => {
      const first = await captureOf('probe_fill', {selector: '#card', value: '1'})
      const second = await captureOf('probe_fill', {selector: '#card', value: '2'})
      expect(second.after?.cssBundleId).toBe(first.after?.cssBundleId)
      expect(second.cssBundles?.at(0)?.hash).toBe(second.after?.cssBundleId)
      expect(second.cssBundles?.at(0)?.css).toBe(first.cssBundles?.at(0)?.css)
    })

    it('keeps a css bundle for each side when the page injects a rule while the tool runs', async () => {
      const bundle = await captureOf('probe_settextstyled', {selector: '#prose', text: 'restyled'})
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
      const outcome = await driver.execute({name: 'probe_fill', input: {selector: '#secret', value: 'typed'}})
      if (!outcome.ok) throw new Error('the fill failed')
      expect(JSON.stringify(outcome.result)).not.toContain(PASSWORD)
      expect(JSON.stringify(outcome.capture)).not.toContain(PASSWORD)
      expect(outcome.capture?.after?.descriptor.value).toBe('***')
    })

    it('keeps a payment field out of the capture payload and out of the result', async () => {
      const outcome = await driver.execute({name: 'probe_fill', input: {selector: '#card', value: CARD_SENTINEL}})
      if (!outcome.ok) throw new Error('the fill failed')
      expect(JSON.stringify(outcome.result)).not.toContain(CARD_SENTINEL)
      expect(JSON.stringify(outcome.capture)).not.toContain(CARD_SENTINEL)
      expect(outcome.capture?.after?.descriptor.value).toBe('***')
    })

    it('takes no capture for a read verb', async () => {
      const outcome = await driver.execute({name: 'probe_readvalue', input: {selector: '#prose'}})
      expect(outcome).toEqual({ok: true, result: {value: 'original prose'}})
    })

    it('records a before side and no after side when the verb detaches the element', async () => {
      const bundle = await captureOf('probe_remove', {selector: '#doomed'})
      expect(bundle.before?.descriptor.accessibleName).toBe('temporary')
      expect(bundle.after).toBeUndefined()
    })

    it('degrades to a descriptor when the target subtree holds the conciv widget', async () => {
      const widget = document.createElement('div')
      widget.setAttribute('data-conciv-root', '')
      document.querySelector('#panel')?.appendChild(widget)
      const bundle = await captureOf('probe_settext', {selector: '#panel', text: 'wiped'})
      expect(bundle.before?.node).toBeUndefined()
      expect(bundle.before?.descriptor.selectorPath).toContain('#panel')
    })

    it('strips event-handler attributes, javascript: URLs, and iframe/object/embed nodes from the captured subtree', async () => {
      const bundle = await captureOf('probe_mark', {selector: '#hostile'})
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
      const bundle = await captureOf('probe_mark', {selector: '#hostile'})
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
      const bundle = await captureOf('probe_mark', {selector: '#hostile'})
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

      const bundle = await captureOf('probe_mark', {selector: '#media'})
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

      const unconstrained = await captureOf('probe_mark', {selector: '#media'})
      const probeNode = unconstrained.after?.node
      const firstCost = inlineImageCost(requiredDataUrl(probeNode, 'first-image'))
      const secondCost = inlineImageCost(requiredDataUrl(probeNode, 'second-image'))
      const baseBytes = JSON.stringify(probeNode).length - firstCost - secondCost

      const filler = document.createElement('div')
      filler.id = 'filler'
      filler.textContent = 'x'.repeat(200_000 - baseBytes - firstCost - Math.floor(firstCost / 2))
      media.appendChild(filler)

      const bundle = await captureOf('probe_mark', {selector: '#media'})
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

      const bundle = await captureOf('probe_mark', {selector: '#media'})

      expect(bundle.after?.descriptor.selectorPath).toContain('#media')
      expect(bundle.after?.node).toBeUndefined()
    })

    it('rejects an encoder failure instead of admitting a non-image data url, while a sibling image still inlines', async () => {
      const media = mediaContainer()
      const oversized = await appendLoadedImage(media, 'oversized-image', await paintedBlobUrl(8, 8, solidPaint))
      oversized.style.width = '70000px'
      oversized.style.height = '10px'
      await appendLoadedImage(media, 'sibling-image', await paintedBlobUrl(8, 8, solidPaint))

      const bundle = await captureOf('probe_mark', {selector: '#media'})
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

      const bundle = await captureOf('probe_mark', {selector: '#media'})
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

      const bundle = await captureOf('probe_mark', {selector: '#media'})
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

      const bundle = await captureOf('probe_mark', {selector: '#bloated'})

      expect(bundle.after?.descriptor.selectorPath).toContain('#bloated')
      expect(bundle.after?.node).toBeUndefined()
    })
  })
})

describe('fallback metrics', () => {
  const CSP = "default-src 'none'; img-src data:; style-src 'unsafe-inline' data:; font-src data:"

  const PAGE_FAMILY = "'PageBrand', monospace"

  const BADGE = 'TanStack Start base template'

  const PILL = 'About This Starter'

  const frames: HTMLIFrameElement[] = []

  const hosts: HTMLElement[] = []

  beforeAll(async () => {
    const style = document.createElement('style')
    style.textContent = `@font-face{font-family:'PageBrand';src:url(${pageFont}) format('woff2');font-weight:100 900;font-display:block}`
    document.head.appendChild(style)
    await document.fonts.load('700 11px PageBrand')
    await document.fonts.load('600 12px PageBrand')
    await document.fonts.ready
    if (!document.fonts.check('700 11px PageBrand')) throw new Error('the page webfont did not load')
  })

  afterEach(() => {
    for (const frame of frames.splice(0)) frame.remove()
    for (const host of hosts.splice(0)) host.remove()
  })

  async function renderSnapshot(html: string, width: number, height: number): Promise<Document> {
    const frame = document.createElement('iframe')
    frame.setAttribute('sandbox', 'allow-same-origin')
    frame.width = String(Math.ceil(width))
    frame.height = String(Math.ceil(height))
    frame.srcdoc = `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${CSP}"><style>html{background:#fff}body{margin:0}</style></head><body>${html}</body></html>`
    document.body.appendChild(frame)
    frames.push(frame)
    await new Promise<void>((resolve) => {
      frame.addEventListener('load', () => resolve(), {once: true})
    })
    const doc = frame.contentDocument
    if (!doc) throw new Error('the snapshot frame has no document')
    await doc.fonts.ready
    return doc
  }

  function mountReplica(): HTMLElement {
    const host = document.createElement('div')
    host.style.cssText = `position:absolute;top:0;left:0;font-family:${PAGE_FAMILY};background:#fff;padding:16px`
    host.innerHTML = `
    <span data-role="badge" style="display:inline-flex;align-items:center;border:1px solid #ccd;border-radius:999px;padding:4px 11px;font-size:11px;font-weight:700;letter-spacing:0.1em;line-height:16px;text-transform:uppercase;font-family:${PAGE_FAMILY}">${BADGE}</span>
    <span data-role="pill" style="display:inline-flex;align-items:center;border:1px solid #ccd;border-radius:999px;padding:4px 10px;font-size:12px;font-weight:600;letter-spacing:0.01em;line-height:16px;font-family:${PAGE_FAMILY}">${PILL}</span>
  `
    document.body.appendChild(host)
    hosts.push(host)
    return host
  }

  function lineCount(root: ParentNode, role: string): number {
    const element = root.querySelector(`[data-role="${role}"]`)
    if (!element) throw new Error(`no element for role ${role}`)
    const text = element.firstChild
    if (!text) throw new Error(`no text node for role ${role}`)
    const range = (element.ownerDocument ?? document).createRange()
    range.selectNodeContents(element)
    return range.getClientRects().length
  }

  function textWidth(root: ParentNode, role: string): number {
    const element = root.querySelector(`[data-role="${role}"]`)
    if (!element) throw new Error(`no element for role ${role}`)
    const range = (element.ownerDocument ?? document).createRange()
    range.selectNodeContents(element)
    return [...range.getClientRects()].reduce((total, rect) => total + rect.width, 0)
  }

  test('a captured run keeps its line count when the frame falls back to another font', async () => {
    const host = mountReplica()
    await document.fonts.ready
    expect(lineCount(host, 'badge')).toBe(1)
    expect(lineCount(host, 'pill')).toBe(1)

    const preview = await captureElement(host)
    const snapshot = await renderSnapshot(preview.html, preview.width + 60, preview.height + 120)

    expect(lineCount(snapshot, 'badge')).toBe(1)
    expect(lineCount(snapshot, 'pill')).toBe(1)
  })

  test('a run the frame can render itself is left untouched', async () => {
    const host = document.createElement('div')
    host.style.cssText = 'position:absolute;top:0;left:0;font-family:monospace;padding:8px'
    host.innerHTML = `<span data-role="system" style="font-family:monospace;font-size:12px">${PILL}</span>`
    document.body.appendChild(host)
    hosts.push(host)
    await document.fonts.ready

    const preview = await captureElement(host)

    expect(preview.html).toContain('letter-spacing: normal')
  })

  test('a captured run keeps its advance width when the frame falls back to another font', async () => {
    const host = mountReplica()
    await document.fonts.ready
    const liveBadge = textWidth(host, 'badge')
    const livePill = textWidth(host, 'pill')

    const preview = await captureElement(host)
    const snapshot = await renderSnapshot(preview.html, preview.width + 60, preview.height + 120)

    expect(textWidth(snapshot, 'badge')).toBeCloseTo(liveBadge, 0)
    expect(textWidth(snapshot, 'pill')).toBeCloseTo(livePill, 0)
  })
})

describe('grab fit', () => {
  function noiseDataUrl(size: number): string {
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const context = canvas.getContext('2d')
    if (context === null) throw new Error('the test browser gave no 2d context')
    const pixels = context.createImageData(size, size)
    let seed = 0x2f6e_2b1
    for (let index = 0; index < pixels.data.length; index += 4) {
      seed ^= seed << 13
      seed ^= seed >>> 17
      seed ^= seed << 5
      pixels.data[index] = seed & 0xff
      pixels.data[index + 1] = (seed >>> 8) & 0xff
      pixels.data[index + 2] = (seed >>> 16) & 0xff
      pixels.data[index + 3] = 255
    }
    context.putImageData(pixels, 0, 0)
    return canvas.toDataURL('image/png')
  }

  function byteLength(value: string): number {
    return new TextEncoder().encode(value).length
  }

  function imagePreview(dataUrl: string, size: number): ImagePreview {
    return {kind: 'image', dataUrl, width: size, height: size}
  }

  function grabWith(preview: ImagePreview): Grab {
    return {
      text: 'the payment card at src/card.tsx:42:3',
      preview,
      source: {componentName: 'PaymentCardCell', filePath: 'src/card.tsx', lineNumber: 42},
      rect: {x: 0, y: 0, width: preview.width, height: preview.height},
    }
  }

  describe('fitImagePreview', () => {
    it('returns a preview that already fits untouched', async () => {
      const preview = imagePreview(noiseDataUrl(8), 8)

      const fitted = await fitImagePreview(preview, 1_000_000)

      expect(fitted).toEqual(preview)
      expect(fitted.dataUrl).toBe(preview.dataUrl)
    })

    it('refits an oversized preview so it survives a payload round-trip as a smaller image', async () => {
      const original = imagePreview(noiseDataUrl(320), 320)
      const budget = 20_000
      expect(byteLength(original.dataUrl)).toBeGreaterThan(budget)

      const fitted = await fitImagePreview(original, budget)

      expect(byteLength(fitted.dataUrl)).toBeLessThanOrEqual(budget)
      expect(fitted.width).toBe(320)
      expect(fitted.height).toBe(320)

      const payload = parseGrabPayload(await grabToFile(grabWith(fitted)).text())

      expect(payload?.preview).toEqual(fitted)
    })

    it('keeps an image rather than dropping it when nothing can reach the budget', async () => {
      const original = imagePreview(noiseDataUrl(320), 320)

      const fitted = await fitImagePreview(original, 1)

      expect(fitted.kind).toBe('image')
      expect(fitted.dataUrl.startsWith('data:image/')).toBe(true)
      expect(byteLength(fitted.dataUrl)).toBeLessThan(byteLength(original.dataUrl))
    })

    it('returns the original preview when the data url cannot be decoded', async () => {
      const broken = imagePreview('data:image/png;base64,notreallyanimage', 320)

      const fitted = await fitImagePreview(broken, 10)

      expect(fitted).toEqual(broken)
    })
  })
})

describe('grab text', () => {
  const hosts: HTMLElement[] = []

  afterEach(() => {
    for (const host of hosts.splice(0)) host.remove()
  })

  function mount(html: string): HTMLElement {
    const host = document.createElement('div')
    host.innerHTML = html
    document.body.appendChild(host)
    hosts.push(host)
    const first = host.firstElementChild
    if (!(first instanceof HTMLElement)) throw new Error('fixture did not render an element')
    return first
  }

  describe('elementSnippet', () => {
    it('writes the opening tag with salient attributes and the trimmed text', () => {
      const button = mount('<button id="try-cta" class="btn primary">  Try it live: connect your agent\n</button>')
      expect(elementSnippet(button)).toBe(
        '<button id="try-cta" class="btn primary">Try it live: connect your agent</button>',
      )
    })

    it('keeps role and aria-label and drops every other attribute', () => {
      const el = mount('<div role="dialog" aria-label="Connect" data-conciv-source="src/a.tsx:1:2" title="x">Hi</div>')
      expect(elementSnippet(el)).toBe('<div role="dialog" aria-label="Connect">Hi</div>')
    })

    it('omits the closing tag for a void element and for an empty one', () => {
      expect(elementSnippet(mount('<input id="email" />'))).toBe('<input id="email">')
      expect(elementSnippet(mount('<div class="spacer"></div>'))).toBe('<div class="spacer">')
    })

    it('truncates long text to eighty characters', () => {
      const long = 'x'.repeat(200)
      const snippet = elementSnippet(mount(`<p>${long}</p>`))
      expect(snippet).toBe(`<p>${'x'.repeat(80)}…</p>`)
    })
  })

  describe('groundGrabText', () => {
    it('composes snippet plus the full data-conciv-source path', () => {
      const button = mount(
        '<button id="try-cta" data-conciv-source="src/components/landing/hero.tsx:42:5">Try it live: connect your agent</button>',
      )
      const grounded = groundGrabText(button, 'minified-fallback')
      expect(grounded.source).toEqual({file: 'src/components/landing/hero.tsx', line: 42, column: 5})
      expect(grounded.text).toBe(
        '<button id="try-cta">Try it live: connect your agent</button> at src/components/landing/hero.tsx:42:5',
      )
    })

    it('reads the attribute off the nearest annotated ancestor', () => {
      const wrapper = mount('<section data-conciv-source="src/page.tsx:7:1"><span>Deep</span></section>')
      const span = wrapper.querySelector('span')
      if (!span) throw new Error('fixture span missing')
      expect(groundGrabText(span, 'fallback').text).toBe('<span>Deep</span> at src/page.tsx:7:1')
    })

    it('passes the react-grab text through untouched when no attribute resolves', () => {
      const el = mount('<div class="unannotated">Nothing</div>')
      const grounded = groundGrabText(el, '<Kx> in chunk-QWERTY.js')
      expect(grounded.source).toBeNull()
      expect(grounded.text).toBe('<Kx> in chunk-QWERTY.js')
    })
  })
})

describe('page dispatcher', () => {
  const readText = defineTool({
    name: 'probe_text',
    description: 'reads text through the dispatcher ctx',
    inputSchema: z.object({selector: z.string().optional(), ref: z.string().optional()}),
    outputSchema: z.object({text: z.string()}),
    meta: {summary: 'read text through the dispatcher', category: 'read'},
  }).client((input, ctx) => ({text: ctx.target(input).textContent ?? ''}))

  const mirroredClick = defineTool({
    name: 'probe_click',
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
    name: 'probe_mark',
    description: 'adds a ref for the target element',
    inputSchema: z.object({selector: z.string()}),
    outputSchema: z.object({ref: z.string()}),
    meta: {summary: 'add a ref through the dispatcher', category: 'read'},
  }).client((input, ctx) => ({ref: ctx.addRef(ctx.target(input))}))

  const raiser = defineTool({
    name: 'probe_raise',
    description: 'throws a typed tool error',
    inputSchema: z.object({}),
    outputSchema: z.object({}),
    errors: {NO_LUCK: {message: 'nothing to raise'}},
    meta: {summary: 'raise a declared error through the dispatcher', category: 'read'},
  }).client(() => {
    throw toolError('NO_LUCK', {message: 'not today'})
  })

  const misbehaved = defineTool({
    name: 'probe_badresult',
    description: 'returns a non-record result',
    inputSchema: z.object({}),
    outputSchema: z.object({}),
    meta: {summary: 'return a non-record result', category: 'read'},
  }).client(() => 42)

  const undefinedLeaker = defineTool({
    name: 'probe_undef',
    description: 'returns a record whose values JSON would silently drop or nullify',
    inputSchema: z.object({where: z.enum(['object', 'array'])}),
    outputSchema: z.object({}),
    meta: {summary: 'return a record carrying undefined values', category: 'read'},
  }).client((input) => (input.where === 'object' ? {value: undefined} : {values: ['kept', undefined]}))

  const probes = defineExtension({
    name: 'probes',
    tools: [readText, mirroredClick, refMaker, raiser, misbehaved, undefinedLeaker],
  }).client(() => ({value: {}}))

  let host: HTMLElement
  let driver: PageDriver

  beforeAll(async () => {
    host = document.createElement('div')
    host.innerHTML = `
    <p id="prose">hello dispatcher</p>
    <button id="btn" onclick="this.textContent='clicked'">press</button>
  `
    document.body.appendChild(host)
    driver = makeDomPageDriver({tools: collectClientTools([probes])})
    await loadSnapshotLibrary()
  })

  afterAll(() => {
    driver.dispose()
    host.remove()
  })

  describe('the page-tool dispatcher', () => {
    it('runs a client body by registry name with a lazily resolved target', async () => {
      expect(await driver.execute({name: 'probe_text', input: {selector: '#prose'}})).toEqual({
        ok: true,
        result: {text: 'hello dispatcher'},
      })
    })

    it('rejects an undeclared name as unknown-verb', async () => {
      expect(await driver.execute({name: 'probe_nothing', input: {}})).toEqual({
        ok: false,
        error: {code: 'unknown-verb', message: 'no mounted extension declares a client tool named "probe_nothing"'},
      })
    })

    it('explains each way a target can be missing, as an invalid-args failure', async () => {
      const stale = await driver.execute({name: 'probe_text', input: {ref: 'v999'}})
      expect(stale).toEqual({ok: false, error: {code: 'invalid-args', message: 'stale ref v999; re-run page snapshot'}})
      const missing = await driver.execute({name: 'probe_text', input: {selector: '#nope'}})
      expect(missing).toEqual({ok: false, error: {code: 'invalid-args', message: 'no element for selector #nope'}})
      const bare = await driver.execute({name: 'probe_text', input: {}})
      expect(bare).toEqual({
        ok: false,
        error: {code: 'invalid-args', message: 'no target: pass ref, selector, or name'},
      })
    })

    it('mirrors an action when the declaration says so and shares refs across calls', async () => {
      const marked = await driver.execute({name: 'probe_mark', input: {selector: '#btn'}})
      if (!marked.ok) throw new Error('mark failed')
      const ref = String(marked.result.ref)
      expect(await driver.execute({name: 'probe_click', input: {selector: '#btn'}})).toMatchObject({
        ok: true,
        result: {ok: true},
      })
      expect(document.querySelector('[data-conciv-cursor]')).not.toBeNull()
      expect(await driver.execute({name: 'probe_text', input: {ref}})).toEqual({ok: true, result: {text: 'clicked'}})
    })

    it('carries a thrown toolError as a raised handler-error', async () => {
      expect(await driver.execute({name: 'probe_raise', input: {}})).toEqual({
        ok: false,
        error: {code: 'handler-error', message: 'not today', raised: {code: 'NO_LUCK', message: 'not today'}},
      })
    })

    it('reports a schema-rejected input as invalid-args', async () => {
      const outcome = await driver.execute({name: 'probe_click', input: {}})
      expect(outcome.ok).toBe(false)
      if (outcome.ok) return
      expect(outcome.error.code).toBe('invalid-args')
    })

    it('refuses a non-record result', async () => {
      expect(await driver.execute({name: 'probe_badresult', input: {}})).toEqual({
        ok: false,
        error: {code: 'handler-error', message: 'probe_badresult returned a non-serializable result'},
      })
    })

    it.each(['object', 'array'] as const)(
      'refuses a result carrying undefined in an %s, which JSON would silently mutate in transit',
      async (where) => {
        expect(await driver.execute({name: 'probe_undef', input: {where}})).toEqual({
          ok: false,
          error: {code: 'handler-error', message: 'probe_undef returned a non-serializable result'},
        })
      },
    )

    it('treats a ref to a detached element as stale, not as a live target', async () => {
      const ephemeral = document.createElement('p')
      ephemeral.id = 'ephemeral'
      ephemeral.textContent = 'about to vanish'
      host.appendChild(ephemeral)
      const marked = await driver.execute({name: 'probe_mark', input: {selector: '#ephemeral'}})
      if (!marked.ok) throw new Error('mark failed')
      const ref = String(marked.result.ref)
      expect(await driver.execute({name: 'probe_text', input: {ref}})).toEqual({
        ok: true,
        result: {text: 'about to vanish'},
      })
      ephemeral.remove()
      expect(await driver.execute({name: 'probe_text', input: {ref}})).toEqual({
        ok: false,
        error: {code: 'invalid-args', message: `stale ref ${ref}; re-run page snapshot`},
      })
    })
  })
})

describe('page driver dispose', () => {
  function installBanner(): ClientEffect {
    let banner: HTMLElement | null = null
    return {
      name: 'banner',
      description: 'shows a fixture banner while enabled',
      enabled: () => banner !== null,
      set: (enabled) => {
        if (enabled === (banner !== null)) return
        if (!enabled) {
          banner?.remove()
          banner = null
          return
        }
        banner = document.createElement('div')
        banner.setAttribute('role', 'note')
        banner.textContent = 'fixture banner shown'
        document.body.appendChild(banner)
      },
    }
  }

  let driver: PageDriver | undefined

  afterEach(() => {
    driver?.dispose()
    driver = undefined
  })

  describe('driver disposal', () => {
    it('turns off every enabled effect so host-DOM mutations do not leak past dispose', async () => {
      const banner = installBanner()
      driver = makeDomPageDriver({effects: [banner]})
      banner.set(true)
      await expect.element(page.getByText('fixture banner shown')).toBeVisible()

      driver.dispose()

      await expect.element(page.getByText('fixture banner shown')).not.toBeInTheDocument()
    })
  })
})

describe('page snapshot', () => {
  const makeRefs = (): RefAdder => {
    const refs: Refs = {map: new Map(), n: 0}
    return (el) => addRef(el, refs)
  }

  function mount(html: string): HTMLElement {
    const host = document.createElement('div')
    host.innerHTML = html
    document.body.appendChild(host)
    return host
  }

  afterEach(() => {
    document.body.innerHTML = ''
  })

  const byRole = (nodes: SnapNode[], role: string): SnapNode | undefined => nodes.find((node) => node.role === role)

  describe('buildSnapshot', () => {
    it('derives roles from tags, input types, and explicit role attributes', () => {
      const host = mount(`
      <a href="#">docs</a>
      <button>go</button>
      <select><option>x</option></select>
      <textarea></textarea>
      <nav></nav>
      <h2>title</h2>
      <input type="checkbox" />
      <input type="radio" />
      <input type="submit" />
      <input type="email" />
      <div role="tablist"></div>
    `)
      const nodes = buildSnapshot(host, makeRefs())
      const roles = nodes.map((node) => node.role)
      for (const expected of [
        'link',
        'button',
        'combobox',
        'textbox',
        'navigation',
        'heading',
        'checkbox',
        'radio',
        'tablist',
      ]) {
        expect(roles).toContain(expected)
      }
      expect(roles.filter((role) => role === 'button')).toHaveLength(2)
    })

    it('prefers aria-label, then the input label, then trimmed text for names', () => {
      const host = mount(`
      <button aria-label="  Close panel  ">×</button>
      <label for="fld">Email address</label><input id="fld" type="email" />
      <a href="#">  spaced
        out   text  </a>
    `)
      const nodes = buildSnapshot(host, makeRefs())
      expect(byRole(nodes, 'button')?.name).toBe('Close panel')
      expect(nodes.find((node) => node.role === 'textbox')?.name).toBe('Email address')
      expect(byRole(nodes, 'link')?.name).toBe('spaced out text')
    })

    it('truncates long text names at 80 characters', () => {
      const host = mount(`<button>${'y'.repeat(200)}</button>`)
      const nodes = buildSnapshot(host, makeRefs())
      expect(byRole(nodes, 'button')?.name).toHaveLength(80)
    })

    it('reports checked, disabled, and hidden state', () => {
      const host = mount(`
      <input type="checkbox" checked />
      <button disabled>d</button>
      <a href="#" style="display:none">gone</a>
      <input type="radio" />
    `)
      const nodes = buildSnapshot(host, makeRefs())
      expect(byRole(nodes, 'checkbox')?.state).toEqual(['checked'])
      expect(byRole(nodes, 'button')?.state).toEqual(['disabled'])
      expect(byRole(nodes, 'link')?.state).toEqual(['hidden'])
      expect(byRole(nodes, 'radio')?.state).toBeUndefined()
    })

    it('carries form control values and skips uninteresting elements', () => {
      const host = mount(`
      <div><p>prose</p></div>
      <input type="text" value="typed" />
      <textarea>drafted</textarea>
    `)
      const nodes = buildSnapshot(host, makeRefs())
      expect(nodes.map((node) => node.role).toSorted()).toEqual(['textbox', 'textbox'])
      expect(nodes.map((node) => node.value).toSorted()).toEqual(['drafted', 'typed'])
    })

    it('mints sequential live refs that dereference to the elements', () => {
      const refs: Refs = {map: new Map(), n: 0}
      const host = mount('<button>a</button><a href="#">b</a>')
      const nodes = buildSnapshot(host, (el) => addRef(el, refs))
      expect(nodes.map((node) => node.ref)).toEqual(['v1', 'v2'])
      expect(refs.map.get('v1')?.deref()?.tagName).toBe('BUTTON')
      expect(refs.map.get('v2')?.deref()?.tagName).toBe('A')
    })
  })

  describe('describeElement', () => {
    it('reports tag, id, className, rect, and curated computed style', () => {
      const host = mount('<button id="go" class="primary big" style="color: rgb(1, 2, 3)">go</button>')
      const el = host.querySelector('button')
      expect(el).not.toBeNull()
      const described = el ? describeElement(el) : {}
      expect(described.tagName).toBe('button')
      expect(described.id).toBe('go')
      expect(described.className).toBe('primary big')
      expect(described.rect).toMatchObject({x: expect.any(Number), w: expect.any(Number)})
      expect(described.computedStyle).toMatchObject({display: expect.any(String)})
    })
  })
})

describe('react bridge', () => {
  const makeRefs = (): {refs: Refs; addRef: RefAdder} => {
    const refs: Refs = {map: new Map(), n: 0}
    return {refs, addRef: (el) => addRefTo(el, refs)}
  }

  const leafText = () => page.getByRole('button')
  const classText = () => page.getByRole('status')

  let container: HTMLElement
  let root: Root

  const leaf = (): Element => {
    const el = document.querySelector('[data-fixture="leaf"]')
    if (!el) throw new Error('fixture leaf not rendered')
    return el
  }

  const classHost = (): Element => {
    const el = document.querySelector('[data-fixture="class"]')
    if (!el) throw new Error('fixture class host not rendered')
    return el
  }

  beforeAll(async () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    root.render(<FixtureApp />)
    await vi.waitFor(() => {
      if (!document.querySelector('[data-fixture="leaf"]')) throw new Error('fixture not rendered yet')
    })
  })

  afterAll(() => {
    root.unmount()
    container.remove()
  })

  describe('locate', () => {
    it('names the component and walks the composite owner chain', async () => {
      const {addRef} = makeRefs()
      const result = await locate(leaf(), addRef)
      expect(result).not.toBeNull()
      expect(result?.stack).toContain('Leaf')
      expect(result?.stack).toContain('Branch')
      expect(result?.owners.map((owner) => owner.component)).toContain('Leaf')
      expect(result?.owners.every((owner) => owner.ref.startsWith('v') || owner.ref === '')).toBe(true)
    })

    it('reads a data-conciv-source attribute into a source location', async () => {
      leaf().setAttribute('data-conciv-source', 'src/app/leaf.tsx:12:7')
      const result = await locate(leaf(), makeRefs().addRef)
      expect(result?.source).toEqual({file: 'src/app/leaf.tsx', line: 12, column: 7})
      leaf().removeAttribute('data-conciv-source')
    })
  })

  describe('describe + componentHostAt', () => {
    it('resolves the owning component of a host element', () => {
      expect(describeHost(leaf()).component).toBe('Leaf')
      expect(componentHostAt(leaf())).toBe(leaf())
    })
  })

  describe('inspect', () => {
    it('reads function-component props and hooks', async () => {
      const result = await inspect(leaf())
      expect(result?.component).toBe('Leaf')
      expect(result?.props).toMatchObject({label: 'A'})
      expect(result?.state).toBeNull()
      expect(result?.hooks.length).toBeGreaterThan(0)
      expect(result?.rect).toMatchObject({w: expect.any(Number)})
    })

    it('reads class-component state and reports no hooks', async () => {
      const result = await inspect(classHost())
      expect(result?.component).toBe('Counter')
      expect(result?.state).toEqual({value: 5})
      expect(result?.hooks).toEqual([])
    })
  })

  describe('override', () => {
    it('sets class state in place and re-renders', async () => {
      const result = await override(classHost(), 'state', ['value'], 42)
      expect(result).toEqual({ok: true})
      await expect.element(classText()).toHaveTextContent('42')
    })

    it('overrides function-component props through the dev renderer', async () => {
      const result = await override(leaf(), 'props', ['label'], 'B')
      expect(result).toEqual({ok: true})
      await expect.element(leafText()).toMatchTextContent('B:')
    })

    it('overrides hook state by hook id', async () => {
      const inspected = await inspect(leaf())
      const editable = inspected?.hooks.find((hook) => hook.editable)
      expect(editable).toBeDefined()
      const result = await override(leaf(), 'hooks', [], 9, editable?.id)
      expect(result).toEqual({ok: true})
      await expect.element(leafText()).toMatchTextContent(':9:')
    })

    it('overrides the nearest context provider value', async () => {
      const result = await override(leaf(), 'context', [], 'contrast')
      expect(result).toEqual({ok: true})
      await expect.element(leafText()).toMatchTextContent(':contrast')
    })

    it('reports actionable errors for unsupported targets', async () => {
      const hooksWithoutId = await override(leaf(), 'hooks', [], 1)
      expect(hooksWithoutId).toEqual({error: 'hooks override requires hookId (from inspect → hooks[].id)'})
      const stateOnFunction = await override(leaf(), 'state', [], {})
      expect(stateOnFunction).toEqual({
        error: 'state override targets class components; function-component state is a hook; use target=hooks',
      })
      const detached = document.createElement('div')
      document.body.appendChild(detached)
      expect(await override(detached, 'props', [], 1)).toEqual({error: 'no React fiber for element'})
      detached.remove()
    })
  })

  describe('tree + find', () => {
    it('builds the composite tree from a root element', async () => {
      const result = await tree(container, makeRefs().addRef)
      const names: string[] = []
      const collect = (nodes: typeof result.nodes): void => {
        for (const node of nodes) {
          names.push(node.component)
          collect(node.children)
        }
      }
      collect(result.nodes)
      expect(names).toContain('FixtureApp')
      expect(names).toContain('Branch')
      expect(names).toContain('Leaf')
      expect(names).toContain('Counter')
    })

    it('truncates beyond maxNodes and attributes the cut to an ancestor', async () => {
      const result = await tree(container, makeRefs().addRef, {maxNodes: 1})
      expect(result.truncated).toBeGreaterThan(0)
    })

    it('finds rendered components by display name', () => {
      const {refs, addRef} = makeRefs()
      const result = find('Leaf', addRef)
      expect(result.total).toBeGreaterThanOrEqual(1)
      expect(result.matches[0]?.component).toBe('Leaf')
      const ref = result.matches[0]?.ref
      expect(ref ? refs.map.get(ref)?.deref() : null).toBe(leaf())
    })
  })

  describe('root discovery with no recorded fiber roots', () => {
    const recordedRoots: unknown[] = []
    let siblingsContainer: HTMLElement
    let siblingsRoot: Root

    beforeAll(async () => {
      siblingsContainer = document.createElement('div')
      document.body.prepend(siblingsContainer)
      siblingsRoot = createRoot(siblingsContainer)
      siblingsRoot.render(
        <>
          <Leaf label="top branch" />
          <Counter start={7} />
        </>,
      )
      await vi.waitFor(() => {
        if (!siblingsContainer.querySelector('output')) throw new Error('siblings not rendered yet')
      })
      recordedRoots.push(..._fiberRoots)
      _fiberRoots.clear()
    })

    afterAll(() => {
      for (const recorded of recordedRoots) _fiberRoots.add(recorded)
      siblingsRoot.unmount()
      siblingsContainer.remove()
    })

    it('reaches every top-level branch through the host root', () => {
      expect(find('Counter', makeRefs().addRef).total).toBe(1)
      expect(find('Leaf', makeRefs().addRef).total).toBe(1)
      expect(elementByName('Counter')).toBe(siblingsContainer.querySelector('output'))
    })
  })
})
