import {describe, it, expect, afterEach} from 'vitest'
import {render} from 'solid-js/web'
import {createSignal} from 'solid-js'
import {FocusTrap} from '@conciv/ui-kit-system'
import {registerSuppressor} from '../src/shell/dialogs.js'
import {focusTrapDisabled, suppressedAttr} from '../src/shell/suppression.js'

const disposers: (() => void)[] = []
afterEach(() => {
  disposers.splice(0).forEach((dispose) => dispose())
  document.body.replaceChildren()
})

function mountTrap(open: () => boolean): {inside: () => HTMLButtonElement; outside: HTMLInputElement} {
  const host = document.createElement('div')
  document.body.appendChild(host)
  disposers.push(
    render(
      () => (
        <FocusTrap disabled={focusTrapDisabled(open())}>
          <button type="button">inside</button>
        </FocusTrap>
      ),
      host,
    ),
  )
  const outside = document.createElement('input')
  outside.setAttribute('aria-label', 'outside')
  document.body.appendChild(outside)
  const inside = (): HTMLButtonElement => {
    const button = host.querySelector('button')
    if (!button) throw new Error('trap content missing')
    return button
  }
  return {inside, outside}
}

describe('panel focus trap vs extension layers', () => {
  it('yanks focus back into the panel while no extension layer is open', async () => {
    const {inside, outside} = mountTrap(() => true)
    await expect.poll(() => document.activeElement).toBe(inside())
    outside.focus()
    await expect.poll(() => document.activeElement).toBe(inside())
  })

  it('lets an extension layer keep focus outside the panel', async () => {
    const [layerOpen, setLayerOpen] = createSignal(false)
    disposers.push(registerSuppressor(layerOpen))
    const {inside, outside} = mountTrap(() => true)
    await expect.poll(() => document.activeElement).toBe(inside())
    setLayerOpen(true)
    expect(suppressedAttr()).toBe('')
    outside.focus()
    await expect.poll(() => document.activeElement).toBe(outside)
    outside.blur()
    setLayerOpen(false)
    await expect.poll(() => document.activeElement).toBe(inside())
  })

  it('a focus-yield layer disarms the trap without hiding the panel', async () => {
    const [layerOpen, setLayerOpen] = createSignal(false)
    disposers.push(registerSuppressor(layerOpen, false))
    const {inside, outside} = mountTrap(() => true)
    await expect.poll(() => document.activeElement).toBe(inside())
    setLayerOpen(true)
    expect(suppressedAttr()).toBe(undefined)
    outside.focus()
    await expect.poll(() => document.activeElement).toBe(outside)
  })
})
