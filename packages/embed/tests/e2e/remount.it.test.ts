import {expect, test} from '@playwright/test'
import {bootEmbedKit, type EmbedKit} from '../helpers/boot.js'
import {handleHostPage} from '../helpers/host.js'
import {serveHost} from '@conciv/extension-testkit/serve-host'
import {mountHandle, openHostWithHandle, remountHandle, unmountHandle} from './helpers/handle.js'
import {chatBox, openChatPanel, sendChatMessage} from './helpers/chat.js'

const ASSISTANT_TEXT = 'Remounted reply'
const USER_TEXT = 'first message before the remount'
const SECOND_USER_TEXT = 'second message after the remount'

let kit: EmbedKit
let host: {base: string; close: () => Promise<void>}

test.beforeAll(async () => {
  host = await serveHost(() => handleHostPage())
})

test.afterAll(async () => {
  await host.close()
})

test.beforeEach(async () => {
  kit = await bootEmbedKit({text: ASSISTANT_TEXT})
})

test.afterEach(async () => {
  await kit.cleanup()
})

test.describe('handle unmount and remount keeps delivering turns', () => {
  test('renders the second assistant reply after a full unmount and remount', async ({page}) => {
    test.setTimeout(240_000)
    const pageErrors = await openHostWithHandle(page, host.base, kit.base)
    await openChatPanel(page)

    await sendChatMessage(page, USER_TEXT)
    await expect(page.getByText(ASSISTANT_TEXT)).toHaveCount(1, {timeout: 30_000})

    await unmountHandle(page)
    await expect(page.getByRole('button', {name: 'Open conciv chat'})).toHaveCount(0, {timeout: 30_000})

    await remountHandle(page)
    await expect(chatBox(page)).toBeVisible({timeout: 30_000})
    await expect(page.getByText(USER_TEXT)).toHaveCount(1, {timeout: 30_000})
    await expect(page.getByText(ASSISTANT_TEXT)).toHaveCount(1, {timeout: 30_000})

    await sendChatMessage(page, SECOND_USER_TEXT)
    await expect(page.getByText(ASSISTANT_TEXT)).toHaveCount(2, {timeout: 30_000})
    await expect(page.getByText(SECOND_USER_TEXT)).toHaveCount(1, {timeout: 30_000})
    await expect(page.getByText(USER_TEXT)).toHaveCount(1, {timeout: 30_000})

    expect(pageErrors).toEqual([])
  })

  test('renders the second assistant reply after a fresh handle replaces the unmounted one', async ({page}) => {
    test.setTimeout(240_000)
    const pageErrors = await openHostWithHandle(page, host.base, kit.base)
    await openChatPanel(page)

    await sendChatMessage(page, USER_TEXT)
    await expect(page.getByText(ASSISTANT_TEXT)).toHaveCount(1, {timeout: 30_000})

    await unmountHandle(page)
    await expect(page.getByRole('button', {name: 'Open conciv chat'})).toHaveCount(0, {timeout: 30_000})

    await mountHandle(page, kit.base)
    await expect(chatBox(page)).toBeVisible({timeout: 30_000})
    await expect(page.getByText(USER_TEXT)).toHaveCount(1, {timeout: 30_000})
    await expect(page.getByText(ASSISTANT_TEXT)).toHaveCount(1, {timeout: 30_000})

    await sendChatMessage(page, SECOND_USER_TEXT)
    await expect(page.getByText(ASSISTANT_TEXT)).toHaveCount(2, {timeout: 30_000})
    await expect(page.getByText(SECOND_USER_TEXT)).toHaveCount(1, {timeout: 30_000})
    await expect(page.getByText(USER_TEXT)).toHaveCount(1, {timeout: 30_000})

    expect(pageErrors).toEqual([])
  })
})
