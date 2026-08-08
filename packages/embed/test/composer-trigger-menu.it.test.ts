import {describe, expect, it} from 'vitest'
import {expect as expectLocator} from 'playwright/test'
import type {Locator, Page} from 'playwright'
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
  await expectLocator(input).toHaveText('')
}

async function expectActiveOption(page: Page, option: Locator): Promise<void> {
  await expectLocator(option).toBeVisible({timeout: 10_000})
  const optionId = await option.getAttribute('id')
  await expectLocator(composer(page)).toHaveAttribute('aria-activedescendant', String(optionId), {timeout: 10_000})
}

describe('the composer trigger menu inside the live widget panel', () => {
  it('groups commands by source with a visible header and a description per command', async () => {
    const page = await suite.browser().newPage()
    await openComposer(page)
    await composer(page).pressSequentially('/co')

    const menu = commandMenu(page)
    await expectLocator(menu.getByRole('option', {name: '/compact'})).toBeVisible({timeout: 10_000})
    await expectLocator(menu.getByRole('group', {name: 'Commands'})).toBeVisible()
    await expectLocator(menu.getByRole('group', {name: 'MCP'})).toBeVisible()
    await expectLocator(menu.getByRole('group', {name: 'Plugins'})).toBeVisible()
    await expectLocator(menu.getByRole('option', {name: '/compact'})).toHaveAccessibleDescription(
      'Compact the conversation',
    )
    await expectLocator(menu.getByRole('option', {name: '/mcp__probe__connect'})).toHaveAccessibleDescription(
      'Connect the probe server',
    )
    await expectLocator(menu.getByText('Compact the conversation')).toBeVisible()
    await page.close()
  })

  it('moves the highlight with the arrow keys and commits the highlighted command with Enter', async () => {
    const page = await suite.browser().newPage()
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
    await expectLocator(menu).toBeHidden({timeout: 10_000})
    await expectLocator(input).toHaveText('/config ')
    await page.close()
  })

  it('keeps the highlighted option inside the panel viewport while arrowing down a long list', async () => {
    const page = await suite.browser().newPage()
    await openComposer(page)
    await composer(page).pressSequentially('/task-')

    const menu = commandMenu(page)
    const first = menu.getByRole('option', {name: '/task-00'})
    await expectActiveOption(page, first)
    await expectLocator(first).toBeInViewport()

    const target = menu.getByRole('option', {name: '/task-30'})
    for (let step = 0; step < 30; step += 1) await page.keyboard.press('ArrowDown')
    await expectActiveOption(page, target)
    await expectLocator(target).toBeInViewport()
    await expectLocator(first).not.toBeInViewport()

    await page.keyboard.press('Enter')
    await expectLocator(composer(page)).toHaveText('/task-30 ')
    await page.close()
  })

  it('groups tools in the mention menu and commits the highlighted tool with Enter', async () => {
    const page = await suite.browser().newPage()
    await openComposer(page)
    const input = composer(page)
    await input.pressSequentially('@recording_')

    const menu = toolMenu(page)
    await expectActiveOption(page, menu.getByRole('option', {name: '@recording_start'}))
    await expectLocator(menu.getByRole('group', {name: 'recorder'})).toBeVisible()
    await expectLocator(menu.getByRole('option', {name: '@recording_start'})).toHaveAccessibleDescription(
      /Start a marked recording/,
    )
    await page.keyboard.press('ArrowDown')
    await expectActiveOption(page, menu.getByRole('option', {name: '@recording_stop'}))
    await page.keyboard.press('Enter')
    await expectLocator(menu).toBeHidden({timeout: 10_000})
    await expectLocator(input).toHaveText('@recording_stop ')
    await page.close()
  })

  it('never hands the keyboard to the menu: Tab closes it and the next keystroke still edits the composer', async () => {
    const page = await suite.browser().newPage()
    await openComposer(page)
    const input = composer(page)
    await input.pressSequentially('/co')

    const menu = commandMenu(page)
    await expectActiveOption(page, menu.getByRole('option', {name: '/compact'}))

    await page.keyboard.press('Tab')
    await expectLocator(menu).toBeHidden({timeout: 10_000})
    await expectLocator(input).toBeFocused()

    await input.pressSequentially('x')
    await expectLocator(input).toHaveText('/cox')
    await page.close()
  })
})
