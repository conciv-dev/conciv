import {expect, test, type Locator, type Page} from '@playwright/test'
import recorderServer from '@conciv/extension-recorder'
import {setupWidgetSuite} from './helpers/suite.js'
import {openPanel} from './helpers/panel.js'
import {setNavigation} from './helpers/navigation.js'

const LONG_LIST_SIZE = 60

const longCommands = Array.from({length: LONG_LIST_SIZE}, (_unused, position) => ({
  name: `task-${String(position).padStart(2, '0')}`,
  description: `Run the number ${position} maintenance routine for the active session`,
}))

const suite = setupWidgetSuite({
  text: 'Trigger menu reply',
  extensions: [recorderServer],
  commands: [
    {name: 'compact', description: 'Compact the conversation'},
    {name: 'config', description: 'Open configuration'},
    {name: 'mcp__probe__connect', description: 'Connect the probe server'},
    {name: 'plugins:codeowners', description: 'List the code owners'},
    ...longCommands,
  ],
})

const composer = (page: Page) => page.getByRole('textbox', {name: 'Message the conciv agent'})
const commandMenu = (page: Page) => page.getByRole('listbox', {name: 'Commands'})
const toolMenu = (page: Page) => page.getByRole('listbox', {name: 'Tools'})

async function openComposer(page: Page): Promise<void> {
  const {sessionId} = await suite.kit().rpc.sessions.create()
  expect(await setNavigation(suite.kit(), [{href: `/panel/${sessionId}`}])).toBe(true)
  await page.goto(suite.host().base, {waitUntil: 'domcontentloaded'})
  await openPanel(page)
  const input = composer(page)
  await input.click()
  await expect(input).toHaveText('')
}

async function expectActiveOption(page: Page, option: Locator): Promise<void> {
  await expect(option).toBeVisible({timeout: 10_000})
  await expect(option).toHaveAttribute('id', /.+/, {timeout: 10_000})
  const optionId = await option.getAttribute('id')
  if (!optionId) throw new Error('the highlighted option rendered without an id')
  await expect(composer(page)).toHaveAttribute('aria-activedescendant', optionId, {timeout: 10_000})
}

test.describe('the composer trigger menu inside the live widget panel', () => {
  test('groups commands by source with a visible header and a description per command', async ({page}) => {
    test.setTimeout(90_000)
    await openComposer(page)
    await composer(page).pressSequentially('/co')

    const menu = commandMenu(page)
    await expect(menu.getByRole('option', {name: '/compact'})).toBeVisible({timeout: 10_000})
    await expect(menu.getByRole('group', {name: 'Commands'})).toBeVisible()
    await expect(menu.getByRole('group', {name: 'MCP'})).toBeVisible()
    await expect(menu.getByRole('group', {name: 'Plugins'})).toBeVisible()
    await expect(menu.getByRole('option', {name: '/compact'})).toHaveAccessibleDescription('Compact the conversation')
    await expect(menu.getByRole('option', {name: '/mcp__probe__connect'})).toHaveAccessibleDescription(
      'Connect the probe server',
    )
    await expect(menu.getByText('Compact the conversation')).toBeVisible()
  })

  test('moves the highlight with the arrow keys and commits the highlighted command with Enter', async ({page}) => {
    test.setTimeout(240_000)
    await openComposer(page)
    const input = composer(page)
    await input.pressSequentially('/co')

    const menu = commandMenu(page)
    await expectActiveOption(page, menu.getByRole('option', {name: '/compact'}))
    await page.keyboard.press('ArrowDown')
    await expectActiveOption(page, menu.getByRole('option', {name: '/config'}))
    await page.keyboard.press('ArrowDown')
    await expectActiveOption(page, menu.getByRole('option', {name: '/mcp__probe__connect'}))
    await page.keyboard.press('ArrowUp')
    await expectActiveOption(page, menu.getByRole('option', {name: '/config'}))

    await page.keyboard.press('Enter')
    await expect(menu).toBeHidden({timeout: 10_000})
    await expect(input).toHaveText('/config ')
  })

  test('keeps the highlighted option inside the panel viewport while arrowing down a long list', async ({page}) => {
    test.setTimeout(120_000)
    await openComposer(page)
    await composer(page).pressSequentially('/task-')

    const menu = commandMenu(page)
    const first = menu.getByRole('option', {name: '/task-00'})
    await expectActiveOption(page, first)
    await expect(first).toBeInViewport()

    const target = menu.getByRole('option', {name: '/task-30'})
    for (let step = 0; step < 30; step += 1) await page.keyboard.press('ArrowDown')
    await expectActiveOption(page, target)
    await expect(target).toBeInViewport()
    await expect(first).not.toBeInViewport()

    await page.keyboard.press('Enter')
    await expect(composer(page)).toHaveText('/task-30 ')
  })

  test('groups tools in the mention menu and commits the highlighted tool with Enter', async ({page}) => {
    test.setTimeout(180_000)
    await openComposer(page)
    const input = composer(page)
    await input.pressSequentially('@recording_')

    const menu = toolMenu(page)
    await expectActiveOption(page, menu.getByRole('option', {name: '@recording_start'}))
    await expect(menu.getByRole('group', {name: 'recorder'})).toBeVisible()
    await expect(menu.getByRole('option', {name: '@recording_start'})).toHaveAccessibleDescription(
      /Start a marked recording/,
    )
    await page.keyboard.press('ArrowDown')
    await expectActiveOption(page, menu.getByRole('option', {name: '@recording_stop'}))
    await page.keyboard.press('Enter')
    await expect(menu).toBeHidden({timeout: 10_000})
    await expect(input).toHaveText('@recording_stop ')
  })

  test('never hands the keyboard to the menu: Tab closes it and the next keystroke still edits the composer', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    await openComposer(page)
    const input = composer(page)
    await input.pressSequentially('/co')

    const menu = commandMenu(page)
    await expectActiveOption(page, menu.getByRole('option', {name: '/compact'}))

    await page.keyboard.press('Tab')
    await expect(menu).toBeHidden({timeout: 10_000})
    await expect(input).toBeFocused()

    await input.pressSequentially('x')
    await expect(input).toHaveText('/cox')
  })
})
