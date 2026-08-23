import 'virtual:uno.css'
import {page} from 'vitest/browser'
import {expect, it} from 'vitest'
import {cleanup} from '@solidjs/testing-library'
import type {ToolCallPart} from '@tanstack/ai-client'
import type {ToolViewCtx} from '@conciv/protocol/tool-view-types'
import {PAGE_TOOL_DEFS, pageVerbOfTool} from '@conciv/extension-page/defs'
import {INERT_ADD_RESULT, GENERIC_TOOL_ICON, MetaToolCard, toolIconRender} from '@conciv/ui-kit-chat/tools'
import {nowTitle} from '@conciv/ui-kit-chat/tools'
import {mountView} from './mount-view.js'
import {builtinPageRegistry, registryCatalogView} from './registry-catalog-view.js'

const catalog = registryCatalogView(builtinPageRegistry())
const ctx: ToolViewCtx = {apiBase: '', harnessId: 'test', sendMessage: () => {}, addResult: () => {}, catalog}

function part(
  verb: string,
  args: Record<string, unknown> = {},
  state: ToolCallPart['state'] = 'complete',
): ToolCallPart {
  return {type: 'tool-call', id: 'p1', name: `page.${verb}`, arguments: JSON.stringify(args), input: args, state}
}

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
    expect(nowTitle(part(verb, {}, 'input-streaming'), catalog), `${def.name} running title`).toBe(running)
    mountView(() => <MetaToolCard part={part(verb)} result={undefined} ctx={ctx} addResult={INERT_ADD_RESULT} />)
    await expect.element(page.getByText(done, {exact: true}).first()).toBeVisible()
    expect(document.body.textContent).not.toContain(def.name)
    cleanup()
  }
})

it('representative cards render their declared titles and icons for the record', async () => {
  const representatives: Array<{verb: string; args: Record<string, unknown>}> = [
    {verb: 'text', args: {selector: '#probe'}},
    {verb: 'click', args: {selector: '#press-btn'}},
    {verb: 'settext', args: {selector: '#title', value: 'Rewritten'}},
    {verb: 'locate', args: {selector: '#title'}},
    {verb: 'effect', args: {action: 'enable', effect: 'highlight'}},
  ]
  for (const {verb, args} of representatives) {
    const declared = PAGE_TOOL_DEFS.find((def) => def.name === `page.${verb}`)?.meta?.label
    if (!declared) throw new Error(`page.${verb} declares no label`)
    const selector = args['selector']
    const headline = typeof selector === 'string' ? `${declared.done} ${selector}` : declared.done
    mountView(() => <MetaToolCard part={part(verb, args)} result={undefined} ctx={ctx} addResult={INERT_ADD_RESULT} />)
    await expect.element(page.getByText(headline, {exact: true}).first()).toBeVisible()
    await page.screenshot({path: `__screenshots__/registry-card-declarations/page-${verb}.png`})
    cleanup()
  }
})
