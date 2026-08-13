import './helpers/utilities.css'
import {render} from '@solidjs/testing-library'
import {beforeEach, expect, test} from 'vitest'
import {page, userEvent} from 'vitest/browser'
import type {Grab} from '@conciv/grab'
import {makeImageHostGrab} from '@conciv/extension-testkit/host/grab'
import {GrabReference} from '../src/pane/grab-reference.js'

const IMAGE_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR4nGP4z8AARwzEcQCukw/x0F8jngAAAABJRU5ErkJggg=='

function mount(grab: Grab | {text: string}): HTMLElement {
  return render(() => <GrabReference grab={grab} onRemove={() => {}} />).container
}

function domGrab(size: {width: number; height: number} = {width: 200, height: 40}): Grab {
  const node = document.createElement('div')
  node.textContent = 'Payroll Deposit clone'
  return {
    text: 'Payroll Deposit',
    preview: {kind: 'dom', node, width: size.width, height: size.height},
    source: null,
    rect: {x: 0, y: 0, width: size.width, height: size.height},
  }
}

const resizer = () => page.getByRole('separator', {name: 'Resize grabbed element preview'})

beforeEach(() => localStorage.removeItem('conciv-grab-preview-height'))

test('grab reference renders the dom preview arm by appending the cloned node', () => {
  const host = mount(domGrab())
  expect(page.getByText('Payroll Deposit clone').elements()).toHaveLength(1)
  expect(host.querySelector('img')).toBeNull()
})

test('grab reference renders the image preview arm as an img element', () => {
  const host = mount(makeImageHostGrab(IMAGE_DATA_URL))
  expect(host.querySelector('img')?.getAttribute('src')).toBe(IMAGE_DATA_URL)
})

test('a tall preview opens at the default preview height, not at its own height', async () => {
  mount(domGrab({width: 900, height: 2400}))

  await expect.element(resizer()).toHaveAttribute('aria-valuenow', '160')
})

test('the preview resizer is keyboard operable and reports the height it settles on', async () => {
  mount(domGrab({width: 900, height: 2400}))

  await userEvent.tab()
  await userEvent.tab()
  await userEvent.keyboard('{ArrowUp}{ArrowUp}')

  await expect.element(resizer()).toHaveAttribute('aria-valuenow', '112')

  await userEvent.keyboard('{ArrowDown}')

  await expect.element(resizer()).toHaveAttribute('aria-valuenow', '136')
})

test('a text-only grab has no preview to resize', async () => {
  mount({text: 'just the copied text'})

  await expect.element(page.getByText('just the copied text')).toBeVisible()
  await expect.element(resizer()).not.toBeInTheDocument()
})
