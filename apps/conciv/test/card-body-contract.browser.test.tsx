import {render} from '@solidjs/testing-library'
import {expect, it} from 'vitest'
import {page as browserPage} from 'vitest/browser'
import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'
import type {ToolCardEntry} from '@conciv/protocol/tool-view-types'
import {CardChromeProvider, INERT_TOOL_CTX, ToolCallCard, ToolTraceRow} from '@conciv/ui-kit-chat/tools'
import {builtinToolCards} from '@conciv/ui-kit-chat-tools'
import {concivToolCards} from '@conciv/tools/cards'
import {coreToolCards} from '@conciv/core/cards'
import {collectToolRenderers} from '@conciv/extension'
import pageExtension from '@conciv/extension-page'

const registeredCards: ToolCardEntry[] = [
  ...collectToolRenderers([pageExtension]),
  ...concivToolCards,
  ...coreToolCards,
  ...builtinToolCards,
]

const cardCases = registeredCards.map((entry) => ({name: entry.names[0] ?? '', entry}))

function callPart(name: string, input: Record<string, unknown>): ToolCallPart {
  return {type: 'tool-call', id: 'c1', name, arguments: JSON.stringify(input), input, state: 'complete'}
}

function jsonResult(content: string): ToolResultPart {
  return {type: 'tool-result', toolCallId: 'c1', content, state: 'complete'}
}

function cardRendersBody(entry: ToolCardEntry, part: ToolCallPart, result: ToolResultPart | undefined): boolean {
  const {container} = render(() => (
    <CardChromeProvider value="embedded" headerChannel={() => () => {}} rowLine={() => ''}>
      <ToolCallCard part={part} result={result} ctx={INERT_TOOL_CTX} tools={() => [entry]} />
    </CardChromeProvider>
  ))
  const visual = container.querySelector('img, svg, canvas, iframe, input, button, pre, diffs-container')
  return visual !== null || (container.textContent ?? '').trim().length > 0
}

async function rowFramesBody(
  entry: ToolCardEntry,
  part: ToolCallPart,
  result: ToolResultPart | undefined,
): Promise<boolean> {
  const {container} = render(() => (
    <ToolTraceRow part={part} result={result} ctx={INERT_TOOL_CTX} tools={() => [entry]} />
  ))
  const row = browserPage.elementLocator(container)
  await expect.element(row.getByRole('img', {name: 'succeeded'})).toBeVisible()
  return container.querySelector('button:not(:disabled)') !== null
}

it.each(cardCases)('frames the $name card under a trace row exactly when it renders a body', async ({name, entry}) => {
  const part = callPart(name, {})

  const renders = cardRendersBody(entry, part, undefined)
  const framed = await rowFramesBody(entry, part, undefined)

  expect(framed).toBe(renders)
})

it.each(cardCases)(
  'frames the $name card with a settled result exactly when it renders a body',
  async ({name, entry}) => {
    const part = callPart(name, {selector: '#main', file: 'src/app.ts', command: 'ls'})
    const result = jsonResult('{"ok":true}')

    const renders = cardRendersBody(entry, part, result)
    const framed = await rowFramesBody(entry, part, result)

    expect(framed).toBe(renders)
  },
)
