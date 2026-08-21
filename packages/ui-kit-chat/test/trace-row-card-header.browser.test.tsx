import 'virtual:uno.css'
import {expect, it} from 'vitest'
import {page} from 'vitest/browser'
import {createSignal, type JSX} from 'solid-js'
import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'
import type {ToolCardEntry, ToolCardProps, ToolViewCtx} from '@conciv/protocol/tool-view-types'
import {ToolTraceRow} from '../src/tools/styled/tool-call-card.js'
import {CardShell} from '../src/tools/styled/card-shell.js'
import {mountView} from './mount-view.js'

const ctx: ToolViewCtx = {
  apiBase: '',
  harnessId: 'test',
  sendMessage: () => {},
  catalog: {loaded: () => true, meta: () => undefined},
  addResult: () => {},
}

function call(name: string, input: Record<string, unknown>): ToolCallPart {
  return {type: 'tool-call', id: 'c1', name, arguments: JSON.stringify(input), input, state: 'complete'}
}

function failedResult(): ToolResultPart {
  return {type: 'tool-result', toolCallId: 'c1', content: 'the query client was not found', state: 'complete'}
}

function headerCard(props: ToolCardProps): JSX.Element {
  return (
    <CardShell
      meta={undefined}
      title="Read the query cache"
      metaBadge="2 queries"
      status="error"
      part={props.part}
      result={props.result}
    >
      <p>the query client was not found</p>
    </CardShell>
  )
}

const headerTool: ToolCardEntry = {names: ['tanstack_query_cache'], render: headerCard}

it('projects the embedded card header onto the trace row, marking an in-band failure as failed', async () => {
  mountView(() => (
    <ToolTraceRow
      part={call('tanstack_query_cache', {scope: 'all'})}
      result={failedResult()}
      ctx={ctx}
      tools={() => [headerTool]}
      last
    />
  ))

  await expect.element(page.getByText('Read the query cache')).toBeVisible()
  await expect.element(page.getByText('2 queries')).toBeVisible()
  await expect.element(page.getByRole('img', {name: 'failed'})).toBeVisible()
})

function subtitleCard(props: ToolCardProps): JSX.Element {
  return (
    <CardShell meta={undefined} title="Read the router state" subtitle="/about" part={props.part} result={props.result}>
      <p>two matched routes</p>
    </CardShell>
  )
}

const subtitleTool: ToolCardEntry = {names: ['tanstack_route_tree'], render: subtitleCard}

it('carries the card title on the row line while the subtitle stays in the body', async () => {
  mountView(() => (
    <ToolTraceRow
      part={call('tanstack_route_tree', {scope: 'all'})}
      result={failedResult()}
      ctx={ctx}
      tools={() => [subtitleTool]}
      last
    />
  ))

  await expect.element(page.getByText('two matched routes')).toBeVisible()
  await expect.element(page.getByRole('button', {name: /Read the router state/})).toBeVisible()
  await expect.element(page.getByText('/about')).toBeVisible()
  expect(page.getByText('/about').elements()).toHaveLength(1)
  expect(page.getByRole('button', {name: /\/about/}).query()).toBeNull()
})

function streamingCard(props: ToolCardProps): JSX.Element {
  const done = () => props.result !== undefined
  return (
    <CardShell
      meta={undefined}
      title={done() ? 'Ran the suite' : 'Running the suite'}
      metaBadge={done() ? '3 passed' : undefined}
      part={props.part}
      result={props.result}
    >
      <p>suite body</p>
    </CardShell>
  )
}

const streamingTool: ToolCardEntry = {names: ['test_runner_run'], render: streamingCard}

it('tracks header changes as the card result streams in', async () => {
  const [result, setResult] = createSignal<ToolResultPart>()
  mountView(() => (
    <ToolTraceRow
      part={call('test_runner_run', {filter: 'unit'})}
      result={result()}
      ctx={ctx}
      tools={() => [streamingTool]}
      last
    />
  ))

  await expect.element(page.getByText('Running the suite')).toBeVisible()

  setResult({type: 'tool-result', toolCallId: 'c1', content: '3 passed', state: 'complete'})

  await expect.element(page.getByText('Ran the suite')).toBeVisible()
  await expect.element(page.getByText('3 passed').first()).toBeVisible()
})

function commandCard(props: ToolCardProps): JSX.Element {
  return (
    <CardShell meta={undefined} title="Run a command" metaBadge="edits page" part={props.part} result={props.result}>
      <p>the command output</p>
    </CardShell>
  )
}

const commandTool: ToolCardEntry = {names: ['bash'], render: commandCard}

it('keeps a named tool argument as the target and takes only the badge from the header', async () => {
  mountView(() => (
    <ToolTraceRow
      part={call('bash', {command: 'rm -rf tmp'})}
      result={failedResult()}
      ctx={ctx}
      tools={() => [commandTool]}
      last
    />
  ))

  await expect.element(page.getByText('the command output')).toBeVisible()
  await expect.element(page.getByText('rm -rf tmp')).toBeVisible()
  await expect.element(page.getByText('edits page')).toBeVisible()
})

const declaredCtx: ToolViewCtx = {
  ...ctx,
  catalog: {
    loaded: () => true,
    meta: () => ({summary: 'read the live query and mutation cache off the page', mutating: false, mirrors: false}),
  },
}

it('shows a declared tool summary once, on the row, when the generic card body would repeat it', async () => {
  mountView(() => (
    <ToolTraceRow
      part={call('tanstack_query_cache', {scope: 'all'})}
      result={failedResult()}
      ctx={declaredCtx}
      tools={() => []}
      last
    />
  ))

  await expect.element(page.getByText('read the live query and mutation cache off the page')).toBeVisible()
  expect(page.getByText('read the live query and mutation cache off the page').elements()).toHaveLength(1)
})

const headerlessTool: ToolCardEntry = {
  names: ['tanstack_query_cache'],
  render: () => <p>a card without any header</p>,
}

it('falls back to the generic projection for a card that publishes no header', async () => {
  mountView(() => (
    <ToolTraceRow
      part={call('tanstack_query_cache', {scope: 'all'})}
      result={failedResult()}
      ctx={ctx}
      tools={() => [headerlessTool]}
      last
    />
  ))

  await expect.element(page.getByText('a card without any header')).toBeVisible()
  await expect.element(page.getByText('all')).toBeVisible()
})
