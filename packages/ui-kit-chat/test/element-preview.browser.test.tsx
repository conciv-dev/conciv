import 'virtual:uno.css'
import {afterEach, expect, it} from 'vitest'
import {page} from 'vitest/browser'
import type {ElementCapture} from '@conciv/protocol/element-capture-types'
import {
  ELEMENT_CAPTURE_FIXTURE_CSS,
  ELEMENT_CAPTURE_FIXTURE_DESCRIPTOR_ONLY,
  ELEMENT_CAPTURE_FIXTURE_FULL,
  ELEMENT_CAPTURE_FIXTURE_MASKED,
} from '../src/store/element-capture.fixtures.js'
import {ElementPreview} from '../src/styled/element-preview.js'
import {cleanupViews, mountView} from './mount-view.js'

const XSS_FLAG = '__elementPreviewXssProbe'

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
                attributes: {href: `javascript:window.${XSS_FLAG} = true`, onclick: `window.${XSS_FLAG} = true`},
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

function shadowTarget(): HTMLInputElement {
  const host = document.querySelector('[role="img"]')
  if (host === null) throw new Error('the replay host was never mounted')
  const target = host.shadowRoot?.querySelector('[data-rr-target]')
  if (!(target instanceof HTMLInputElement)) throw new Error('the target was not rebuilt into the shadow root')
  return target
}

it('replays a frozen capture into a shadow root that still shows the original content and target marker', async () => {
  mountView(() => (
    <ElementPreview.Root capture={ELEMENT_CAPTURE_FIXTURE_FULL} css={ELEMENT_CAPTURE_FIXTURE_CSS}>
      <ElementPreview.Frame />
    </ElementPreview.Root>
  ))

  await expect.element(page.getByRole('img', {name: 'Email'})).not.toHaveAttribute('aria-busy')
  const target = shadowTarget()
  expect(target.getAttribute('data-rr-target')).toBe('true')
  expect(target.value).toBe('ada@example.com')
  expect(target.closest('[inert]')).not.toBeNull()
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
  const target = shadowTarget()
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
  const target = shadowTarget()
  expect(target.value).toBe('safe-target')
  const host = document.querySelector('[role="img"]')
  expect(host?.shadowRoot?.querySelector('iframe')).toBeNull()

  const tabLink = host?.shadowRoot?.getElementById('hostile-tab-link')
  expect(tabLink?.getAttribute('href')).toBeNull()

  expect(findById(HOSTILE_CAPTURE.node, 'hostile-tab-link')?.attributes?.['href']).toBe(
    `java\tscript:window.${XSS_FLAG} = true`,
  )
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
