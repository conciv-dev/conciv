import 'virtual:uno.css'
import {render} from '@solidjs/testing-library'
import {page, userEvent} from 'vitest/browser'
import {expect, it} from 'vitest'
import {Menu} from '../src/menu.js'
import {TooltipIconButtonSlot} from '../src/tooltip-icon-button.js'

const NAME = 'Terminal options for Claude Code'

function mount(): void {
  render(() => (
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
  ))
}

function mountPlain(): void {
  render(() => (
    <TooltipIconButtonSlot tooltip={NAME}>
      {(buttonProps) => (
        <button {...buttonProps()}>
          <span aria-hidden="true">T</span>
        </button>
      )}
    </TooltipIconButtonSlot>
  ))
}

function tooltipTriggerOf(button: Element): HTMLElement {
  const trigger = button.closest('[data-scope="tooltip"][data-part="trigger"]')
  if (!(trigger instanceof HTMLElement)) throw new Error('the button is not wrapped by a tooltip trigger')
  return trigger
}

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
  expect(positioner.style.getPropertyValue('--x')).not.toBe('')
  expect(positioner.style.getPropertyValue('--y')).not.toBe('')
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

it('hides the tooltip once the menu it opens is showing', async () => {
  mount()
  const button = page.getByRole('button', {name: NAME})
  await userEvent.hover(button)
  await expect.element(page.getByRole('tooltip')).toBeVisible()

  await button.click()

  await expect.element(page.getByRole('menu')).toBeVisible()
  await expect.element(page.getByRole('tooltip')).not.toBeInTheDocument()
})

it('drives the menu from the keyboard without stranding the tooltip', async () => {
  mount()
  const button = page.getByRole('button', {name: NAME})
  await expect.element(button).toBeVisible()

  await userEvent.tab()
  await expect.element(page.getByRole('tooltip')).toBeVisible()

  await userEvent.keyboard('{Enter}')
  await expect.element(page.getByRole('menu')).toBeVisible()
  await expect.element(page.getByRole('tooltip')).not.toBeInTheDocument()

  await userEvent.keyboard('{Escape}')
  await expect.element(page.getByRole('menu')).not.toBeInTheDocument()
  await expect.element(button).toHaveFocus()
})

it('describes the button by the tooltip it shows, not the wrapper around it', async () => {
  mountPlain()
  const button = page.getByRole('button', {name: NAME})
  await userEvent.hover(button)

  const tooltip = page.getByRole('tooltip')
  await expect.element(tooltip).toBeVisible()
  await expect.element(button).toHaveAttribute('aria-describedby', tooltip.element().id)
})

it('takes the tooltip away when the button is pressed', async () => {
  mountPlain()
  const button = page.getByRole('button', {name: NAME})
  await userEvent.hover(button)
  await expect.element(page.getByRole('tooltip')).toBeVisible()

  await button.click()

  await expect.element(page.getByRole('tooltip')).not.toBeInTheDocument()
})
