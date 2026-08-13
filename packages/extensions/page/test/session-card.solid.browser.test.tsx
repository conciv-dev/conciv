import {createSignal, type JSX} from 'solid-js'
import {render} from '@solidjs/testing-library'
import {expect, test} from 'vitest'
import {page} from 'vitest/browser'
import type {MessagePart, ToolCallPart, ToolResultPart} from '@tanstack/ai-client'
import {PAGE_SESSION_GROUP_KEY, type GroupNodeGroup, type PageSessionThinkingPart} from '@conciv/ui-kit-chat'
import {SessionCard} from '../src/client/cards/session-card.js'

function mount(view: () => JSX.Element): void {
  render(view)
}

function sessionNode(parts: readonly MessagePart[]): GroupNodeGroup {
  return {
    type: 'group',
    key: PAGE_SESSION_GROUP_KEY,
    nodeKey: '',
    idKey: undefined,
    indices: parts.map((_, index) => index),
    children: [],
  }
}

function toolCall(
  id: string,
  name: string,
  input: Record<string, unknown>,
  state: ToolCallPart['state'],
): ToolCallPart {
  return {type: 'tool-call', id, name, arguments: JSON.stringify(input), input, state}
}

function fillCall(id: string, selector: string, value: string): ToolCallPart {
  return toolCall(id, 'page.fill', {selector, value}, 'input-complete')
}

function okResult(id: string): ToolResultPart {
  return {type: 'tool-result', toolCallId: id, content: '{"ok":true}', state: 'complete'}
}

function errorResult(id: string, message: string): ToolResultPart {
  return {type: 'tool-result', toolCallId: id, content: JSON.stringify({message}), state: 'error', error: message}
}

function lookup(results: Record<string, ToolResultPart>): (id: string) => ToolResultPart | undefined {
  return (id) => results[id]
}

test('streamed act appends and token growth keep the existing step-rail rows mounted', async () => {
  const [parts, setParts] = createSignal<ToolCallPart[]>([fillCall('f1', '#name', 'Ada')])
  const results = {f1: okResult('f1')}
  mount(() => <SessionCard node={sessionNode(parts())} parts={parts} resultFor={lookup(results)} streaming={true} />)

  const rows = () => page.getByRole('listitem').elements()
  await expect.element(page.getByText('#name')).toBeVisible()
  const firstRow = rows()[0]

  setParts((previous) => [...previous, fillCall('f2', '#email', 'ada@')])
  await expect.element(page.getByText('Typing #email…')).toBeVisible()
  expect(rows()[0]).toBe(firstRow)
  const secondRow = rows()[1]

  setParts((previous) => [...previous.slice(0, 1), fillCall('f2', '#email', 'ada@example.com')])
  await expect.element(page.getByText('“ada@example.com”')).toBeVisible()
  expect(rows()[0]).toBe(firstRow)
  expect(rows()[1]).toBe(secondRow)
})

test('a streaming act outside the shorthand verbs still reads as a running phrase', async () => {
  const parts: ToolCallPart[] = [toolCall('h1', 'page.hover', {selector: '#menu'}, 'input-complete')]
  mount(() => (
    <SessionCard node={sessionNode(parts)} parts={() => parts} resultFor={() => undefined} streaming={true} />
  ))

  await expect.element(page.getByText('Hovering #menu…')).toBeVisible()
})

const SCRIPT = "await external_page_settext({selector: '#prose', text: 'better prose'})"

const codeRun = (id: string): ToolCallPart => toolCall(id, 'execute_typescript', {typescriptCode: SCRIPT}, 'complete')

const THINKING: PageSessionThinkingPart[] = [{type: 'thinking', content: 'choose the field wisely'}]

test('a settled session shows its folded reasoning and script in a collapsed flat section', async () => {
  const results = {p1: okResult('p1'), f1: okResult('f1')}
  const parts: MessagePart[] = [
    ...THINKING,
    codeRun('p1'),
    toolCall('f1', 'page.fill', {selector: '#prose', value: 'better prose'}, 'complete'),
  ]
  mount(() => (
    <SessionCard node={sessionNode(parts)} parts={() => parts} resultFor={lookup(results)} streaming={false} />
  ))

  await page.getByRole('button', {name: /Edited the page/}).click()
  const section = page.getByRole('button', {name: 'Reasoning · script'})
  await expect.element(section).toBeVisible()
  await expect.element(page.getByText('choose the field wisely')).not.toBeInTheDocument()
  await section.click()
  await expect.element(page.getByText('choose the field wisely')).toBeVisible()
  await expect.element(page.getByText(/external_page_settext/).first()).toBeVisible()
})

test('an expanded session shows its step rail without a tool-input row of its own', async () => {
  const results = {f1: okResult('f1')}
  const parts: ToolCallPart[] = [toolCall('f1', 'page.fill', {selector: '#name', value: 'Ada'}, 'complete')]
  mount(() => (
    <SessionCard node={sessionNode(parts)} parts={() => parts} resultFor={lookup(results)} streaming={false} />
  ))

  await page.getByRole('button', {name: /Edited the page/}).click()
  await expect.element(page.getByText('#name')).toBeVisible()
  await expect.element(page.getByText('no input')).not.toBeInTheDocument()
})

test('a session whose only error is the folded script run reports error status', async () => {
  const results = {p1: errorResult('p1', 'Script exploded'), f1: okResult('f1')}
  const parts: ToolCallPart[] = [
    codeRun('p1'),
    toolCall('f1', 'page.fill', {selector: '#prose', value: 'x'}, 'complete'),
  ]
  mount(() => (
    <SessionCard node={sessionNode(parts)} parts={() => parts} resultFor={lookup(results)} streaming={false} />
  ))

  await expect.element(page.getByText('Edited the page')).toBeVisible()
  expect(page.getByRole('img', {name: 'error'}).elements().length).toBeGreaterThan(0)
  expect(page.getByRole('img', {name: 'complete'}).elements()).toHaveLength(0)
})

test('a settled session without a folded route result shows no location pill', async () => {
  const results = {f1: okResult('f1')}
  const parts: ToolCallPart[] = [toolCall('f1', 'page.fill', {selector: '#name', value: 'Ada'}, 'complete')]
  mount(() => (
    <SessionCard node={sessionNode(parts)} parts={() => parts} resultFor={lookup(results)} streaming={false} />
  ))

  await expect.element(page.getByText('Edited the page')).toBeVisible()
  expect(document.body.textContent).not.toContain(location.host)
})

test('a streaming session without a route result shows the current location honestly', async () => {
  const parts: ToolCallPart[] = [toolCall('f1', 'page.fill', {selector: '#name', value: 'Ada'}, 'input-complete')]
  mount(() => (
    <SessionCard node={sessionNode(parts)} parts={() => parts} resultFor={() => undefined} streaming={true} />
  ))

  await expect.element(page.getByText('Editing the page')).toBeVisible()
  expect(document.body.textContent).toContain(location.host)
})
