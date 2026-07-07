import type {Page} from 'playwright'

export const clientEntry = '@conciv/extension-whiteboard/client'

export const openCanvas = async (page: Page): Promise<{cx: number; cy: number}> => {
  await page.getByRole('button', {name: 'Open the whiteboard canvas'}).click()
  await page.getByRole('radio', {name: 'Rectangle'}).waitFor()
  const {width, height} = page.viewportSize() ?? {width: 1280, height: 720}
  return {cx: width / 2, cy: height / 2}
}

export type ToolCaller = {callTool: (name: string, input: unknown) => Promise<unknown>}

export const readCanvas = async (api: ToolCaller, scope: string): Promise<unknown[]> =>
  ((await api.callTool('canvas.read', {scope})) as {elements: unknown[]}).elements
