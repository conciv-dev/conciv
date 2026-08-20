import 'virtual:uno.css'
import {expect, it} from 'vitest'
import {page} from 'vitest/browser'
import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'
import {INERT_TOOL_CTX, ToolTraceRow} from '@conciv/ui-kit-chat/tools'
import {builtinToolCards} from '../src/styled/tools/builtin-tool-cards.js'
import {mountView} from './mount-view.js'

function call(name: string, input: Record<string, unknown>, state: ToolCallPart['state'] = 'complete'): ToolCallPart {
  return {type: 'tool-call', id: 'f1', name, arguments: JSON.stringify(input), input, state}
}

function result(content: string, state: ToolResultPart['state'] = 'complete'): ToolResultPart {
  return {type: 'tool-result', toolCallId: 'f1', content, state}
}

function row(part: ToolCallPart, toolResult?: ToolResultPart) {
  return <ToolTraceRow part={part} result={toolResult} ctx={INERT_TOOL_CTX} tools={() => builtinToolCards} />
}

const BUILD_LOG = ['[build] step 19 finished', '[build] step 20 finished'].join('\n')

const ANSI_LOG = '\u001b[32mPASS\u001b[0m src/app.test.ts'

const PATCH = [
  '*** Begin Patch',
  '*** Update File: src/store/turn-rollup.ts',
  '@@',
  '-const previous = 1',
  '+const next = 2',
  '+const extra = 3',
  '*** End Patch',
].join('\n')

it('projects a successful bash call as a passing bash row carrying its exit code', async () => {
  mountView(() => row(call('Bash', {command: 'pnpm test'}), result(JSON.stringify({stdout: 'ok', exitCode: 0}))))

  await expect.element(page.getByRole('img', {name: 'succeeded'})).toBeVisible()
  await expect.element(page.getByText('bash')).toBeVisible()
  await expect.element(page.getByText('pnpm test')).toBeVisible()
  await expect.element(page.getByText('exit 0')).toBeVisible()
})

it('projects a nonzero bash exit as a failing row and frames the output as an error', async () => {
  mountView(() =>
    row(call('Bash', {command: 'pnpm test'}), result(JSON.stringify({stderr: '1 test failed', exitCode: 1}))),
  )

  await expect.element(page.getByRole('img', {name: 'failed'})).toBeVisible()
  await expect.element(page.getByText('exit 1')).toBeVisible()
  await expect.element(page.getByRole('group', {name: 'Error output'})).toBeVisible()
  await expect.element(page.getByText('1 test failed')).toBeVisible()
})

it('projects an apply_patch call as an edit row with its added and removed counts', async () => {
  mountView(() => row(call('apply_patch', {patchText: PATCH}), result('applied')))

  await expect.element(page.getByText('edit')).toBeVisible()
  await expect.element(page.getByText('turn-rollup.ts')).toBeVisible()
  await expect.element(page.getByText('+2 −1')).toBeVisible()
})

it('projects a Write call as a write row and an Edit call as an edit row', async () => {
  mountView(() => (
    <>
      {row(call('Write', {file_path: '/repo/src/new-file.ts', content: 'a\nb\nc'}), result('written'))}
      {row(call('Edit', {file_path: '/repo/src/old.ts', old_string: 'a', new_string: 'b'}), result('edited'))}
    </>
  ))

  await expect.element(page.getByText('write')).toBeVisible()
  await expect.element(page.getByText('new-file.ts')).toBeVisible()
  await expect.element(page.getByText('+3 −0')).toBeVisible()
  await expect.element(page.getByText('old.ts')).toBeVisible()
  await expect.element(page.getByText('+1 −1')).toBeVisible()
})

it('projects a Read call as a read row with the line count it returned', async () => {
  mountView(() => row(call('Read', {file_path: '/repo/src/app.tsx'}), result('one\ntwo\nthree')))

  await expect.element(page.getByText('read')).toBeVisible()
  await expect.element(page.getByText('…/src/app.tsx')).toBeVisible()
  await expect.element(page.getByText('3 lines')).toBeVisible()
})

it('projects a Grep call as a search row over its pattern', async () => {
  mountView(() => row(call('Grep', {pattern: 'useChat'}), result('src/a.ts:1\nsrc/b.ts:4')))

  await expect.element(page.getByText('search')).toBeVisible()
  await expect.element(page.getByText('useChat')).toBeVisible()
})

it('projects a running tool call as a live row', async () => {
  mountView(() => row(call('Bash', {command: 'pnpm build'}, 'input-complete'), undefined))

  await expect.element(page.getByRole('img', {name: 'running'})).toBeVisible()
  await expect.element(page.getByText('pnpm build')).toBeVisible()
})

it('renders plain bash trace output through the code highlighter instead of as flat text', async () => {
  mountView(() => row(call('Bash', {command: 'pnpm build'}), result(JSON.stringify({stdout: BUILD_LOG, exitCode: 0}))))

  await expect.element(page.getByRole('group', {name: 'Output'})).toBeVisible()
  await expect.element(page.getByText('[build] step 20 finished')).toBeVisible()
  expect(document.querySelector('diffs-container')).not.toBeNull()
})

it('renders ansi bash trace output through the ansi grammar so escape codes never leak as text', async () => {
  mountView(() => row(call('Bash', {command: 'pnpm test'}), result(JSON.stringify({stdout: ANSI_LOG, exitCode: 0}))))

  await expect.element(page.getByRole('group', {name: 'Output'})).toBeVisible()
  await expect.element(page.getByText('PASS src/app.test.ts')).toBeVisible()
})
