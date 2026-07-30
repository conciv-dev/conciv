import type {Page} from 'playwright'

export const clientEntry = '@conciv/extension-whiteboard/client'

export const openCanvas = async (page: Page): Promise<{cx: number; cy: number}> => {
  await page.getByRole('button', {name: 'Open the whiteboard canvas'}).click()
  await page.getByRole('radio', {name: 'Rectangle'}).waitFor()
  const {width, height} = page.viewportSize() ?? {width: 1280, height: 720}
  return {cx: width / 2, cy: height / 2}
}

export type ToolCaller = {callTool: (name: string, input: unknown) => Promise<unknown>}

export const createFloatingComment = (api: ToolCaller, seed: {cid: string; text: string}): Promise<unknown> =>
  api.callTool('comment.create', {
    cid: seed.cid,
    kind: 'floating',
    parts: [{type: 'text', text: seed.text}],
    x: 240,
    y: 240,
    authorKind: 'ai',
  })

export const openThreadPin = async (page: Page): Promise<void> => {
  const pin = page.getByRole('button', {name: /comment, open/})
  await pin.waitFor({timeout: 30_000})
  await pin.focus()
  await pin.press('Enter')
}

export const readCanvas = async (api: ToolCaller, scope: string): Promise<unknown[]> =>
  ((await api.callTool('canvas.read', {scope})) as {elements: unknown[]}).elements
