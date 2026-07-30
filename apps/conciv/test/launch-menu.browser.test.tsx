import {afterEach, expect, test} from 'vitest'
import {page} from 'vitest/browser'
import {render} from 'solid-js/web'
import {LaunchMenu} from '../src/composer/launch-menu.js'

const disposers: (() => void)[] = []
afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose()
})

function mountMenu(chosen: string[]): void {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const dispose = render(
    () => (
      <LaunchMenu
        harnessName="Claude"
        class="size-8"
        onOpen={() => chosen.push('open')}
        onCopy={() => chosen.push('copy')}
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
  const trigger = page.getByRole('button', {name: 'Open in Claude'})

  await expect.element(trigger).toHaveAttribute('aria-expanded', 'false')
  await trigger.click()
  await expect.element(trigger).toHaveAttribute('aria-expanded', 'true')

  await page.getByRole('menuitem', {name: 'Open in Claude'}).click()
  await expect.poll(() => chosen).toEqual(['open'])
  await expect.element(trigger).toHaveAttribute('aria-expanded', 'false')

  await trigger.click()
  await page.getByRole('menuitem', {name: 'Copy command'}).click()
  await expect.poll(() => chosen).toEqual(['open', 'copy'])
})
