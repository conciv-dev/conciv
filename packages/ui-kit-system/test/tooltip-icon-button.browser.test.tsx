import 'virtual:uno.css'
import {render} from 'solid-js/web'
import {page, userEvent} from 'vitest/browser'
import {afterEach, expect, it} from 'vitest'
import {Menu} from '../src/menu.js'
import {TooltipIconButtonSlot} from '../src/tooltip-icon-button.js'

const NAME = 'Terminal options for Claude Code'

const disposers: (() => void)[] = []
const hosts: HTMLElement[] = []

function mount(): void {
  const host = document.createElement('div')
  document.body.appendChild(host)
  hosts.push(host)
  disposers.push(
    render(
      () => (
        <Menu.Root>
          <TooltipIconButtonSlot tooltip={NAME}>
            {(buttonProps) => (
              <Menu.Trigger
                asChild={(triggerProps) => (
                  <button {...buttonProps()} {...triggerProps()}>
                    <span aria-hidden="true">T</span>
                  </button>
                )}
              />
            )}
          </TooltipIconButtonSlot>
          <Menu.Positioner>
            <Menu.Content aria-label={NAME}>
              <Menu.Item value="open">Open in Claude Code</Menu.Item>
            </Menu.Content>
          </Menu.Positioner>
        </Menu.Root>
      ),
      host,
    ),
  )
}

function tooltipTriggerOf(button: Element): HTMLElement {
  const trigger = button.closest('[data-scope="tooltip"][data-part="trigger"]')
  if (!(trigger instanceof HTMLElement)) throw new Error('the button is not wrapped by a tooltip trigger')
  return trigger
}

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose()
  for (const host of hosts.splice(0)) host.remove()
})

it('positions the tooltip next to a trigger that also opens a menu', async () => {
  mount()
  const button = page.getByRole('button', {name: NAME})
  await expect.element(button).toBeVisible()
  await expect.element(button).toHaveAttribute('aria-haspopup', 'menu')

  await userEvent.hover(button)

  const tooltip = page.getByRole('tooltip')
  await expect.element(tooltip).toBeVisible()
  await expect.element(tooltip).toHaveTextContent(NAME)
  await expect.element(tooltip).toHaveAttribute('data-placement')

  const positioner = tooltip.element().parentElement
  if (!(positioner instanceof HTMLElement)) throw new Error('the tooltip rendered no positioner')
  await expect.poll(() => positioner.style.getPropertyValue('--x')).not.toBe('')
  await expect.poll(() => positioner.style.getPropertyValue('--y')).not.toBe('')
})

it('keeps the tooltip machine identity off the menu trigger', async () => {
  mount()
  const button = page.getByRole('button', {name: NAME})
  await expect.element(button).toBeVisible()
  await expect.element(button).toHaveAttribute('data-scope', 'menu')

  const trigger = tooltipTriggerOf(button.element())
  expect(trigger.getAttribute('data-scope')).toBe('tooltip')
  expect(trigger.getAttribute('data-part')).toBe('trigger')
  expect(trigger.id).not.toBe('')
  expect(trigger.id).not.toBe(button.element().id)
})

it('opens the tooltip when the button takes keyboard focus', async () => {
  mount()
  const button = page.getByRole('button', {name: NAME})
  await expect.element(button).toBeVisible()

  await userEvent.tab()

  await expect.element(page.getByRole('tooltip')).toBeVisible()
})
