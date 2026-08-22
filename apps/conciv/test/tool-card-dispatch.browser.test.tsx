import {render} from '@solidjs/testing-library'
import {expect, it} from 'vitest'
import {page as browserPage} from 'vitest/browser'
import type {JSX} from 'solid-js'
import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'
import type {ToolCatalogView, ToolViewCtx} from '@conciv/protocol/tool-view-types'
import type {UiAnswerValue} from '@conciv/protocol/ui-types'
import {ToolCallCard, INERT_TOOL_CTX} from '@conciv/ui-kit-chat/tools'
import {builtinToolCards} from '@conciv/ui-kit-chat-tools'
import {concivToolCards} from '@conciv/tools/cards'
import {collectToolRenderers} from '@conciv/extension'
import pageExtension from '@conciv/extension-page'

function mount(child: () => JSX.Element): void {
  render(child)
}

function ctxWith(catalog: ToolCatalogView): ToolViewCtx {
  return {...INERT_TOOL_CTX, catalog}
}

function part(name: string, input: Record<string, unknown> = {}): ToolCallPart {
  return {type: 'tool-call', id: 'd1', name, arguments: JSON.stringify(input), input, state: 'complete'}
}

function askingPart(input: Record<string, unknown>): ToolCallPart {
  return {
    type: 'tool-call',
    id: 'd1',
    name: 'conciv_ui',
    arguments: JSON.stringify(input),
    input,
    state: 'input-complete',
  }
}

function answerResult(content: unknown): ToolResultPart {
  return {type: 'tool-result', toolCallId: 'd1', content: JSON.stringify(content), state: 'complete'}
}

const allTools = () => [...concivToolCards, ...builtinToolCards]

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

it('a conciv_ui question resolves to the packaged card and hands the picked choice back to the host', async () => {
  const answers: {toolCallId: string; value: UiAnswerValue}[] = []

  mount(() => (
    <ToolCallCard
      part={askingPart({kind: 'choices', question: 'Ship it or hold?', options: ['ship', 'hold']})}
      result={undefined}
      ctx={{...INERT_TOOL_CTX, addResult: (toolCallId, value) => answers.push({toolCallId, value})}}
      tools={allTools}
    />
  ))

  await browserPage.getByRole('button', {name: 'ship'}).click()

  await expect.element(browserPage.getByRole('button', {name: 'ship'})).toBeDisabled()
  expect(answers).toEqual([{toolCallId: 'd1', value: 'ship'}])
})

it('a multiSelect choices ask collects several answers behind Submit', async () => {
  const answers: {toolCallId: string; value: UiAnswerValue}[] = []

  mount(() => (
    <ToolCallCard
      part={askingPart({
        kind: 'choices',
        question: 'Which effects need live tuning knobs?',
        options: ['Ferrofluid', 'Shader glow', 'Grain'],
        multiSelect: true,
      })}
      result={undefined}
      ctx={{...INERT_TOOL_CTX, addResult: (toolCallId, value) => answers.push({toolCallId, value})}}
      tools={allTools}
    />
  ))

  await expect.element(browserPage.getByRole('button', {name: 'Submit'})).toBeDisabled()
  await browserPage.getByRole('button', {name: 'Ferrofluid'}).click()
  await browserPage.getByRole('button', {name: 'Shader glow'}).click()
  await browserPage.getByRole('button', {name: 'Submit'}).click()

  expect(answers).toEqual([{toolCallId: 'd1', value: ['Ferrofluid', 'Shader glow']}])
})

it('an allowOther choices ask answers with what the user typed instead of an option', async () => {
  const answers: {toolCallId: string; value: UiAnswerValue}[] = []

  mount(() => (
    <ToolCallCard
      part={askingPart({
        kind: 'choices',
        question: 'Which auth method?',
        options: ['OAuth', 'JWT'],
        allowOther: true,
      })}
      result={undefined}
      ctx={{...INERT_TOOL_CTX, addResult: (toolCallId, value) => answers.push({toolCallId, value})}}
      tools={allTools}
    />
  ))

  await browserPage.getByRole('textbox', {name: 'Other'}).fill('mTLS')
  await browserPage.getByRole('button', {name: 'Submit'}).click()

  expect(answers).toEqual([{toolCallId: 'd1', value: 'mTLS'}])
})

it('a single-select allowOther ask answers with the typed text, never the option picked before it', async () => {
  const answers: {toolCallId: string; value: UiAnswerValue}[] = []

  mount(() => (
    <ToolCallCard
      part={askingPart({
        kind: 'choices',
        question: 'Which auth method?',
        options: ['OAuth', 'JWT'],
        allowOther: true,
      })}
      result={undefined}
      ctx={{...INERT_TOOL_CTX, addResult: (toolCallId, value) => answers.push({toolCallId, value})}}
      tools={allTools}
    />
  ))

  await browserPage.getByRole('button', {name: 'OAuth'}).click()
  await browserPage.getByRole('textbox', {name: 'Other'}).fill('mTLS')
  await browserPage.getByRole('button', {name: 'Submit'}).click()

  expect(answers).toEqual([{toolCallId: 'd1', value: 'mTLS'}])
})

it('a conciv_ui question that already carries its result renders answered, with no controls left to press', async () => {
  mount(() => (
    <ToolCallCard
      part={askingPart({kind: 'choices', question: 'Ship it or hold?', options: ['ship', 'hold']})}
      result={answerResult({answered: true, value: 'ship'})}
      ctx={INERT_TOOL_CTX}
      tools={allTools}
    />
  ))

  await expect.element(browserPage.getByRole('status')).toHaveTextContent('ship')
  expect(browserPage.getByRole('button', {name: 'hold'}).query()).toBeNull()
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
