import {createUniqueId, For, Show, type JSX} from 'solid-js'
import type {IconName, Ui} from '@conciv/plugin/experimental'
import type {Summary, TestError, TestRow} from '../shared/events.js'
import type {RunPhase, RunState} from './run-state.js'

type FileGroup = {readonly file: string; readonly tests: readonly TestRow[]}

export type TestsPanelProps = {
  readonly ui: Ui
  readonly run: RunState
  readonly directory: string
  readonly canOpen: boolean
  readonly onOpen: (error: TestError) => void
  readonly onFix: (error: TestError) => void
}

const COUNT = new Intl.NumberFormat()
const SECONDS = new Intl.NumberFormat(undefined, {style: 'unit', unit: 'second', maximumFractionDigits: 1})
const MILLISECONDS = new Intl.NumberFormat(undefined, {style: 'unit', unit: 'millisecond', maximumFractionDigits: 0})
const PLURAL = new Intl.PluralRules('en')

const STATE_ICON: Record<TestRow['state'], IconName> = {
  pass: 'circle-check-big',
  fail: 'circle-x',
  skip: 'circle-dashed',
}
const STATE_TONE: Record<TestRow['state'], string> = {
  pass: 'text-chat-success',
  fail: 'text-chat-danger',
  skip: 'text-chat-text-3',
}
const STATE_LABEL: Record<TestRow['state'], string> = {pass: 'passed', fail: 'failed', skip: 'skipped'}

export function relativePath(file: string, directory: string): string {
  const prefix = directory.endsWith('/') ? directory : `${directory}/`
  return directory && file.startsWith(prefix) ? file.slice(prefix.length) : file
}

export function failureLocation(error: TestError, directory: string): string {
  const path = relativePath(error.file, directory)
  return error.line === undefined ? path : `${path}:${error.line}`
}

export function fixPrompt(error: TestError, directory: string): string {
  return `The test "${error.name}" in ${relativePath(error.file, directory)} is failing:\n${error.message}\nPlease look into it.`
}

function counts(summary: Summary): string {
  return `${COUNT.format(summary.passed)} passed, ${COUNT.format(summary.failed)} failed, ${COUNT.format(summary.skipped)} skipped`
}

function statusSentence(phase: RunPhase, summary: Summary): string {
  if (phase === 'running') return `Running tests: ${counts(summary)}`
  if (phase === 'done') return `Test run finished: ${counts(summary)}`
  if (phase === 'unavailable') return 'The test runner is unavailable'
  return 'No test run yet'
}

function duration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return ''
  return ms < 1000 ? MILLISECONDS.format(Math.round(ms)) : SECONDS.format(ms / 1000)
}

function failingLabel(count: number): string {
  return `${COUNT.format(count)} failing ${PLURAL.select(count) === 'one' ? 'test' : 'tests'}`
}

function groupByFile(tests: readonly TestRow[]): FileGroup[] {
  return Object.entries(Object.groupBy(tests, (test) => test.file)).map(([file, rows]) => ({file, tests: rows ?? []}))
}

function TestLine(props: {ui: Ui; test: TestRow}): JSX.Element {
  return (
    <li class="py-1 flex gap-2 min-w-0 items-center">
      <span class={`flex shrink-0 ${STATE_TONE[props.test.state]}`}>
        <props.ui.Icon name={STATE_ICON[props.test.state]} size="small" />
      </span>
      <span class="sr-only">{STATE_LABEL[props.test.state]}: </span>
      <span class="text-chat-sm text-chat-text-2 font-chat-mono flex-1 min-w-0 truncate">{props.test.name}</span>
      <span class="text-chat-xs text-chat-text-3 font-chat-mono shrink-0 tabular-nums">
        {duration(props.test.durationMs)}
      </span>
    </li>
  )
}

function FileRow(props: {ui: Ui; group: FileGroup; directory: string; running: boolean}): JSX.Element {
  const failed = () => props.group.tests.filter((test) => test.state === 'fail').length
  const icon = (): IconName => {
    if (failed() > 0) return 'circle-x'
    return props.running ? 'loader-circle' : 'circle-check-big'
  }
  const tone = () => {
    if (failed() > 0) return 'text-chat-danger'
    return props.running ? 'text-chat-accent' : 'text-chat-success'
  }
  return (
    <li class="flex flex-col gap-1">
      <div class="flex gap-2 min-w-0 items-center">
        <span class={`flex shrink-0 ${tone()}`}>
          <props.ui.Icon name={icon()} size="small" />
        </span>
        <span class="text-chat-sm text-chat-text font-chat-mono font-semibold flex-1 min-w-0 truncate">
          {relativePath(props.group.file, props.directory)}
        </span>
        <Show when={failed() > 0}>
          <span class="text-chat-xs text-chat-danger px-2 py-0.5 rounded-chat-pill bg-chat-danger-14 shrink-0">
            {failingLabel(failed())}
          </span>
        </Show>
      </div>
      <ul class="ps-6 flex flex-col">
        <For each={props.group.tests}>{(test) => <TestLine ui={props.ui} test={test} />}</For>
      </ul>
    </li>
  )
}

function FailureCard(props: {
  ui: Ui
  error: TestError
  directory: string
  canOpen: boolean
  onOpen: (error: TestError) => void
  onFix: (error: TestError) => void
}): JSX.Element {
  const location = () => failureLocation(props.error, props.directory)
  return (
    <li class="p-3 border border-chat-danger-line rounded-chat-surface-md bg-chat-danger-10 flex flex-col gap-2">
      <div class="flex gap-2 min-w-0 items-center">
        <span class="text-chat-danger flex shrink-0">
          <props.ui.Icon name="circle-x" size="small" />
        </span>
        <span class="text-chat-sm text-chat-text font-semibold flex-1 min-w-0 truncate">{props.error.name}</span>
      </div>
      <span class="text-chat-xs text-chat-text-3 font-chat-mono truncate">{location()}</span>
      <p class="text-chat-xs text-chat-text-2 font-chat-mono whitespace-pre-wrap break-words">{props.error.message}</p>
      <div class="flex flex-wrap gap-2">
        <Show when={props.canOpen}>
          <props.ui.Button
            size="small"
            variant="neutral"
            icon="external-link"
            onClick={() => props.onOpen(props.error)}
          >
            {`Open ${location()}`}
          </props.ui.Button>
        </Show>
        <props.ui.Button size="small" variant="contrast" icon="sparkles" onClick={() => props.onFix(props.error)}>
          Fix this
        </props.ui.Button>
      </div>
    </li>
  )
}

export function TestsPanel(props: TestsPanelProps): JSX.Element {
  const running = () => props.run.phase === 'running'
  const failures = () => props.run.tests.flatMap((test) => (test.error ? [test.error] : []))
  const groups = () => groupByFile(props.run.tests)
  const failingHeading = createUniqueId()
  const filesHeading = createUniqueId()
  return (
    <div class="p-3 flex flex-1 flex-col gap-4 min-h-0 overflow-y-auto">
      <div class="flex gap-2 min-w-0 items-center">
        <Show when={running()}>
          <span class="text-chat-accent flex shrink-0">
            <props.ui.Loader size="small" />
          </span>
        </Show>
        <p role="status" aria-live="polite" class="text-chat-sm text-chat-text-2 flex-1 min-w-0">
          {statusSentence(props.run.phase, props.run.summary)}
        </p>
        <span class="text-chat-xs text-chat-text-3 font-chat-mono shrink-0 tabular-nums">
          {props.run.phase === 'done' ? duration(props.run.summary.durationMs) : ''}
        </span>
      </div>
      <Show when={props.run.phase === 'idle'}>
        <p class="text-chat-sm text-chat-text-3">
          Ask the agent to run the tests; the results show here as they come in.
        </p>
      </Show>
      <Show when={props.run.phase === 'unavailable'}>
        <div class="p-3 border border-chat-danger-line rounded-chat-surface-md bg-chat-danger-10 flex flex-col gap-2">
          <div class="text-chat-sm text-chat-text font-semibold flex gap-2 items-center">
            <span class="text-chat-danger flex shrink-0">
              <props.ui.Icon name="triangle-alert" size="small" />
            </span>
            The project's test runner could not start
          </div>
          <p class="text-chat-xs text-chat-text-2 font-chat-mono whitespace-pre-wrap break-words">{props.run.reason}</p>
        </div>
      </Show>
      <Show when={failures().length > 0}>
        <section aria-labelledby={failingHeading} class="flex flex-col gap-2">
          <h3 id={failingHeading} class="text-chat-sm text-chat-text font-semibold">
            {failingLabel(failures().length)}
          </h3>
          <ul class="flex flex-col gap-2">
            <For each={failures()}>
              {(error) => (
                <FailureCard
                  ui={props.ui}
                  error={error}
                  directory={props.directory}
                  canOpen={props.canOpen}
                  onOpen={props.onOpen}
                  onFix={props.onFix}
                />
              )}
            </For>
          </ul>
        </section>
      </Show>
      <Show when={groups().length > 0}>
        <section aria-labelledby={filesHeading} class="flex flex-col gap-2">
          <h3 id={filesHeading} class="text-chat-sm text-chat-text font-semibold">
            Files
          </h3>
          <ul class="flex flex-col gap-3">
            <For each={groups()}>
              {(group) => <FileRow ui={props.ui} group={group} directory={props.directory} running={running()} />}
            </For>
          </ul>
        </section>
      </Show>
    </div>
  )
}
