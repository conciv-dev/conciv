import './helpers/utilities.css'
import {expect, test} from 'vitest'
import {page, userEvent} from 'vitest/browser'
import {render} from '@solidjs/testing-library'
import {createSignal, For} from 'solid-js'
import {ComposerActions, ComposerActionsHost} from '@conciv/ui-kit-chat'
import {LaunchMenu} from '../src/composer/launch-menu.js'

const NARROW_PX = 70
const WIDE_PX = 460

type MenuMount = {setWidth: (pixels: number) => void}

function mountMenu(state: {pending?: boolean; failed?: boolean} = {}): MenuMount {
  const [made, setMade] = createSignal<string[]>([])
  const [width, setWidth] = createSignal(WIDE_PX)
  const choose = (choice: string) => setMade((choices) => [...choices, choice])
  render(() => (
    <>
      <ul>
        <For each={made()}>{(choice) => <li>chose {choice}</li>}</For>
      </ul>
      <div style={{width: `${width()}px`}}>
        <ComposerActionsHost>
          <ComposerActions.Trigger>
            <span aria-hidden="true">…</span>
          </ComposerActions.Trigger>
          <ComposerActions.Trailing>
            <span />
          </ComposerActions.Trailing>
          <ComposerActions.ActionButton priority={20} tooltip="Earlier action" onClick={() => choose('earlier')}>
            <span aria-hidden="true" />
          </ComposerActions.ActionButton>
          <LaunchMenu
            harnessName="Claude"
            class="size-8"
            pending={state.pending}
            failed={state.failed}
            onOpen={() => choose('open')}
            onCopy={() => choose('copy')}
            onRetry={() => choose('retry')}
          />
          <ComposerActions.ActionButton priority={5} tooltip="Later action" onClick={() => choose('later')}>
            <span aria-hidden="true" />
          </ComposerActions.ActionButton>
        </ComposerActionsHost>
      </div>
    </>
  ))
  return {setWidth}
}

const chosen = (): string[] =>
  page
    .getByRole('listitem')
    .elements()
    .map((item) => item.textContent ?? '')

const overflowTrigger = () => page.getByRole('button', {name: 'More composer actions'})
const launchTrigger = () => page.getByRole('button', {name: 'Terminal options for Claude'})
const openItem = () => page.getByRole('menuitem', {name: 'Open in Claude'})
const copyItem = () => page.getByRole('menuitem', {name: 'Copy command'})
const retryItem = () => page.getByRole('menuitem', {name: /Terminal options unavailable for Claude/})
const laterItem = () => page.getByRole('menuitem', {name: 'Later action'})

const menuItemLabels = (): string[] =>
  page
    .getByRole('menuitem')
    .elements()
    .map((item) => item.textContent ?? '')

test('offers opening the terminal or copying the command', async () => {
  mountMenu()
  const trigger = page.getByRole('button', {name: 'Terminal options for Claude'})

  await expect.element(trigger).toHaveAttribute('aria-haspopup', 'menu')
  await expect.element(trigger).toHaveAttribute('aria-expanded', 'false')
  await trigger.click()
  await expect.element(trigger).toHaveAttribute('aria-expanded', 'true')

  await page.getByRole('menuitem', {name: 'Open in Claude'}).click()
  await expect.element(page.getByText('chose open')).toBeVisible()
  expect(chosen()).toEqual(['chose open'])
  await expect.element(trigger).toHaveAttribute('aria-expanded', 'false')

  await trigger.click()
  await page.getByRole('menuitem', {name: 'Copy command'}).click()
  await expect.element(page.getByText('chose copy')).toBeVisible()
  expect(chosen()).toEqual(['chose open', 'chose copy'])
  expect(document.body.textContent).not.toContain('Connect a running session')
})

test('the trigger is there from the first frame, busy until the harness answers', async () => {
  mountMenu({pending: true})
  const trigger = page.getByRole('button', {name: 'Terminal options for Claude'})

  await expect.element(trigger).toBeVisible()
  await expect.element(trigger).toHaveAttribute('aria-busy', 'true')
  await expect.element(trigger).toBeDisabled()
})

test('a harness that could not be read says so and offers another go', async () => {
  mountMenu({failed: true})

  await page.getByRole('button', {name: 'Terminal options for Claude'}).click()
  const item = page.getByRole('menuitem', {name: /Terminal options unavailable for Claude/})
  await expect.element(item).toBeVisible()
  expect(page.getByRole('menuitem', {name: 'Open in Claude'}).elements()).toHaveLength(0)

  await item.click()
  await expect.element(page.getByText('chose retry')).toBeVisible()
  expect(chosen()).toEqual(['chose retry'])
})

test('a narrow composer folds the launch options into the shared overflow menu, kept together', async () => {
  const mount = mountMenu()
  await expect.element(launchTrigger()).toBeVisible()

  mount.setWidth(NARROW_PX)

  await expect.element(launchTrigger()).not.toBeInTheDocument()
  await userEvent.click(overflowTrigger())
  await expect.element(openItem()).toBeVisible()
  await expect.element(copyItem()).toBeVisible()
  await expect.element(laterItem()).toBeVisible()
  expect(menuItemLabels()).toEqual(['Earlier action', 'Open in Claude', 'Copy command', 'Later action'])

  await userEvent.click(openItem())
  await expect.element(page.getByText('chose open')).toBeVisible()
  expect(chosen()).toEqual(['chose open'])
})

test('a collapsed launch menu offers the retry instead when the harness could not be read', async () => {
  const mount = mountMenu({failed: true})
  await expect.element(launchTrigger()).toBeVisible()

  mount.setWidth(NARROW_PX)

  await userEvent.click(overflowTrigger())
  await expect.element(retryItem()).toBeVisible()
  await expect.element(openItem()).not.toBeInTheDocument()
  await expect.element(copyItem()).not.toBeInTheDocument()

  await userEvent.click(retryItem())
  await expect.element(page.getByText('chose retry')).toBeVisible()
  expect(chosen()).toEqual(['chose retry'])
})

test('a collapsed launch menu stays untouchable until the harness answers', async () => {
  const mount = mountMenu({pending: true})
  await expect.element(launchTrigger()).toBeVisible()

  mount.setWidth(NARROW_PX)

  await userEvent.click(overflowTrigger())
  await expect.element(openItem()).toHaveAttribute('aria-disabled', 'true')
  await expect.element(copyItem()).toHaveAttribute('aria-disabled', 'true')
})
