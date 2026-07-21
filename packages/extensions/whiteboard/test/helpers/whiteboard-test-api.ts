import type {Page} from 'playwright'
import {fixtureHost, getExtensionTestApi, type ExtensionTestApi} from '@conciv/extension-testkit'
import whiteboard from '../../src/server.js'

const clientEntry = '@conciv/extension-whiteboard/client'

export function bootWhiteboard(): Promise<ExtensionTestApi> {
  return getExtensionTestApi({server: whiteboard, host: fixtureHost(clientEntry)})
}

export async function openCanvas(page: Page): Promise<void> {
  await page.getByRole('button', {name: 'Open the whiteboard canvas'}).click()
  await page.getByRole('radio', {name: 'Rectangle'}).waitFor()
}

export function createFloatingComment(
  api: ExtensionTestApi,
  cid: string,
  text: string,
  options: {authorModel?: string} = {},
): Promise<unknown> {
  return api.callTool('comment.create', {
    cid,
    kind: 'floating',
    parts: [{type: 'text', text}],
    x: 240,
    y: 240,
    authorKind: 'ai',
    ...options,
  })
}
