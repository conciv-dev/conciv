import {render} from 'solid-js/web'
import {afterEach, expect, it} from 'vitest'
import {page as browserPage} from 'vitest/browser'
import type {JSX} from 'solid-js'
import type {ToolCallPart} from '@tanstack/ai-client'
import type {ToolCatalogView, ToolViewCtx} from '@conciv/protocol/tool-view-types'
import {ToolCallCard, INERT_TOOL_CTX} from '@conciv/ui-kit-chat'
import {builtinToolCards} from '@conciv/ui-kit-chat-tools'
import {collectToolRenderers} from '@conciv/extension'
import pageExtension from '@conciv/extension-page'

const disposers: (() => void)[] = []
afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose()
})

function mount(child: () => JSX.Element): void {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const dispose = render(child, host)
  disposers.push(() => {
    dispose()
    host.remove()
  })
}

function ctxWith(catalog: ToolCatalogView): ToolViewCtx {
  return {...INERT_TOOL_CTX, catalog}
}

function part(name: string, input: Record<string, unknown> = {}): ToolCallPart {
  return {type: 'tool-call', id: 'd1', name, arguments: JSON.stringify(input), input, state: 'complete'}
}

const realPageRenderers = collectToolRenderers([pageExtension])

it('the real page extension registers a .render() card for its verbs', () => {
  expect(realPageRenderers.length).toBeGreaterThan(0)
  expect(realPageRenderers.some((entry) => entry.names.includes('page.click'))).toBe(true)
})

it('an extension-supplied .render() card wins over builtinToolCards for the same tool', async () => {
  const tools = [...realPageRenderers, ...builtinToolCards]

  mount(() => (
    <ToolCallCard
      part={part('page.click', {selector: '#cta'})}
      result={undefined}
      ctx={INERT_TOOL_CTX}
      tools={() => tools}
    />
  ))

  await browserPage.getByRole('button').click()
  await expect.element(browserPage.getByText('#cta')).toBeVisible()
  expect(document.body.textContent).not.toContain('Used tool:')
})

it('builtinToolCards still win over the meta-driven default when a page verb has no .render() entry', async () => {
  const tools = [...realPageRenderers, ...builtinToolCards]
  const catalog: ToolCatalogView = {
    loaded: () => true,
    meta: (name) => (name === 'Bash' ? {summary: 'run a shell command', mutating: true, mirrors: false} : undefined),
  }

  mount(() => (
    <ToolCallCard part={part('Bash', {command: 'ls'})} result={undefined} ctx={ctxWith(catalog)} tools={() => tools} />
  ))

  await expect.element(browserPage.getByText('ls')).toBeVisible()
})
