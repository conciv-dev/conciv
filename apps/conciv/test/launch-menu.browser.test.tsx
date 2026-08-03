import {afterEach, expect, test} from 'vitest'
import {page} from 'vitest/browser'
import {render} from 'solid-js/web'
import {createSignal, For} from 'solid-js'
import {LaunchMenu} from '../src/composer/launch-menu.js'

const disposers: (() => void)[] = []
afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose()
})

function mountMenu(state: {pending?: boolean; failed?: boolean} = {}): void {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const [made, setMade] = createSignal<string[]>([])
  const choose = (choice: string) => setMade((choices) => [...choices, choice])
  const dispose = render(
    () => (
      <>
        <ul>
          <For each={made()}>{(choice) => <li>chose {choice}</li>}</For>
        </ul>
        <LaunchMenu
          harnessName="Claude"
          class="size-8"
          pending={state.pending}
          failed={state.failed}
          onOpen={() => choose('open')}
          onCopy={() => choose('copy')}
          onRetry={() => choose('retry')}
        />
      </>
    ),
    host,
  )
  disposers.push(() => {
    dispose()
    host.remove()
  })
}

const chosen = (): string[] =>
  page
    .getByRole('listitem')
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
