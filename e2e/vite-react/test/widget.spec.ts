import {spawn} from 'node:child_process'
import {readFile} from 'node:fs/promises'
import {join} from 'node:path'
import {text} from 'node:stream/consumers'
import {expect, test} from '@conciv/e2e-utils/fixtures'
import {collectFailures, expectWidgetBoots, loginWidget, openLoginFromLockedLauncher} from '@conciv/e2e-utils/widget'

test.describe('signing in to the widget on a vite react page', () => {
  test.use({signedIn: false})

  test('the user opens a magic link and the widget opens with no error', async ({page}) => {
    const failures = collectFailures(page)

    await loginWidget(page)

    await expect(page).not.toHaveURL(/conciv_otp/)
    await expectWidgetBoots(page, failures)
  })

  test('the code the dev server prints in its log signs the browser in', async ({page}) => {
    const code = await openLoginFromLockedLauncher(page)

    await page.getByRole('textbox', {name: 'Digit 1 of 6'}).pressSequentially(code)

    await expect(page.getByRole('dialog', {name: 'Authorize conciv'})).not.toBeVisible()
  })
})

test.describe('the conciv CLI against the vite react dev server', () => {
  test('the user lists the open tabs with conciv tools tabs, allows the terminal always on the first page read with --tab, reads the page and its react components, and calls the page plugin with conciv plugin call', async ({
    page,
  }) => {
    const project = join(import.meta.dirname, '..')
    const conciv = join(project, '.conciv', 'bin', 'conciv')

    const listed = await text(
      spawn(process.execPath, [conciv, 'tools', 'tabs'], {
        cwd: project,
        env: {PATH: process.env.PATH, HOME: process.env.HOME, CONCIV_HOME: process.env.CONCIV_HOME},
      }).stdout,
    )
    expect(JSON.parse(listed)).toMatchObject({
      ok: true,
      data: {tabs: expect.arrayContaining([expect.objectContaining({href: page.url(), pageTitle: 'vite-react'})])},
    })
    const tab = new RegExp(`"tab":"([^"]+)"[^{}]*"href":"${page.url()}"`).exec(listed)?.[1] ?? ''

    const route = text(
      spawn(process.execPath, [conciv, 'tools', 'page', 'route', '--tab', tab], {
        cwd: project,
        env: {PATH: process.env.PATH, HOME: process.env.HOME, CONCIV_HOME: process.env.CONCIV_HOME},
      }).stdout,
    )
    const ask = page.getByRole('group', {name: 'Permission request'})
    await ask.getByRole('button', {name: 'Allow always'}).click()
    expect(JSON.parse(await route)).toMatchObject({ok: true, data: {pathname: '/', title: 'vite-react'}})

    const heading = await text(
      spawn(process.execPath, [conciv, 'tools', 'page', 'text', 'h1', '--tab', tab], {
        cwd: project,
        env: {PATH: process.env.PATH, HOME: process.env.HOME, CONCIV_HOME: process.env.CONCIV_HOME},
      }).stdout,
    )
    expect(JSON.parse(heading)).toMatchObject({ok: true, data: {text: 'Get started'}})

    const found = await text(
      spawn(process.execPath, [conciv, 'tools', 'react', 'find', '--name', 'App', '--tab', tab], {
        cwd: project,
        env: {PATH: process.env.PATH, HOME: process.env.HOME, CONCIV_HOME: process.env.CONCIV_HOME},
      }).stdout,
    )
    expect(JSON.parse(found)).toMatchObject({ok: true, data: {total: 1}})
    await expect(ask).toHaveCount(0)

    const attached = await text(
      spawn(process.execPath, [conciv, 'plugin', 'call', 'experimental.page', 'sessions.attached', '--data', '{}'], {
        cwd: project,
        env: {PATH: process.env.PATH, HOME: process.env.HOME, CONCIV_HOME: process.env.CONCIV_HOME},
      }).stdout,
    )
    expect(JSON.parse(attached)).toMatchObject({ok: true, data: expect.arrayContaining([tab])})
  })
})

test.describe('attaching files with the Add an attachment button', () => {
  test('the user picks two files in the file chooser, they show as chips, and the sent message in the thread carries both', async ({
    page,
  }) => {
    const chooser = page.waitForEvent('filechooser')
    await page.getByRole('button', {name: 'Add an attachment'}).click()
    await (
      await chooser
    ).setFiles([
      {name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('Buy milk')},
      {name: 'plan.md', mimeType: 'text/plain', buffer: Buffer.from('Step one')},
    ])
    await expect(page.getByRole('button', {name: 'notes.txt', exact: true})).toBeVisible()
    await expect(page.getByRole('button', {name: 'plan.md', exact: true})).toBeVisible()

    const composer = page.getByRole('textbox', {name: 'Message the conciv agent'})
    await composer.fill('Read my files')
    await expect(composer).toBeFocused()
    await page.keyboard.press('Enter')

    const sent = page.getByRole('article', {name: /^You: Read my files/})
    await expect(sent).toContainText('Attachment notes.txt:')
    await expect(sent).toContainText('Buy milk')
    await expect(sent).toContainText('Attachment plan.md:')
    await expect(sent).toContainText('Step one')
    await expect(page.getByRole('button', {name: 'notes.txt', exact: true})).toHaveCount(0)
    await expect(composer).toHaveText('')
  })
})

test.describe('the harnesses the widget offers on a vite react page', () => {
  test('the model menu offers a harness for each agent CLI on the PATH and none for a CLI that is missing', async ({
    page,
  }) => {
    await page.getByRole('button', {name: /^Model: /}).click()

    const menu = page.getByRole('dialog', {name: 'Model'})
    await expect(menu.getByRole('group', {name: 'Codex'})).toBeVisible()
    await expect(menu.getByRole('group', {name: 'Gemini CLI'})).toBeVisible()
    await expect(menu.getByRole('group', {name: 'OpenCode'})).toHaveCount(0)
    await expect(menu.getByRole('group', {name: 'Pi'})).toHaveCount(0)
  })
})

test.describe('the standalone conciv page on the vite react engine', () => {
  test.use({signedIn: false})

  test('the standalone page takes its engine address from ?core= and opens the panel because ?settings= says so', async ({
    page,
  }) => {
    const hostSocket = page.waitForEvent('websocket', (socket) => new URL(socket.url()).pathname === '/rpc-ws')
    await page.goto('/', {waitUntil: 'domcontentloaded'})
    const engine = new URL((await hostSocket).url())
    engine.protocol = engine.protocol === 'wss:' ? 'https:' : 'http:'
    const standalone = new URL(`http://localhost:${process.env.CONCIV_E2E_STANDALONE_PORT}/`)
    standalone.searchParams.set('core', engine.origin)
    standalone.searchParams.set('settings', JSON.stringify({defaultOpen: true}))

    await loginWidget(page, standalone.href)

    await expect(page.getByRole('button', {name: 'Minimize conciv chat'})).toBeVisible()
    await expect(page.getByRole('textbox', {name: 'Message the conciv agent'})).toBeVisible()
  })
})

test.describe('the project plugins on a vite react page', () => {
  test('the user types a draft, the project plugin is rebuilt, and the widget shows the new line in place with the draft and focus kept', async ({
    page,
    rebuildPlugin,
  }) => {
    await expect(page.getByText('live line first')).toBeVisible()
    const composer = page.getByRole('textbox', {name: 'Message the conciv agent'})
    await composer.click()
    await expect(composer).toBeFocused()
    await composer.pressSequentially('a draft the rebuild keeps')

    await rebuildPlugin('live-line', 'live line first', 'live line second')

    await expect(page.getByText('live line second')).toBeVisible()
    await expect(page.getByText('live line first')).toHaveCount(0)
    await expect(composer).toHaveText('a draft the rebuild keeps')
    await expect(composer).toBeFocused()
  })

  test('the user saves the notes as a download, and opening conciv.dev opens it in a new browser tab', async ({
    page,
    context,
  }) => {
    const download = page.waitForEvent('download')
    await page.getByRole('button', {name: 'Save notes'}).click()
    const notes = await download
    expect(notes.suggestedFilename()).toBe('notes.txt')
    expect(await readFile(await notes.path(), 'utf8')).toBe('notes the plugin saved')

    const opened = context.waitForEvent('page')
    await page.getByRole('button', {name: 'Open conciv.dev'}).click()
    const tab = await opened
    expect(tab.url()).toBe('https://conciv.dev/')
    await tab.close()
    await expect(page.getByRole('textbox', {name: 'Message the conciv agent'})).toBeVisible()
  })
})
