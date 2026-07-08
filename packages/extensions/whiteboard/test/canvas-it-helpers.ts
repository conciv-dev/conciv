import type {Page} from 'playwright'
import type {ElementRow} from '../src/shared/rows.js'

export const clientEntry = '@conciv/extension-whiteboard/client'

export const elementRowFixture = (
  overrides: Partial<ElementRow> & Pick<ElementRow, 'room' | 'elementId' | 'data' | 'version'>,
): ElementRow => ({
  ownerKind: 'human',
  ownerId: null,
  ownerName: null,
  ownerModel: null,
  lastEditedByKind: 'human',
  lastEditedById: null,
  lastEditedByName: null,
  lastEditedByModel: null,
  ...overrides,
})

export const openCanvas = async (page: Page): Promise<{cx: number; cy: number}> => {
  await page.getByRole('button', {name: 'Open the whiteboard canvas'}).click()
  await page.getByRole('radio', {name: 'Rectangle'}).waitFor()
  const {width, height} = page.viewportSize() ?? {width: 1280, height: 720}
  return {cx: width / 2, cy: height / 2}
}

export type ToolCaller = {callTool: (name: string, input: unknown) => Promise<unknown>}

export const readCanvas = async (api: ToolCaller, scope: string): Promise<unknown[]> =>
  ((await api.callTool('canvas.read', {scope})) as {elements: unknown[]}).elements

export const drawRectangle = async (page: Page, cx: number, cy: number): Promise<void> => {
  await page.mouse.click(cx, cy)
  await page.keyboard.press('r')
  await page.mouse.move(cx - 60, cy - 40)
  await page.mouse.down()
  await page.mouse.move(cx + 60, cy + 40, {steps: 8})
  await page.mouse.up()
}
