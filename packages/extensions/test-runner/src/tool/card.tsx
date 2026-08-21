import {createEffect, createMemo, For, onCleanup, Show, type JSX} from 'solid-js'
import {createStore} from 'solid-js/store'
import {StatusDot, type StatusDotTone} from '@conciv/ui-kit-system'
import ExternalLink from 'lucide-solid/icons/external-link'
import Sparkles from 'lucide-solid/icons/sparkles'
import {
  ActionButton,
  ActionRow,
  CardShell,
  Chip,
  CodeBlock,
  CollapsibleSection,
  ErrorBlock,
  StatusVisual,
  cardHeader,
  formatDuration,
  resultText,
} from '@conciv/ui-kit-chat/tools'
import {groupBy} from 'es-toolkit'
import type {ToolCardProps, ToolViewCtx} from '@conciv/protocol/tool-view-types'
import {getExtensionApi, makeExtRpcClient} from '@conciv/extension'
import {TEST_RUNNER_NAME} from '../shared/meta.js'
import type {TestRunnerRouter} from '../server.js'
import {
  countStates,
  TestRunResultSchema,
  type TestRunResult,
  type Summary,
  type TestError,
  type TestRow as TestRowResult,
  type TestState,
  type TestEvent,
} from '../shared/events.js'

type RowState = TestState | 'running'
type Row = {id: string; name: string; state: RowState; durationMs: number; error?: TestError}
type FileGroup = {file: string; tests: Row[]}
type RunView = {groups: FileGroup[]; summary: Summary; running: boolean}
type LiveRun = {tests: TestRowResult[]; finalSummary: Summary | null; running: boolean}

const COUNT_FORMAT = new Intl.NumberFormat()
const TEST_PLURAL = new Intl.PluralRules('en')

const SUMMARY_ROW = 'flex flex-wrap items-center gap-1.5'
const RUN_LABEL =
  'inline-flex items-center gap-1.25 text-[length:var(--chat-text-xs)] text-chat-text-3 [font-family:var(--chat-mono)]'
const FILE_NAME =
  'min-w-0 truncate font-semibold [font-family:var(--chat-mono)] text-[length:var(--chat-text-sm)] text-chat-text'
const ROW = 'flex min-w-0 items-center gap-2 py-1'
const ROW_NAME =
  'min-w-0 flex-1 truncate text-[length:var(--chat-text-sm)] [font-family:var(--chat-mono)] text-chat-text-2'
const ROW_DURATION =
  'shrink-0 tabular-nums text-[length:var(--chat-text-xs)] [font-family:var(--chat-mono)] text-chat-text-3'
const FAILURE_BODY = 'flex flex-col gap-2 pt-1'
const SECTIONS = 'flex flex-col gap-0.5'

const ROW_TONE: Record<RowState, StatusDotTone> = {
  pass: 'success',
  fail: 'danger',
  skip: 'idle',
  running: 'accent',
}

function relName(file: string): string {
  return file.split('/').slice(-2).join('/')
}

function stateLabel(state: RowState): string {
  if (state === 'pass') return 'passed'
  if (state === 'fail') return 'failed'
  if (state === 'skip') return 'skipped'
  return 'running'
}

function openLabel(error: TestError): string {
  const base = relName(error.file)
  return error.line ? `${base}:${error.line}` : base
}

function fixMessage(error: TestError): string {
  return `The test "${error.name}" in ${relName(error.file)} is failing:\n${error.message}\nPlease look into it.`
}

function countLabel(count: number, verb: string): string {
  return `${COUNT_FORMAT.format(count)} ${verb}`
}

function failureCountLabel(count: number): string {
  return `${COUNT_FORMAT.format(count)} failing ${TEST_PLURAL.select(count) === 'one' ? 'test' : 'tests'}`
}

function summarySentence(summary: Summary, running: boolean): string {
  const counts = [
    countLabel(summary.passed, 'passed'),
    countLabel(summary.failed, 'failed'),
    countLabel(summary.skipped, 'skipped'),
  ].join(', ')
  return running ? `Test run in progress: ${counts}` : `Test run finished: ${counts}`
}

function groupByFile(tests: ReadonlyArray<Row & {file: string}>): FileGroup[] {
  const grouped = groupBy(tests, (test) => test.file)
  return Object.entries(grouped).map(([file, rows]) => ({
    file,
    tests: rows.map((test) => ({
      id: test.id,
      name: test.name,
      state: test.state,
      durationMs: test.durationMs,
      error: test.error,
    })),
  }))
}

function upsertTest(tests: ReadonlyArray<TestRowResult>, row: TestRowResult): TestRowResult[] {
  const index = tests.findIndex((test) => test.id === row.id)
  if (index < 0) return [...tests, row]
  return tests.with(index, row)
}

function liveSummary(tests: ReadonlyArray<TestRowResult>): Summary {
  return {
    ...countStates(tests),
    durationMs: tests.reduce((total, test) => total + test.durationMs, 0),
  }
}

function failureCount(group: FileGroup): number {
  return group.tests.filter((test) => test.state === 'fail').length
}

function stackDetail(error: TestError): string | undefined {
  const stack = error.stack.trim()
  return stack && stack !== error.message.trim() ? stack : undefined
}

function durationLabel(ms: number): string | undefined {
  if (!Number.isFinite(ms) || ms <= 0) return undefined
  return ms < 1000 ? `${Math.round(ms)}ms` : (formatDuration(ms) ?? `${Math.round(ms)}ms`)
}

function TestRow(props: {state: RowState; name: string; durationMs: number}): JSX.Element {
  const duration = () => durationLabel(props.durationMs)
  return (
    <>
      <StatusDot tone={ROW_TONE[props.state]} pulse={props.state === 'running'} />
      <span class="sr-only">{stateLabel(props.state)}: </span>
      <span class={ROW_NAME}>{props.name}</span>
      <Show when={duration()}>{(value) => <span class={ROW_DURATION}>{value()}</span>}</Show>
    </>
  )
}

function TestFailure(props: {error: TestError; ctx: ToolViewCtx}): JSX.Element {
  const openEditor = getExtensionApi(TEST_RUNNER_NAME).useOpenEditor()
  const stack = () => stackDetail(props.error)
  return (
    <div class={FAILURE_BODY}>
      <ErrorBlock label={openLabel(props.error)} message={props.error.message} />
      <Show when={stack()}>
        {(detail) => (
          <CodeBlock file={{name: relName(props.error.file), lang: 'text', contents: detail()}} maxHeight="log" />
        )}
      </Show>
      <ActionRow>
        <ActionButton onClick={() => openEditor(props.error.file, props.error.line)}>
          <ExternalLink size={12} aria-hidden="true" />
          Open {openLabel(props.error)}
        </ActionButton>
        <ActionButton intent="allow" onClick={() => props.ctx.sendMessage(fixMessage(props.error))}>
          <Sparkles size={12} aria-hidden="true" />
          Fix this
        </ActionButton>
      </ActionRow>
    </div>
  )
}

function RunSummary(props: {summary: Summary; running: boolean}): JSX.Element {
  return (
    <div class={SUMMARY_ROW} role="status" aria-live="polite">
      <span class="sr-only">{summarySentence(props.summary, props.running)}</span>
      <div class={SUMMARY_ROW} aria-hidden="true">
        <Show when={props.running}>
          <span class={RUN_LABEL}>
            <StatusVisual status="running" form="dot" />
            running
          </span>
        </Show>
        <Chip kind="pill" tone="success" value={countLabel(props.summary.passed, 'passed')} />
        <Show when={props.summary.failed > 0}>
          <Chip kind="pill" tone="danger" value={countLabel(props.summary.failed, 'failed')} />
        </Show>
        <Show when={props.summary.skipped > 0}>
          <Chip kind="pill" value={countLabel(props.summary.skipped, 'skipped')} />
        </Show>
      </div>
    </div>
  )
}

function FileHeader(props: {group: FileGroup}): JSX.Element {
  const failures = () => failureCount(props.group)
  return (
    <>
      <span class={FILE_NAME}>{relName(props.group.file)}</span>
      <Show when={failures() > 0}>
        <Chip kind="pill" tone="danger" value={failureCountLabel(failures())} />
      </Show>
    </>
  )
}

export function TestResults(props: {result: TestRunResult | null; ctx: ToolViewCtx}): JSX.Element {
  const [live, setLive] = createStore<LiveRun>({tests: [], finalSummary: null, running: false})
  const [disclosure, setDisclosure] = createStore<{closedFiles: string[]; openTest: string | null}>({
    closedFiles: [],
    openTest: null,
  })

  const completed = createMemo<RunView | null>(() => {
    const result = props.result
    if (!result) return null
    return {groups: groupByFile(result.tests.map((test) => ({...test}))), summary: result.summary, running: false}
  })
  const streamed = createMemo<RunView>(() => ({
    groups: groupByFile(live.tests),
    summary: live.finalSummary ?? liveSummary(live.tests),
    running: live.running,
  }))
  const view = (): RunView => completed() ?? streamed()

  createEffect(() => {
    if (completed()) return
    const abort = new AbortController()
    setLive({tests: [], finalSummary: null, running: true})
    const applyLive = (event: TestEvent) => {
      if (event.type === 'run-start') {
        setLive({tests: [], finalSummary: null, running: true})
        return
      }
      if (event.type === 'test') {
        const row = {
          id: event.id,
          file: event.file,
          name: event.name,
          state: event.state,
          durationMs: event.durationMs,
          error: event.error,
        }
        setLive('tests', (tests) => upsertTest(tests, row))
        return
      }
      if (event.type === 'run-end') {
        setLive({tests: event.tests, finalSummary: event.summary, running: false})
        abort.abort()
      }
    }
    void streamInto(props.ctx.apiBase, abort.signal, applyLive)
    onCleanup(() => abort.abort())
  })

  const setFileOpen = (file: string, open: boolean) =>
    setDisclosure('closedFiles', (files) => (open ? files.filter((name) => name !== file) : [...files, file]))

  return (
    <div class="flex flex-col gap-2">
      <RunSummary summary={view().summary} running={view().running} />
      <div class={SECTIONS}>
        <For each={view().groups}>
          {(group) => (
            <CollapsibleSection
              header={<FileHeader group={group} />}
              open={!disclosure.closedFiles.includes(group.file)}
              onOpenChange={(open) => setFileOpen(group.file, open)}
            >
              <For each={group.tests}>
                {(test) => {
                  const key = test.id
                  return (
                    <Show
                      when={test.error}
                      fallback={
                        <div class={ROW}>
                          <TestRow state={test.state} name={test.name} durationMs={test.durationMs} />
                        </div>
                      }
                    >
                      {(error) => (
                        <CollapsibleSection
                          header={<TestRow state={test.state} name={test.name} durationMs={test.durationMs} />}
                          open={disclosure.openTest === key}
                          onOpenChange={(open) => setDisclosure('openTest', open ? key : null)}
                        >
                          <TestFailure error={error()} ctx={props.ctx} />
                        </CollapsibleSection>
                      )}
                    </Show>
                  )
                }}
              </For>
            </CollapsibleSection>
          )}
        </For>
      </div>
    </div>
  )
}

async function streamInto(apiBase: string, signal: AbortSignal, apply: (event: TestEvent) => void): Promise<void> {
  try {
    const client = makeExtRpcClient<TestRunnerRouter>(apiBase, 'test-runner')
    const stream = await client.stream(undefined, {signal, context: {retry: Number.POSITIVE_INFINITY}})
    for await (const event of stream) apply(event)
  } catch {}
}

function parseRunResult(result: ToolCardProps['result']): TestRunResult | null {
  const text = resultText(result)
  if (!text) return null
  try {
    const parsed = TestRunResultSchema.safeParse(JSON.parse(text))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

function runStatus(result: TestRunResult | null): 'error' | undefined {
  return result && result.summary.failed > 0 ? 'error' : undefined
}

export function TestCard(props: ToolCardProps): JSX.Element {
  const {meta, title} = cardHeader(props)
  const runResult = () => parseRunResult(props.result)
  return (
    <CardShell
      meta={meta()}
      title={title()}
      part={props.part}
      result={props.result}
      durationMs={props.durationMs}
      status={runStatus(runResult())}
      defaultOpen
    >
      <TestResults result={runResult()} ctx={props.ctx} />
    </CardShell>
  )
}
