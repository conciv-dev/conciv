import './helpers/utilities.css'
import {render} from '@solidjs/testing-library'
import {expect, test} from 'vitest'
import {page} from 'vitest/browser'
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

function previewBox(host: HTMLElement): HTMLElement | null | undefined {
  return host.querySelector('[data-pw-grab-scale]')?.parentElement?.parentElement
}

test('grab reference renders the dom preview arm by appending the cloned node', () => {
  const host = mount(domGrab())
  expect(page.getByText('Payroll Deposit clone').elements()).toHaveLength(1)
  expect(host.querySelector('img')).toBeNull()
})

test('grab reference renders the image preview arm as an img element', () => {
  const host = mount(makeImageHostGrab(IMAGE_DATA_URL))
  expect(host.querySelector('img')?.getAttribute('src')).toBe(IMAGE_DATA_URL)
})

test('a tall preview renders inside the height-bounded preview box', () => {
  const host = mount(domGrab({width: 900, height: 2400}))

  expect(page.getByText('Payroll Deposit clone').elements()).toHaveLength(1)
  expect(previewBox(host)).toHaveClass('max-h-40', 'overflow-auto')
})

test('the preview itself carries no resize handle — the grabs container owns resizing', () => {
  const host = mount(domGrab({width: 900, height: 2400}))

  expect(page.getByText('Payroll Deposit clone').elements()).toHaveLength(1)
  expect(previewBox(host)).not.toHaveClass('resize-y')
})

test('a text-only grab has no preview box at all', () => {
  const host = mount({text: 'just the copied text'})

  expect(page.getByText('just the copied text').elements()).toHaveLength(1)
  expect(previewBox(host)).toBeUndefined()
})
