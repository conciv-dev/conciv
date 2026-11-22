import {spawn} from 'node:child_process'
import {join} from 'node:path'
import {text} from 'node:stream/consumers'
import {expect, test} from '@playwright/test'
import {collectFailures, expectWidgetBoots, loginWidget, openLoginFromLockedLauncher} from '@conciv/e2e-utils/widget'

test.describe('signing in to the widget on a vite react page', () => {
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
    const failures = collectFailures(page)
    const project = join(import.meta.dirname, '..')
    const conciv = join(project, '.conciv', 'bin', 'conciv')
    await loginWidget(page)
    await expectWidgetBoots(page, failures)

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

test.describe('attaching files with the Add attachment button', () => {
  test('the user picks two files in the file chooser, they show as chips, and the sent message in the thread carries both', async ({
    page,
  }) => {
    const failures = collectFailures(page)
    await loginWidget(page)
    await expectWidgetBoots(page, failures)

    const chooser = page.waitForEvent('filechooser')
    await page.getByRole('button', {name: 'Add attachment'}).click()
    await (
      await chooser
    ).setFiles([
      {name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('Buy milk')},
      {name: 'plan.md', mimeType: 'text/plain', buffer: Buffer.from('Step one')},
    ])
    await expect(page.getByRole('button', {name: 'notes.txt'})).toBeVisible()
    await expect(page.getByRole('button', {name: 'plan.md'})).toBeVisible()

    const composer = page.getByRole('textbox', {name: 'Message the conciv agent'})
    await composer.fill('Read my files')
    await expect(composer).toBeFocused()
    await page.keyboard.press('Enter')

    const sent = page.getByRole('article', {name: /^You: Read my files/})
    await expect(sent).toContainText('Attachment notes.txt:')
    await expect(sent).toContainText('Buy milk')
    await expect(sent).toContainText('Attachment plan.md:')
    await expect(sent).toContainText('Step one')
    await expect(page.getByRole('button', {name: 'notes.txt'})).toHaveCount(0)
    await expect(composer).toHaveText('')
  })
})
