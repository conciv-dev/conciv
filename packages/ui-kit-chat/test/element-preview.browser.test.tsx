import 'virtual:uno.css'
import {afterEach, expect, it} from 'vitest'
import {page} from 'vitest/browser'
import {
  ELEMENT_CAPTURE_FIXTURE_CSS,
  ELEMENT_CAPTURE_FIXTURE_DESCRIPTOR_ONLY,
  ELEMENT_CAPTURE_FIXTURE_FULL,
  ELEMENT_CAPTURE_FIXTURE_MASKED,
} from '../src/store/element-capture.fixtures.js'
import {ElementPreview} from '../src/styled/element-preview.js'
import {cleanupViews, mountView} from './mount-view.js'

afterEach(() => {
  cleanupViews()
})

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

  await expect.element(page.getByRole('img', {name: 'Email'})).toHaveAttribute('aria-busy', 'false')
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

  await expect.element(page.getByRole('img')).toHaveAttribute('aria-busy', 'false')
  const target = shadowTarget()
  expect(target.value).toBe('***')
})
