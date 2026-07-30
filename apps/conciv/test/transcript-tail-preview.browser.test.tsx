import {afterEach, expect, test} from 'vitest'
import {page} from 'vitest/browser'
import {render} from 'solid-js/web'
import {createSignal} from 'solid-js'
import type {TranscriptTailEntry} from '@conciv/contract'
import {
  ASSISTANT_MARK,
  PREVIEW_CHARS,
  PROMPT_MARK,
  RESULT_MARK,
  THINKING_MARK,
  TOOL_MARK,
  TranscriptTailPreview,
} from '../src/composer/transcript-tail-preview.js'

const disposers: (() => void)[] = []
afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose()
})

const tail: TranscriptTailEntry[] = [
  {role: 'user', text: 'rename the widget package'},
  {role: 'assistant', text: 'Looking at the manifests now.'},
  {role: 'tool', text: '', toolName: 'Read', toolResult: 'package.json read'},
]

function mount(entries: TranscriptTailEntry[]): {working: (next: boolean) => void} {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const [working, setWorking] = createSignal(false)
  const dispose = render(() => <TranscriptTailPreview tail={entries} working={working()} />, host)
  disposers.push(() => {
    dispose()
    host.remove()
  })
  return {working: setWorking}
}

test('speaks the claude terminal vocabulary for every kind of line', async () => {
  mount(tail)

  await expect.element(page.getByText('rename the widget package')).toBeVisible()
  await expect.element(page.getByText('Looking at the manifests now.')).toBeVisible()
  await expect.element(page.getByText('Read', {exact: true})).toBeVisible()
  await expect.element(page.getByText('package.json read')).toBeVisible()
  for (const mark of [PROMPT_MARK, ASSISTANT_MARK, TOOL_MARK, RESULT_MARK]) {
    await expect.element(page.getByText(mark, {exact: true}).first()).toBeVisible()
  }
})

test('leaves the result line out when the tool call has no result yet', async () => {
  mount([{role: 'tool', text: '', toolName: 'Bash'}])

  await expect.element(page.getByText('Bash', {exact: true})).toBeVisible()
  expect(page.getByText(RESULT_MARK, {exact: true}).elements()).toHaveLength(0)
})

test('shows the thinking line only while the session works', async () => {
  const preview = mount(tail)
  expect(page.getByText(/Thinking/).elements()).toHaveLength(0)

  preview.working(true)

  await expect.element(page.getByText(`${THINKING_MARK}`, {exact: true})).toBeVisible()
  await expect.element(page.getByText('Thinking…')).toBeVisible()
})

test('keeps the prompt line under every preview', async () => {
  mount([])

  await expect.element(page.getByText(PROMPT_MARK, {exact: true})).toBeVisible()
})

test('cuts a long line down to an ellipsis instead of wrapping it', async () => {
  const long = 'x'.repeat(300)
  mount([{role: 'assistant', text: long}])

  const shown = `${'x'.repeat(PREVIEW_CHARS - 1)}…`
  await expect.element(page.getByText(shown, {exact: true})).toBeVisible()
})

test('folds a multi line message onto one line', async () => {
  mount([{role: 'user', text: 'first line\nsecond line'}])

  await expect.element(page.getByText('first line second line', {exact: true})).toBeVisible()
})
