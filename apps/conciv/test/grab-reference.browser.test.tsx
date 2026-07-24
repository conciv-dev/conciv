import {render} from 'solid-js/web'
import {afterEach, expect, test} from 'vitest'
import type {Grab} from '@conciv/grab'
import {makeImageHostGrab} from '@conciv/extension-testkit/host/grab'
import {GrabReference} from '../src/chat/grab-reference.js'

const IMAGE_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR4nGP4z8AARwzEcQCukw/x0F8jngAAAABJRU5ErkJggg=='

const disposers: (() => void)[] = []
afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose()
  document.body.replaceChildren()
})

function mount(grab: Grab): HTMLElement {
  const host = document.createElement('div')
  document.body.appendChild(host)
  disposers.push(render(() => <GrabReference grab={grab} maxWidth={300} onRemove={() => {}} />, host))
  return host
}

function domGrab(): Grab {
  const node = document.createElement('div')
  node.textContent = 'Payroll Deposit clone'
  return {
    text: 'Payroll Deposit',
    preview: {kind: 'dom', node, width: 200, height: 40},
    source: null,
    rect: {x: 0, y: 0, width: 200, height: 40},
  }
}

test('grab reference renders the dom preview arm by appending the cloned node', async () => {
  const host = mount(domGrab())
  await expect.poll(() => host.textContent ?? '').toContain('Payroll Deposit clone')
  expect(host.querySelector('img')).toBeNull()
})

test('grab reference renders the image preview arm as an img element', async () => {
  const host = mount(makeImageHostGrab(IMAGE_DATA_URL))
  await expect.poll(() => host.querySelector('img') !== null).toBe(true)
  expect(host.querySelector('img')?.getAttribute('src')).toBe(IMAGE_DATA_URL)
})
