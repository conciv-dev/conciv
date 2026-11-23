import {Effect, Layer, ManagedRuntime} from 'effect'
import {createMemo, createUniqueId, For, Match, onCleanup, Show, Switch, type JSX} from 'solid-js'
import {
  Panel,
  ToolRegistry,
  type Context,
  type PanelTab,
  type Plugin,
  type SessionRef,
  type SessionScreen,
  type ToolComponent,
} from '@conciv/plugin/experimental'
import {defineInternalPlugin, type InternalUi} from '@conciv/plugin-internal'
import type {Summary, TestError, TestRow} from './events.js'
import {followRunView, type TestRunnerRuntime} from './follow.js'
import {initialRunView, selectSummary, selectTests, type RunView} from './run-state.js'
import {TestsPanel} from './tests-panel.js'
import {
  countLabel,
  counts,
  failedCount,
  failingLabel,
  failureLocation,
  fileGroup,
  fixPrompt,
  parseRunResult,
  pathTail,
  relativePath,
  shortDuration,
  STATE_LABEL,
  testFiles,
  type FileGroup,
} from './view.js'

type Actions = {
  readonly ui: InternalUi
  readonly canOpen: boolean
  readonly onOpen: (error: TestError) => void
  readonly onFix: (error: TestError) => void
}

const DOT_TONE: Record<TestRow['state'], string> = {
  pass: 'bg-chat-success',
  fail: 'bg-chat-danger',
  skip: 'bg-chat-text-3',
}

const SUMMARY =
  'w-full py-1 flex gap-1.5 items-center text-start text-chat-sm text-chat-text-2 cursor-pointer select-none list-none transition-colors duration-chat-fast ease-chat motion-reduce:transition-none hover:text-chat-text focus-ring [&::-webkit-details-marker]:hidden'
const CHEVRON =
  'text-chat-text-3 flex shrink-0 transition-transform duration-chat-fast ease-chat motion-reduce:transition-none -rotate-90'
const LEVEL = {
  file: {details: 'group/file min-w-0 w-full', chevron: `${CHEVRON} group-open/file:rotate-0`},
  test: {details: 'group/test min-w-0 w-full', chevron: `${CHEVRON} group-open/test:rotate-0`},
}

const TEST_RUNNER_TITLES: Record<string, {running: string; done: string}> = {
  test_runner_run: {running: 'Running the tests', done: 'Ran the tests'},
  test_runner_status: {running: 'Reading the last test run', done: 'Read the last test run'},
}

function Disclosure(props: {
  ui: InternalUi
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
            <props.ui.Chip compact tone="danger" value={failingLabel(failed())} />
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

type RunCardView = {
  readonly summary: Summary
  readonly tests: readonly TestRow[]
  readonly running: boolean
}

function RunCard(props: Actions & RunCardView): JSX.Element {
  const accordion = createUniqueId()
  const sentence = () => `${props.running ? 'Test run in progress' : 'Test run finished'}: ${counts(props.summary)}`
  return (
    <div class="flex flex-col gap-2">
      <div class="flex flex-wrap gap-1.5 items-center" role="status" aria-live="polite">
        <span class="sr-only">{sentence()}</span>
        <div class="flex flex-wrap gap-1.5 items-center" aria-hidden="true">
          <Show when={props.running}>
            <span class="text-chat-xs text-chat-text-3 font-chat-mono inline-flex gap-1.25 items-center">
              <props.ui.StatusDot tone="running" />
              running
            </span>
          </Show>
          <props.ui.Chip compact tone="success" value={countLabel(props.summary.passed, 'passed')} />
          <Show when={props.summary.failed > 0}>
            <props.ui.Chip compact tone="danger" value={countLabel(props.summary.failed, 'failed')} />
          </Show>
          <Show when={props.summary.skipped > 0}>
            <props.ui.Chip compact tone="neutral" value={countLabel(props.summary.skipped, 'skipped')} />
          </Show>
        </div>
      </div>
      <div class="flex flex-col gap-0.5">
        <For each={testFiles(props.tests)}>
          {(file) => <FileSection {...props} group={fileGroup(props.tests, file)} accordion={accordion} />}
        </For>
      </div>
    </div>
  )
}

type Client = Context['client']

function LiveRunCard(props: Actions & {runtime: TestRunnerRuntime; client: () => Client | undefined}): JSX.Element {
  const follow = createMemo(() => {
    const client = props.client()
    return client ? followRunView(props.runtime, client) : undefined
  })
  const run = (): RunView => follow()?.() ?? initialRunView
  const unavailable = () => {
    const view = run()
    return view.status === 'unavailable' ? view : undefined
  }

  return (
    <Switch
      fallback={
        <RunCard
          {...props}
          summary={selectSummary(run())}
          tests={selectTests(run())}
          running={run().status === 'running'}
        />
      }
    >
      <Match when={unavailable()}>
        {(view) => (
          <div class="flex flex-col gap-1">
            <p role="status" aria-live="polite" class="text-chat-sm text-chat-text-2">
              The test runner is unavailable
            </p>
            <p class="text-chat-xs text-chat-text-2 font-chat-mono whitespace-pre-wrap break-words">{view().reason}</p>
          </div>
        )}
      </Match>
      <Match when={run().status === 'idle'}>
        <p role="status" aria-live="polite" class="text-chat-sm text-chat-text-2">
          No test run yet
        </p>
      </Match>
    </Switch>
  )
}

function parseOutput(output: string | undefined): unknown {
  if (!output) return undefined
  try {
    return JSON.parse(output)
  } catch {
    return undefined
  }
}

function openFailure(ctx: Context, runtime: TestRunnerRuntime, error: TestError): void {
  const desktop = ctx.desktop
  if (!desktop) return
  const position = error.line === undefined ? undefined : {line: error.line}
  runtime.runFork(
    Effect.tryPromise(() => desktop.launch(error.file, position)).pipe(
      Effect.catch((cause) =>
        Effect.logError('[test-runner] the failing test did not open', cause).pipe(
          Effect.andThen(
            Effect.sync(() => ctx.toast.show({title: 'The test file could not open in your editor', variant: 'error'})),
          ),
        ),
      ),
    ),
  )
}

function testRunCard(ctx: Context, runtime: TestRunnerRuntime, ui: InternalUi): ToolComponent {
  const session = () => ctx.sessions.current()
  const client = () => session()?.server.client
  const actions: Actions = {
    ui,
    canOpen: ctx.desktop !== undefined,
    onOpen: (error) => openFailure(ctx, runtime, error),
    onFix: (error) =>
      ctx.screen.current()?.composer.insert(fixPrompt(error, relativePath(error.file, session()?.directory ?? ''))),
  }
  return (props) => {
    const live = () => props.status === 'running' || props.status === 'streaming'
    const unfinished = () => props.status === 'pending' || live()
    const streams = () => props.tool === 'test_runner_run' && live()
    const finished = createMemo(() =>
      props.status === 'completed' ? parseRunResult(parseOutput(props.output)) : undefined,
    )
    const title = () => {
      const titles = TEST_RUNNER_TITLES[props.tool]
      if (titles === undefined) return props.tool
      return unfinished() ? titles.running : titles.done
    }
    return (
      <ui.BasicTool
        {...props}
        icon="flask-conical"
        title={title()}
        expandable={streams() || finished() !== undefined}
        openWhileRunning
      >
        <Show when={finished()} fallback={<LiveRunCard {...actions} runtime={runtime} client={client} />}>
          {(result) => <RunCard {...actions} summary={result().summary} tests={result().tests} running={false} />}
        </Show>
      </ui.BasicTool>
    )
  }
}

const runner: Plugin.Definition = defineInternalPlugin({
  setup(ctx) {
    const runtime = ManagedRuntime.make(Layer.empty)
    onCleanup(() => void runtime.dispose())
    const tab: PanelTab = {
      id: 'tests',
      title: 'Tests',
      pinned: true,
      label: () => (
        <>
          <ctx.ui.Icon name="flask-conical" size="small" />
          Tests
        </>
      ),
    }

    const fixFailure = (error: TestError, screen: SessionScreen, session: SessionRef, directory: string) => {
      screen.composer.insert(fixPrompt(error, relativePath(error.file, directory)))
      ctx.layout.hide(`${ctx.id}:${tab.id}`, session)
    }

    ctx.add(Panel, {
      id: 'tests',
      region: 'pane',
      list: () => [tab],
      render: (props) => {
        const run = followRunView(runtime, ctx.client)
        return (
          <TestsPanel
            ui={ctx.ui}
            run={run()}
            directory={props.session.directory}
            canOpen={ctx.desktop !== undefined}
            onOpen={(error) => openFailure(ctx, runtime, error)}
            onFix={(error) => fixFailure(error, props.screen, props.session, props.session.directory)}
          />
        )
      },
    })

    const render = testRunCard(ctx, runtime, ctx.ui)
    ctx.add(ToolRegistry, {name: 'test_runner_run', render})
    ctx.add(ToolRegistry, {name: 'test_runner_status', render})
  },
})

export default runner
