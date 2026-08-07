import 'virtual:uno.css'
import {page} from 'vitest/browser'
import {afterEach, expect, it} from 'vitest'
import type {ToolCallPart} from '@tanstack/ai-client'
import type {ToolViewCtx} from '@conciv/protocol/tool-view-types'
import {PAGE_TOOL_DEFS, pageVerbOfTool} from '@conciv/extension-page/defs'
import {PageActionCard} from '../src/styled/page-action-card.js'
import {GENERIC_TOOL_ICON, toolIconRender} from '../src/styled/tool-icon.js'
import {nowTitle} from '../src/primitives/tools/now-title.js'
import {cleanupViews, mountView} from './mount-view.js'
import {builtinPageRegistry, registryCatalogView} from './registry-catalog-view.js'

afterEach(() => {
  cleanupViews()
})

const catalog = registryCatalogView(builtinPageRegistry())
const ctx: ToolViewCtx = {apiBase: '', harnessId: 'test', sendMessage: () => {}, catalog}

function part(args: Record<string, unknown>, state: ToolCallPart['state'] = 'complete'): ToolCallPart {
  return {type: 'tool-call', id: 'p1', name: 'conciv_page', arguments: JSON.stringify(args), input: args, state}
}

const GENERIC_PAGE_TITLE = 'Page action'

it('every registry page tool declares a label and a non-generic icon', () => {
  for (const def of PAGE_TOOL_DEFS) {
    expect(def.meta?.label?.running, `${def.name} has no running label`).toBeTruthy()
    expect(def.meta?.label?.done, `${def.name} has no done label`).toBeTruthy()
    expect(toolIconRender(def.meta?.icon), `${def.name} renders the generic icon`).not.toBe(GENERIC_TOOL_ICON)
  }
})

it('the card titles every registry page tool from its declaration, never the generic fallback', async () => {
  for (const def of PAGE_TOOL_DEFS) {
    const verb = pageVerbOfTool(def.name)
    const done = def.meta?.label?.done
    const running = def.meta?.label?.running
    if (done === undefined || running === undefined) throw new Error(`${def.name} declares no label`)
    expect(nowTitle(part({verb}, 'input-streaming'), catalog), `${def.name} running title`).toBe(running)
    mountView(() => <PageActionCard part={part({verb})} result={undefined} ctx={ctx} />)
    await expect.element(page.getByText(done, {exact: false})).toBeVisible()
    expect(document.body.textContent).not.toContain(GENERIC_PAGE_TITLE)
    cleanupViews()
  }
})

it('representative cards render their declared titles and icons for the record', async () => {
  const representatives: Array<{verb: string; args: Record<string, unknown>}> = [
    {verb: 'text', args: {verb: 'text', selector: '#probe'}},
    {verb: 'click', args: {verb: 'click', selector: '#press-btn'}},
    {verb: 'settext', args: {verb: 'settext', selector: '#title', value: 'Rewritten'}},
    {verb: 'locate', args: {verb: 'locate', selector: '#title'}},
    {verb: 'effect', args: {verb: 'effect', action: 'enable', effect: 'highlight'}},
  ]
  for (const {verb, args} of representatives) {
    const declared = PAGE_TOOL_DEFS.find((def) => def.name === `page.${verb}`)?.meta?.label
    if (!declared) throw new Error(`page.${verb} declares no label`)
    mountView(() => <PageActionCard part={part(args)} result={undefined} ctx={ctx} />)
    await expect.element(page.getByText(declared.done, {exact: false})).toBeVisible()
    await page.screenshot({path: `__screenshots__/registry-card-declarations/page-${verb}.png`})
    cleanupViews()
  }
})
