import 'virtual:uno.css'
import {afterEach, expect, it} from 'vitest'
import {page} from 'vitest/browser'
import {createStore} from 'solid-js/store'
import type {ElementCapture} from '@conciv/protocol/element-capture-types'
import {
  ELEMENT_CAPTURE_FIXTURE_CSS,
  ELEMENT_CAPTURE_FIXTURE_DESCRIPTOR_ONLY,
  ELEMENT_CAPTURE_FIXTURE_FULL,
  ELEMENT_CAPTURE_FIXTURE_MASKED,
} from '../src/tools/element-capture.fixtures.js'
import {ElementPreview} from '../src/tools/styled/element-preview.js'
import {cleanupViews, mountView} from './mount-view.js'

const XSS_FLAG = '__elementPreviewXssProbe'

const PROBE_PREFIX = '/conciv-preview-network-probe'

const HOSTILE_CSS =
  `@import url(${PROBE_PREFIX}/imported.css);` +
  `.capture-form {background-image: url(${PROBE_PREFIX}/sheet-background.png);}` +
  `@font-face {font-family: probe; src: url(${PROBE_PREFIX}/probe.woff2);}`

const ENTITY_OVERFLOW_CAPTURE: ElementCapture = {
  kind: 'after',
  ts: Date.now(),
  descriptor: {tagName: 'input', accessibleName: 'overflow target', selectorPath: 'input#overflow-target'},
  node: {
    type: 2,
    tagName: 'html',
    attributes: {},
    childNodes: [
      {
        type: 2,
        tagName: 'body',
        attributes: {},
        childNodes: [
          {
            type: 2,
            tagName: 'a',
            attributes: {id: 'overflow-link', href: `&#x110000;javascript:window.${XSS_FLAG} = true`},
            childNodes: [{type: 3, textContent: 'overflowing', id: 1}],
            id: 2,
          },
          {
            type: 2,
            tagName: 'input',
            attributes: {id: 'overflow-target', value: 'overflow-target', 'data-rr-target': 'true'},
            childNodes: [],
            id: 3,
          },
        ],
        id: 4,
      },
    ],
    id: 5,
  },
}

const HOSTILE_CAPTURE: ElementCapture = {
  kind: 'after',
  ts: Date.now(),
  descriptor: {tagName: 'input', accessibleName: 'safe target', selectorPath: 'input#safe-target'},
  node: {
    type: 2,
    tagName: 'html',
    attributes: {},
    childNodes: [
      {
        type: 2,
        tagName: 'body',
        attributes: {},
        childNodes: [
          {
            type: 2,
            tagName: 'div',
            attributes: {},
            childNodes: [
              {
                type: 2,
                tagName: 'img',
                attributes: {src: 'x', onerror: `window.${XSS_FLAG} = true`},
                childNodes: [],
                id: 1,
              },
              {
                type: 2,
                tagName: 'a',
                attributes: {
                  id: 'hostile-click-link',
                  href: `javascript:window.${XSS_FLAG} = true`,
                  onclick: `window.${XSS_FLAG} = true`,
                },
                childNodes: [{type: 3, textContent: 'click me', id: 3}],
                id: 2,
              },
              {
                type: 2,
                tagName: 'a',
                attributes: {id: 'hostile-tab-link', href: `java\tscript:window.${XSS_FLAG} = true`},
                childNodes: [{type: 3, textContent: 'click too', id: 9}],
                id: 10,
              },
              {
                type: 2,
                tagName: 'iframe',
                attributes: {srcdoc: `<script>window.${XSS_FLAG} = true</script>`},
                childNodes: [],
                id: 4,
              },
              {
                type: 2,
                tagName: 'script',
                attributes: {},
                childNodes: [{type: 3, textContent: `window.${XSS_FLAG} = true`, id: 11}],
                id: 12,
              },
              {
                type: 2,
                tagName: 'link',
                attributes: {rel: 'stylesheet', href: `${PROBE_PREFIX}/linked.css`},
                childNodes: [],
                id: 13,
              },
              {
                type: 2,
                tagName: 'img',
                attributes: {id: 'hostile-srcset', srcset: `${PROBE_PREFIX}/srcset.png 1x`},
                childNodes: [],
                id: 14,
              },
              {
                type: 2,
                tagName: 'div',
                attributes: {id: 'hostile-inline-style', style: `background-image:url(${PROBE_PREFIX}/inline.png)`},
                childNodes: [{type: 3, textContent: 'styled', id: 15}],
                id: 16,
              },
              {
                type: 2,
                tagName: 'input',
                attributes: {id: 'safe-target', value: 'safe-target', 'data-rr-target': 'true'},
                childNodes: [],
                id: 5,
              },
            ],
            id: 6,
          },
        ],
        id: 7,
      },
    ],
    id: 8,
  },
}

const NO_TARGET_CAPTURE: ElementCapture = {
  kind: 'after',
  ts: Date.now(),
  descriptor: {tagName: 'input', role: 'textbox', accessibleName: 'orphaned field', selectorPath: 'input#orphan'},
  node: {
    type: 2,
    tagName: 'html',
    attributes: {},
    childNodes: [
      {
        type: 2,
        tagName: 'body',
        attributes: {},
        childNodes: [
          {type: 2, tagName: 'input', attributes: {id: 'orphan', value: 'no marker'}, childNodes: [], id: 1},
        ],
        id: 2,
      },
    ],
    id: 3,
  },
}

afterEach(() => {
  cleanupViews()
})

type PreviewNode = {
  attributes?: Record<string, unknown>
  childNodes?: PreviewNode[]
}

function isPreviewNode(value: unknown): value is PreviewNode {
  return typeof value === 'object' && value !== null
}

function findById(node: unknown, id: string): PreviewNode | undefined {
  if (!isPreviewNode(node)) return undefined
  if (node.attributes?.['id'] === id) return node
  for (const child of node.childNodes ?? []) {
    const found = findById(child, id)
    if (found !== undefined) return found
  }
  return undefined
}

function replicaFrame(): HTMLIFrameElement {
  const frame = document.querySelector('[role="img"]')
  if (frame === null) throw new Error('the replay frame was never mounted')
  const replicaFrameElement = frame.querySelector('iframe')
  if (replicaFrameElement === null) throw new Error('the replica host inside the frame carries no sandboxed iframe')
  return replicaFrameElement
}

function replicaRoot(): Document {
  const replicaDocument = replicaFrame().contentDocument
  if (replicaDocument === null) throw new Error('the sandboxed replica iframe exposes no document')
  return replicaDocument
}

function replicaTarget(): HTMLInputElement {
  const view = replicaRoot().defaultView
  if (view === null) throw new Error('the sandboxed replica iframe exposes no window')
  const target = replicaRoot().querySelector('[data-rr-target]')
  if (!(target instanceof view.HTMLInputElement)) {
    throw new Error('the target was not rebuilt into the replica document')
  }
  return target
}

it('replays a frozen capture into a sandboxed replica document that still shows the original content and target marker', async () => {
  mountView(() => (
    <ElementPreview.Root capture={ELEMENT_CAPTURE_FIXTURE_FULL} css={ELEMENT_CAPTURE_FIXTURE_CSS}>
      <ElementPreview.Frame />
    </ElementPreview.Root>
  ))

  await expect.element(page.getByRole('img', {name: 'Email'})).not.toHaveAttribute('aria-busy')
  const target = replicaTarget()
  expect(target.getAttribute('data-rr-target')).toBe('true')
  expect(target.value).toBe('ada@example.com')
  expect(target.closest('[inert]')).not.toBeNull()
})

it('replays a capture whose node arrived wrapped in a Solid store proxy, same as query-cache data', async () => {
  const [storedCapture] = createStore(ELEMENT_CAPTURE_FIXTURE_FULL)

  mountView(() => (
    <ElementPreview.Root capture={storedCapture} css={ELEMENT_CAPTURE_FIXTURE_CSS}>
      <ElementPreview.Frame />
    </ElementPreview.Root>
  ))

  await expect.element(page.getByRole('img', {name: 'Email'})).not.toHaveAttribute('aria-busy')
  const target = replicaTarget()
  expect(target.getAttribute('data-rr-target')).toBe('true')
  expect(target.value).toBe('ada@example.com')
})

it('degrades to the descriptor chips when the capture carries no serialized node', async () => {
  mountView(() => (
    <ElementPreview.Root capture={ELEMENT_CAPTURE_FIXTURE_DESCRIPTOR_ONLY}>
      <ElementPreview.Descriptor />
    </ElementPreview.Root>
  ))

  await expect.element(page.getByText('textbox')).toBeVisible()
  await expect.element(page.getByText('Email')).toBeVisible()
  await expect.element(page.getByText('ada@example.com')).toBeVisible()
})

it('shows the already-masked value for a captured password field, never the real value', async () => {
  mountView(() => (
    <ElementPreview.Root capture={ELEMENT_CAPTURE_FIXTURE_MASKED} css={ELEMENT_CAPTURE_FIXTURE_CSS}>
      <ElementPreview.Frame />
    </ElementPreview.Root>
  ))

  await expect.element(page.getByRole('img')).not.toHaveAttribute('aria-busy')
  const target = replicaTarget()
  expect(target.value).toBe('***')
})

it('neutralizes a hostile payload before rebuild: no onerror/onclick/javascript: execution, no iframe, safe content still renders', async () => {
  Reflect.deleteProperty(window, XSS_FLAG)

  mountView(() => (
    <ElementPreview.Root capture={HOSTILE_CAPTURE}>
      <ElementPreview.Frame />
    </ElementPreview.Root>
  ))

  await expect.element(page.getByRole('img', {name: 'safe target'})).not.toHaveAttribute('aria-busy')

  expect(Reflect.get(window, XSS_FLAG)).toBeUndefined()
  const target = replicaTarget()
  expect(target.value).toBe('safe-target')
  const replica = replicaRoot()
  expect(replica.querySelector('iframe')).toBeNull()

  const replicaView = replica.defaultView
  if (replicaView === null) throw new Error('the sandboxed replica iframe exposes no window')
  const clickLink = replica.querySelector('#hostile-click-link')
  if (!(clickLink instanceof replicaView.HTMLElement)) throw new Error('the hostile click link was not rebuilt')
  clickLink.click()
  expect(Reflect.get(window, XSS_FLAG)).toBeUndefined()

  const tabLink = replica.querySelector('#hostile-tab-link')
  expect(tabLink?.getAttribute('href')).toBeNull()

  expect(findById(HOSTILE_CAPTURE.node, 'hostile-tab-link')?.attributes?.['href']).toBe(
    `java\tscript:window.${XSS_FLAG} = true`,
  )
})

function probeResourceNames(): string[] {
  const names: string[] = []
  const windows: Window[] = [window]
  for (const frame of document.querySelectorAll('iframe')) {
    const view = frame.contentWindow
    if (view !== null) windows.push(view)
  }
  for (const view of windows) {
    for (const entry of view.performance.getEntriesByType('resource')) {
      if (entry.name.includes(PROBE_PREFIX) && !entry.name.includes('sentinel')) names.push(entry.name)
    }
  }
  return names
}

it('replays a hostile capture without running its script or fetching a single remote resource', async () => {
  Reflect.deleteProperty(window, XSS_FLAG)

  mountView(() => (
    <ElementPreview.Root capture={HOSTILE_CAPTURE} css={HOSTILE_CSS}>
      <ElementPreview.Frame />
    </ElementPreview.Root>
  ))

  await expect.element(page.getByRole('img', {name: 'safe target'})).not.toHaveAttribute('aria-busy')
  await fetch(`${PROBE_PREFIX}/sentinel`).catch(() => undefined)

  expect(Reflect.get(window, XSS_FLAG)).toBeUndefined()
  expect(probeResourceNames()).toEqual([])
  expect(replicaTarget().value).toBe('safe-target')
})

it('keeps rendering when an attribute carries an out-of-range numeric character reference', async () => {
  Reflect.deleteProperty(window, XSS_FLAG)

  mountView(() => (
    <ElementPreview.Root capture={ENTITY_OVERFLOW_CAPTURE}>
      <ElementPreview.Frame />
    </ElementPreview.Root>
  ))

  await expect.element(page.getByRole('img', {name: 'overflow target'})).not.toHaveAttribute('aria-busy')

  expect(Reflect.get(window, XSS_FLAG)).toBeUndefined()
  expect(replicaTarget().value).toBe('overflow-target')
})

it('degrades to the descriptor when the rebuilt node has no data-rr-target marker, leaving no invisible frame or busy indicator', async () => {
  mountView(() => (
    <ElementPreview.Root capture={NO_TARGET_CAPTURE}>
      <ElementPreview.Frame />
      <ElementPreview.Descriptor />
    </ElementPreview.Root>
  ))

  await expect.element(page.getByText('orphaned field')).toBeVisible()
  await expect.element(page.getByText('textbox')).toBeVisible()

  expect(document.querySelector('[aria-busy]')).toBeNull()
  expect(document.querySelector('[role="img"]')).toBeNull()
})
