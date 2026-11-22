import {expect, test} from '@conciv/e2e-utils/fixtures'
import {collectFailures, expectWidgetBoots, loginWidget} from '@conciv/e2e-utils/widget'

test.describe('grabbing an element of the vite react host page', () => {
  test('the user picks a heading of the host page, the composer stages it with its source file and line, and the user removes it', async ({
    page,
  }) => {
    await page.getByRole('button', {name: 'More composer actions'}).click()
    await page.getByRole('menuitem', {name: 'Select an element from the page'}).click()
    // oxlint-disable-next-line conciv/no-forced-click -- the picker turns page pointer events off while it picks; approved by the maintainer
    await page.getByRole('heading', {name: 'Get started'}).click({force: true})

    await expect(page.getByRole('button', {name: 'Open grabbed element'})).toBeVisible()
    await expect(page.getByText(/^in .*src\/App\.tsx:\d+/)).toBeVisible()

    await page.getByRole('button', {name: 'Remove Grabbed element'}).click()
    await expect(page.getByRole('button', {name: 'Open grabbed element'})).not.toBeVisible()
  })
})

test.describe('the user types into the host page with the panel open', () => {
  test('a click on a host field moves focus out of the terminal and the keys go to the host field, and keys typed in the composer never reach the host page key handler', async ({
    page,
  }) => {
    await expect(page.getByText('Keys the page received: 0')).toBeVisible()

    await page.getByRole('tab', {name: 'Terminal'}).click()
    const terminalInput = page.getByRole('textbox', {name: 'Terminal input'})
    await expect(terminalInput).toBeFocused()
    const search = page.getByRole('textbox', {name: 'Search plants'})
    await search.click()
    await expect(search).toBeFocused()
    await expect(terminalInput).not.toBeFocused()
    await page.keyboard.type('fern')
    await expect(search).toHaveValue('fern')
    await expect(search).toBeFocused()
    await expect(page.getByText('Keys the page received: 4')).toBeVisible()

    await page.getByRole('tab', {name: 'Chat'}).click()
    const composer = page.getByRole('textbox', {name: 'Message the conciv agent'})
    await composer.click()
    await expect(composer).toBeFocused()
    await page.keyboard.type('water the fern')
    await expect(composer).toHaveText('water the fern')

    await expect(page.getByText('Keys the page received: 4')).toBeVisible()
    await expect(search).toHaveValue('fern')
  })
})

test.describe('the engine address a vite react page gives the widget', () => {
  test.use({signedIn: false})

  test('an address the page sets as a global wins over the meta tag, and the meta tag wins over ?core=', async ({
    page,
  }) => {
    const globalSocket = page.waitForEvent('websocket', (socket) => new URL(socket.url()).pathname === '/rpc-ws')
    await page.goto('/api-base.html', {waitUntil: 'domcontentloaded'})
    expect(new URL((await globalSocket).url()).host).toBe('127.0.0.1:1')

    const failures = collectFailures(page)
    await loginWidget(page, '/?core=http://127.0.0.1:1')
    await expectWidgetBoots(page, failures)
  })
})
