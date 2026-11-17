import {createUniqueId, For, Show, type JSX} from 'solid-js'
import {Plugin, type Context, type Ui} from '@conciv/plugin/experimental'
import {ToolCall, type ToolCallProps} from '@conciv/plugin/experimental/builtin'
import {
  countLabel,
  counts,
  failedCount,
  failingLabel,
  failureLocation,
  fixPrompt,
  groupByFile,
  parseRunResult,
  pathTail,
  shortDuration,
  STATE_LABEL,
  type FileGroup,
  type TestError,
  type TestRow,
  type TestRunResult,
} from '@conciv/plugin-test-runner/view'

type Actions = {
  readonly ui: Ui
  readonly canOpen: boolean
  readonly onOpen: (error: TestError) => void
  readonly onFix: (error: TestError) => void
}

const DOT_TONE: Record<TestRow['state'], string> = {
  pass: 'bg-chat-success',
  fail: 'bg-chat-danger',
  skip: 'bg-chat-text-3',
}

const PILL_TONE = {
  success: 'text-chat-success border-chat-success/45',
  danger: 'text-chat-danger border-chat-danger-line',
  neutral: 'text-chat-text-2 border-chat-line-soft',
}

const PILL =
  'inline-flex shrink-0 items-center px-2 pt-1.25 pb-1 text-chat-xs leading-none font-chat-mono whitespace-nowrap rounded-chat-pill bg-chat-sunken border'
const SUMMARY =
  'w-full py-1 flex gap-1.5 items-center text-start text-chat-sm text-chat-text-2 cursor-pointer select-none list-none transition-colors duration-chat-fast ease-chat motion-reduce:transition-none hover:text-chat-text focus-ring [&::-webkit-details-marker]:hidden'
const CHEVRON =
  'text-chat-text-3 flex shrink-0 transition-transform duration-chat-fast ease-chat motion-reduce:transition-none -rotate-90'
const LEVEL = {
  file: {details: 'group/file min-w-0 w-full', chevron: `${CHEVRON} group-open/file:rotate-0`},
  test: {details: 'group/test min-w-0 w-full', chevron: `${CHEVRON} group-open/test:rotate-0`},
}

function Pill(props: {tone: keyof typeof PILL_TONE; children: string}): JSX.Element {
  return <span class={`${PILL}  ${PILL_TONE[props.tone]}`}>{props.children}</span>
}

function Disclosure(props: {
  ui: Ui
  level: keyof typeof LEVEL
  open?: boolean
  name?: string
  header: (labelId: string) => JSX.Element
  children: JSX.Element
}): JSX.Element {
  const labelId = createUniqueId()
  return (
    <details open={props.open} name={props.name} aria-labelledby={labelId} class={LEVEL[props.level].details}>
      <summary class={SUMMARY}>
        <span class="flex flex-1 gap-1.5 min-w-0 items-center">{props.header(labelId)}</span>
        <span class={LEVEL[props.level].chevron}>
          <props.ui.Icon name="chevron-down" size="small" />
        </span>
      </summary>
      <div class="text-chat-sm text-chat-text-2 pb-1.5 ps-4 pt-1">{props.children}</div>
    </details>
  )
}

function TestLine(props: {test: TestRow; labelId?: string}): JSX.Element {
  return (
    <>
      <span class={`rounded-chat-pill shrink-0 size-1.75 inline-block ${DOT_TONE[props.test.state]}`} />
      <span class="sr-only">{STATE_LABEL[props.test.state]}: </span>
      <span id={props.labelId} class="text-chat-sm text-chat-text-2 font-chat-mono flex-1 min-w-0 truncate">
        {props.test.name}
      </span>
      <Show when={shortDuration(props.test.durationMs)}>
        {(value) => <span class="text-chat-xs text-chat-text-3 font-chat-mono shrink-0 tabular-nums">{value()}</span>}
      </Show>
    </>
  )
}

function Failure(props: Actions & {error: TestError}): JSX.Element {
  const location = () => failureLocation(props.error, pathTail(props.error.file))
  const stack = () => {
    const trace = props.error.stack.trim()
    return trace && trace !== props.error.message.trim() ? trace : ''
  }
  return (
    <div class="pt-1 flex flex-col gap-2">
      <div class="flex flex-col gap-1.5 min-w-0">
        <p class="text-chat-micro text-chat-danger leading-none tracking-widest font-chat-mono uppercase">
          {location()}
        </p>
        <p class="text-chat-xs text-chat-danger leading-normal font-chat-mono whitespace-pre-wrap break-anywhere">
          {props.error.message}
        </p>
      </div>
      <Show when={stack()}>
        {(trace) => (
          <p class="text-chat-xs text-chat-text leading-normal font-chat-mono px-1.5 py-1 bg-chat-sunken max-h-80 whitespace-pre-wrap break-anywhere overflow-auto">
            {trace()}
          </p>
        )}
      </Show>
      <div class="flex flex-wrap gap-2 items-center">
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
    </div>
  )
}

function FileSection(props: Actions & {group: FileGroup; accordion: string}): JSX.Element {
  const failed = () => failedCount(props.group)
  return (
    <Disclosure
      ui={props.ui}
      level="file"
      open
      header={(labelId) => (
        <>
          <span id={labelId} class="text-chat-sm text-chat-text font-chat-mono font-semibold min-w-0 truncate">
            {pathTail(props.group.file)}
          </span>
          <Show when={failed() > 0}>
            <Pill tone="danger">{failingLabel(failed())}</Pill>
          </Show>
        </>
      )}
    >
      <For each={props.group.tests}>
        {(test) => (
          <Show
            when={test.error}
            fallback={
              <div class="py-1 flex gap-2 min-w-0 items-center">
                <TestLine test={test} />
              </div>
            }
          >
            {(error) => (
              <Disclosure
                ui={props.ui}
                level="test"
                name={props.accordion}
                header={(labelId) => <TestLine test={test} labelId={labelId} />}
              >
                <Failure {...props} error={error()} />
              </Disclosure>
            )}
          </Show>
        )}
      </For>
    </Disclosure>
  )
}

function RunCard(props: Actions & {result: TestRunResult}): JSX.Element {
  const summary = () => props.result.summary
  const accordion = createUniqueId()
  return (
    <div class="flex flex-col gap-2">
      <div class="flex flex-wrap gap-1.5 items-center" role="status" aria-live="polite">
        <span class="sr-only">{`Test run finished: ${counts(summary())}`}</span>
        <div class="flex flex-wrap gap-1.5 items-center" aria-hidden="true">
          <Pill tone="success">{countLabel(summary().passed, 'passed')}</Pill>
          <Show when={summary().failed > 0}>
            <Pill tone="danger">{countLabel(summary().failed, 'failed')}</Pill>
          </Show>
          <Show when={summary().skipped > 0}>
            <Pill tone="neutral">{countLabel(summary().skipped, 'skipped')}</Pill>
          </Show>
        </div>
      </div>
      <div class="flex flex-col gap-0.5">
        <For each={groupByFile(props.result.tests)}>
          {(group) => <FileSection {...props} group={group} accordion={accordion} />}
        </For>
      </div>
    </div>
  )
}

function openFailure(ctx: Context, error: TestError): void {
  const desktop = ctx.desktop
  if (!desktop) return
  const position = error.line === undefined ? undefined : {line: error.line}
  desktop.launch(error.file, position).catch((cause: unknown) => {
    console.error('[test-runner] the failing test did not open', cause)
    ctx.toast.show({title: 'The test file could not open in your editor', variant: 'error'})
  })
}

function renderRun(ctx: Context, call: ToolCallProps): JSX.Element | undefined {
  const result = call.result.status === 'success' ? parseRunResult(call.result.output) : undefined
  if (!result) return undefined
  return (
    <RunCard
      ui={ctx.ui}
      result={result}
      canOpen={ctx.desktop !== undefined}
      onOpen={(error) => openFailure(ctx, error)}
      onFix={(error) => ctx.screen.current()?.composer.insert(fixPrompt(error, pathTail(error.file)))}
    />
  )
}

export default Plugin.define({
  setup(ctx) {
    ctx.add(ToolCall, {
      tools: ['test_runner_run', 'test_runner_status'],
      render: (call) => renderRun(ctx, call),
    })
  },
})
