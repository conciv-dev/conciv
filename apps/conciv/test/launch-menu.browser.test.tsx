import {afterEach, expect, test} from 'vitest'
import {page} from 'vitest/browser'
import {render} from 'solid-js/web'
import {LaunchMenu} from '../src/composer/launch-menu.js'

const disposers: (() => void)[] = []
afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose()
})

function mountMenu(chosen: string[], canConnect = false, state: {pending?: boolean; failed?: boolean} = {}): void {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const dispose = render(
    () => (
      <LaunchMenu
        harnessName="Claude"
        class="size-8"
        canConnect={canConnect}
        pending={state.pending}
        failed={state.failed}
        onOpen={() => chosen.push('open')}
        onCopy={() => chosen.push('copy')}
        onRetry={() => chosen.push('retry')}
        onConnect={() => chosen.push('connect')}
      />
    ),
    host,
  )
  disposers.push(() => {
    dispose()
    host.remove()
  })
}

test('offers opening the terminal or copying the command', async () => {
  const chosen: string[] = []
  mountMenu(chosen)
  const trigger = page.getByRole('button', {name: 'Terminal options for Claude'})

  await expect.element(trigger).toHaveAttribute('aria-haspopup', 'menu')
  await expect.element(trigger).toHaveAttribute('aria-expanded', 'false')
  await trigger.click()
  await expect.element(trigger).toHaveAttribute('aria-expanded', 'true')

  await page.getByRole('menuitem', {name: 'Open in Claude'}).click()
  await expect.poll(() => chosen).toEqual(['open'])
  await expect.element(trigger).toHaveAttribute('aria-expanded', 'false')

  await trigger.click()
  await page.getByRole('menuitem', {name: 'Copy command'}).click()
  await expect.poll(() => chosen).toEqual(['open', 'copy'])
  expect(document.body.textContent).not.toContain('Connect a running session')
})

test('offers connecting a running session only when the harness can attach', async () => {
  const chosen: string[] = []
  mountMenu(chosen, true)

  await page.getByRole('button', {name: 'Terminal options for Claude'}).click()
  await page.getByRole('menuitem', {name: 'Connect a running session'}).click()
  await expect.poll(() => chosen).toEqual(['connect'])
})

test('the trigger is there from the first frame, busy until the harness answers', async () => {
  mountMenu([], false, {pending: true})
  const trigger = page.getByRole('button', {name: 'Terminal options for Claude'})

  await expect.element(trigger).toBeVisible()
  await expect.element(trigger).toHaveAttribute('aria-busy', 'true')
  await expect.element(trigger).toBeDisabled()
})

test('a harness that could not be read says so and offers another go', async () => {
  const chosen: string[] = []
  mountMenu(chosen, false, {failed: true})

  await page.getByRole('button', {name: 'Terminal options for Claude'}).click()
  const item = page.getByRole('menuitem', {name: /Terminal options unavailable for Claude/})
  await expect.element(item).toBeVisible()
  expect(page.getByRole('menuitem', {name: 'Open in Claude'}).elements()).toHaveLength(0)

  await item.click()
  await expect.poll(() => chosen).toEqual(['retry'])
})
