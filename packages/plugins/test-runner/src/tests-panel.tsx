import {createUniqueId, For, Show, type JSX} from 'solid-js'
import type {IconName, Ui} from '@conciv/frontend-plugin-api'
import type {Summary, TestError, TestRow} from './events.js'
import {
  counts,
  duration,
  failingLabel,
  failedCount,
  failureLocation,
  fileGroup,
  relativePath,
  STATE_LABEL,
  testFiles,
  type FileGroup,
} from './view.js'
import {testRunnerErrors} from './errors/errors.js'
import {selectEndedFiles, selectSummary, selectTests, type RunView, type RunViewStatus} from './run-state.js'

type TestsPanelProps = {
  readonly ui: Ui
  readonly run: RunView
  readonly directory: string
  readonly canOpen: boolean
  readonly onOpen: (error: TestError) => void
  readonly onFix: (error: TestError) => void
}

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
function statusSentence(status: RunViewStatus, summary: Summary): string {
  if (status === 'running') return `Running tests: ${counts(summary)}`
  if (status === 'done') return `Test run finished: ${counts(summary)}`
  if (status === 'unavailable') return 'The test runner is unavailable'
  return 'No test run yet'
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
  const failed = () => failedCount(props.group)
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
          <span class="sr-only">{props.running ? 'Running' : 'Finished'}: </span>
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
  const location = () => failureLocation(props.error, relativePath(props.error.file, props.directory))
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
  const running = () => props.run.status === 'running'
  const failures = () => selectTests(props.run).flatMap((test) => (test.error ? [test.error] : []))
  const files = () => testFiles(selectTests(props.run))
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
          {statusSentence(props.run.status, selectSummary(props.run))}
        </p>
        <span class="text-chat-xs text-chat-text-3 font-chat-mono shrink-0 tabular-nums">
          {props.run.status === 'done' ? duration(selectSummary(props.run).durationMs) : ''}
        </span>
      </div>
      <Show when={props.run.status === 'idle'}>
        <p class="text-chat-sm text-chat-text-3">
          Ask the agent to run the tests; the results show here as they come in.
        </p>
      </Show>
      <Show when={props.run.status === 'unavailable' ? props.run : undefined}>
        {(view) => (
          <div class="p-3 border border-chat-danger-line rounded-chat-surface-md bg-chat-danger-10 flex flex-col gap-2">
            <div class="text-chat-sm text-chat-text font-semibold flex gap-2 items-center">
              <span class="text-chat-danger flex shrink-0">
                <props.ui.Icon name="triangle-alert" size="small" />
              </span>
              The project's test runner could not start
            </div>
            <p class="text-chat-xs text-chat-text-2 font-chat-mono whitespace-pre-wrap break-words">{view().reason}</p>
            <p class="text-chat-xs text-chat-text-2">{testRunnerErrors.RUNNER_UNAVAILABLE.fix}</p>
          </div>
        )}
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
      <Show when={files().length > 0}>
        <section aria-labelledby={filesHeading} class="flex flex-col gap-2">
          <h3 id={filesHeading} class="text-chat-sm text-chat-text font-semibold">
            Files
          </h3>
          <ul class="flex flex-col gap-3">
            <For each={files()}>
              {(file) => (
                <FileRow
                  ui={props.ui}
                  group={fileGroup(selectTests(props.run), file)}
                  directory={props.directory}
                  running={running() && !selectEndedFiles(props.run).includes(file)}
                />
              )}
            </For>
          </ul>
        </section>
      </Show>
    </div>
  )
}
