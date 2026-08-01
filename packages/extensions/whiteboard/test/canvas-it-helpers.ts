import type {Page} from 'playwright'
import {fixtureHost, getExtensionTestApi, type ExtensionTestApi} from '@conciv/extension-testkit'
import {until} from '@conciv/harness-testkit'
import whiteboard from '../src/server.js'

export const clientEntry = '@conciv/extension-whiteboard/client'

export function bootWhiteboard(): Promise<ExtensionTestApi> {
  return getExtensionTestApi({server: whiteboard, host: fixtureHost(clientEntry)})
}

export const openCanvas = async (page: Page): Promise<{cx: number; cy: number}> => {
  await page.getByRole('button', {name: 'Open the whiteboard canvas'}).click()
  await page.getByRole('radio', {name: 'Rectangle'}).waitFor()
  const {width, height} = page.viewportSize() ?? {width: 1280, height: 720}
  return {cx: width / 2, cy: height / 2}
}

export type ToolCaller = {callTool: (name: string, input: unknown) => Promise<unknown>}

export const createFloatingComment = (
  api: ToolCaller,
  cid: string,
  text: string,
  options: {authorModel?: string} = {},
): Promise<unknown> =>
  api.callTool('comment.create', {
    cid,
    kind: 'floating',
    parts: [{type: 'text', text}],
    x: 240,
    y: 240,
    authorKind: 'ai',
    ...options,
  })

export const openThreadPin = async (page: Page): Promise<void> => {
  const pin = page.getByRole('button', {name: /comment, open/})
  await pin.waitFor({timeout: 30_000})
  await pin.focus()
  await pin.press('Enter')
}

export const readCanvas = async (api: ToolCaller, scope: string): Promise<unknown[]> =>
  ((await api.callTool('canvas.read', {scope})) as {elements: unknown[]}).elements

export const untilCanvasSettles = (probe: () => Promise<boolean>): Promise<void> =>
  until(probe, {hangGuardMs: 30_000, intervalMs: 250})
