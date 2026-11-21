import {expect, test} from '@conciv/e2e-utils/fixtures'
import {collectFailures, expectWidgetBoots, holdEngineCall, loginWidget} from '@conciv/e2e-utils/widget'

test.describe('sessions on a vite react page when the engine fails a session change', () => {
  test('the user renames the session, hears the rename fail when the engine refuses it, and the next rename is saved', async ({
    page,
  }) => {
    const failures = collectFailures(page)
    await loginWidget(page)
    await expectWidgetBoots(page, failures)
    const rename = await holdEngineCall(page, ['sessions', 'rename'])
    await page.reload({waitUntil: 'domcontentloaded'})
    await expect(page.getByRole('textbox', {name: 'Message the conciv agent'})).toBeVisible()

    await page.getByRole('button', {name: 'Rename session'}).click()
    const title = page.getByRole('textbox', {name: 'Session title'})
    await expect(title).toBeFocused()
    await title.press('ControlOrMeta+A')
    await title.pressSequentially('Title the engine refuses')
    await title.press('Enter')
    await rename.arrived
    await expect(page.getByRole('button', {name: 'Title the engine refuses, session options'})).toBeVisible()

    rename.release('INTERNAL_SERVER_ERROR')
    await expect(page.getByRole('alert').filter({hasText: 'Rename failed'})).toBeVisible()
    await expect(page.getByRole('button', {name: 'Title the engine refuses, session options'})).toHaveCount(0)

    await page.getByRole('button', {name: 'Rename session'}).click()
    await expect(title).toBeFocused()
    await title.press('ControlOrMeta+A')
    await title.pressSequentially('Release notes')
    await title.press('Enter')
    await expect(page.getByRole('status').filter({hasText: 'Renamed to Release notes'})).toBeVisible()
    await expect(page.getByRole('button', {name: 'Release notes, session options'})).toBeVisible()
  })

  test('the user starts a new session while the engine fails to create it, is told to check the engine, and the next try starts one', async ({
    page,
  }) => {
    const failures = collectFailures(page)
    await loginWidget(page)
    await expectWidgetBoots(page, failures)
    const create = await holdEngineCall(page, ['sessions', 'create'])
    await page.reload({waitUntil: 'domcontentloaded'})
    await expect(page.getByRole('textbox', {name: 'Message the conciv agent'})).toBeVisible()

    await page.getByRole('button', {name: /, session options$/}).click()
    const sessionOptions = page.getByRole('dialog', {name: 'Session options'})
    await sessionOptions.getByRole('button', {name: 'New session', exact: true}).click()
    await create.arrived
    create.release('INTERNAL_SERVER_ERROR')
    await expect(
      page.getByText('Could not start a new session. Check that the engine is running, then try again.'),
    ).toBeVisible()

    await sessionOptions.getByRole('button', {name: 'New session', exact: true}).click()
    await expect(page.getByRole('status').filter({hasText: 'Started a new session'})).toBeVisible()
    await expect(page.getByRole('button', {name: 'New session, session options'})).toBeVisible()
  })
})

test.describe('a session renamed in another browser', () => {
  test('the user renames the open session in a second browser, and the first browser shows the new title in its open rail', async ({
    page,
    secondPage,
  }) => {
    const failures = collectFailures(page)
    await loginWidget(page)
    await expectWidgetBoots(page, failures)

    const otherFailures = collectFailures(secondPage)
    await loginWidget(secondPage)
    await expectWidgetBoots(secondPage, otherFailures)
    await secondPage.getByRole('button', {name: 'Rename session'}).click()
    const otherTitle = secondPage.getByRole('textbox', {name: 'Session title'})
    await expect(otherTitle).toBeFocused()
    await otherTitle.press('ControlOrMeta+A')
    await otherTitle.pressSequentially('Renamed in the other browser')
    await otherTitle.press('Enter')
    await expect(secondPage.getByRole('button', {name: 'Renamed in the other browser, session options'})).toBeVisible()

    await expect(page.getByRole('button', {name: 'Renamed in the other browser, session options'})).toBeVisible()
  })
})
