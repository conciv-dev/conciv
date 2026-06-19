import {createEffect, createSignal, For, onCleanup, Show, type JSX} from 'solid-js'
import {Collapsible} from '@ark-ui/solid/collapsible'
import {ChevronRight, ExternalLink, FlaskConical, Sparkles} from 'lucide-solid'
import {
  TestRunResultSchema,
  type TestRunResult,
  type Summary,
  type TestError,
  type TestState,
  type TestEvent,
} from '@mandarax/protocol/test-types'
import {ToolCard} from '../shell.js'
import {resultText} from '../util.js'
import type {ToolCardProps, ToolViewCtx} from '../types.js'

// The test-runner results card, moved from the widget. Runner-blind: speaks TestEvent /
// TestRunResult only. result===null → subscribe to the live runner stream via ctx and build the
// tree as events arrive; result!==null → static render. The two widget seams (live SSE, editor
// open) are injected through ctx, so this package stays transport-free.

type Row = {name: string; state: TestState | 'running'; error?: TestError}
type FileGroup = {file: string; tests: Row[]}

const EMPTY_SUMMARY: Summary = {passed: 0, failed: 0, skipped: 0, durationMs: 0}

function relName(file: string): string {
  return file.split('/').slice(-2).join('/')
}

function dotClass(state: TestState | 'running'): string {
  if (state === 'running') return 'pw-test-dot pw-test-running'
  return `pw-test-dot pw-test-${state}`
}

// Screen-reader label for the colored state dot (the dot itself is aria-hidden / color-only).
function stateLabel(state: TestState | 'running'): string {
  if (state === 'pass') return 'passed'
  if (state === 'fail') return 'failed'
  if (state === 'skip') return 'skipped'
  return 'running'
}

// A DOM-id-safe slug for aria-controls wiring (the file::name key has / and :).
function domId(key: string): string {
  return `pw-test-${key.replace(/[^a-zA-Z0-9_-]/g, '-')}`
}

function openLabel(error: TestError): string {
  const base = relName(error.file)
  return error.line ? `${base}:${error.line}` : base
}

function fixMessage(error: TestError): string {
  return `The test "${error.name}" in ${relName(error.file)} is failing:\n${error.message}\nPlease look into it.`
}

// tests → ordered file groups (stable insertion order by first-seen file).
function groupByFile(tests: ReadonlyArray<Row & {file: string}>): FileGroup[] {
  const order: string[] = []
  const byFile = new Map<string, Row[]>()
  for (const t of tests) {
    const rows = byFile.get(t.file)
    if (rows) {
      rows.push({name: t.name, state: t.state, error: t.error})
      continue
    }
    order.push(t.file)
    byFile.set(t.file, [{name: t.name, state: t.state, error: t.error}])
  }
  return order.map((file) => ({file, tests: byFile.get(file) ?? []}))
}

function testRowClass(state: Row['state']): string {
  if (state === 'fail') return 'pw-test-test pw-test-test-fail'
  return 'pw-test-test'
}

function TestErrorBlock(props: {error: TestError; ctx: ToolViewCtx}): JSX.Element {
  const openInEditor = () => props.ctx.openEditor?.(props.error.file, props.error.line)
  return (
    <div class="pw-test-err">
      <pre>{props.error.message}</pre>
      <div class="pw-test-actions">
        <Show when={props.ctx.openEditor}>
          <button class="pw-test-act" onClick={openInEditor}>
            <ExternalLink size={12} aria-hidden="true" />
            Open {openLabel(props.error)}
          </button>
        </Show>
        <button class="pw-test-act pw-test-fix" onClick={() => props.ctx.sendMessage(fixMessage(props.error))}>
          <Sparkles size={12} aria-hidden="true" />
          Fix this
        </button>
      </div>
    </div>
  )
}

// The pure results tree. `result` null → live mode (subscribe via ctx); otherwise static.
export function TestResults(props: {result: TestRunResult | null; ctx: ToolViewCtx}): JSX.Element {
  const [groups, setGroups] = createSignal<FileGroup[]>([])
  const [summary, setSummary] = createSignal<Summary>(EMPTY_SUMMARY)
  const [running, setRunning] = createSignal(false)
  const [openTest, setOpenTest] = createSignal<string | null>(null)
  // Collapsed file groups, keyed by file path (not group-object ref) so the user's collapse choice
  // survives the live re-creation of the groups array on each test event.
  const [collapsed, setCollapsed] = createSignal<ReadonlySet<string>>(new Set())
  const live = new Map<string, Row & {file: string}>()

  createEffect(() => {
    const result = props.result
    if (result) {
      setRunning(false)
      setSummary(result.summary)
      setGroups(groupByFile(result.tests.map((t) => ({...t}))))
      return
    }
    const subscribe = props.ctx.subscribeTestRunner
    if (!subscribe) return
    setRunning(true)
    let active = true
    const applyLive = (ev: TestEvent) => {
      if (ev.type === 'snapshot') {
        setSummary(ev.summary)
        return
      }
      if (ev.type === 'run-start') {
        live.clear()
        setGroups([])
        setSummary(EMPTY_SUMMARY)
        return
      }
      if (ev.type === 'test') {
        live.set(`${ev.file}::${ev.name}`, {file: ev.file, name: ev.name, state: ev.state, error: ev.error})
        setGroups(groupByFile([...live.values()]))
        return
      }
      if (ev.type === 'run-end') {
        setSummary(ev.summary)
        setGroups(groupByFile(ev.tests.map((t) => ({...t}))))
        setRunning(false)
        // Stop after our run ends so a later run's stream can't overwrite this card.
        active = false
        unsubscribe()
      }
    }
    const unsubscribe = subscribe(applyLive)
    // Single teardown: skip if run-end already unsubscribed (no double call).
    onCleanup(() => {
      if (!active) return
      active = false
      unsubscribe()
    })
  })

  const toggleTest = (key: string) => setOpenTest((current) => (current === key ? null : key))
  const setFileOpen = (file: string, open: boolean) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (open) next.delete(file)
      else next.add(file)
      return next
    })

  return (
    <div class="pw-test">
      <div class="pw-test-bar">
        <Show when={running()}>
          <span class="pw-test-running-label">
            <span class="pw-test-dot pw-test-running" aria-hidden="true" />
            running
          </span>
        </Show>
        <span class="pw-test-pill pw-test-pass">{summary().passed} passed</span>
        <Show when={summary().failed > 0}>
          <span class="pw-test-pill pw-test-fail">{summary().failed} failed</span>
        </Show>
        <Show when={summary().skipped > 0}>
          <span class="pw-test-pill pw-test-skip">{summary().skipped} skipped</span>
        </Show>
      </div>
      <For each={groups()}>
        {(group) => (
          <Collapsible.Root
            class="pw-test-group"
            open={!collapsed().has(group.file)}
            onOpenChange={(details) => setFileOpen(group.file, details.open)}
          >
            <Collapsible.Trigger class="pw-test-file">
              <ChevronRight class="pw-test-chevron" size={14} aria-hidden="true" />
              <span class="pw-test-fname">{relName(group.file)}</span>
            </Collapsible.Trigger>
            <Collapsible.Content class="pw-test-content">
              <For each={group.tests}>
                {(test) => {
                  const key = `${group.file}::${test.name}`
                  const id = domId(key)
                  return (
                    <Show
                      when={test.error}
                      fallback={
                        <div class={testRowClass(test.state)}>
                          <span class={dotClass(test.state)} aria-hidden="true" />
                          <span class="pw-sr-only">{stateLabel(test.state)}: </span>
                          <span class="pw-test-tname">{test.name}</span>
                        </div>
                      }
                    >
                      {(error) => (
                        <div>
                          <button
                            type="button"
                            class={`${testRowClass(test.state)} pw-test-row`}
                            aria-expanded={openTest() === key}
                            aria-controls={id}
                            onClick={() => toggleTest(key)}
                          >
                            <span class={dotClass(test.state)} aria-hidden="true" />
                            <span class="pw-sr-only">{stateLabel(test.state)}: </span>
                            <span class="pw-test-tname">{test.name}</span>
                          </button>
                          <div id={id}>
                            <Show when={openTest() === key}>
                              <TestErrorBlock error={error()} ctx={props.ctx} />
                            </Show>
                          </div>
                        </div>
                      )}
                    </Show>
                  )
                }}
              </For>
            </Collapsible.Content>
          </Collapsible.Root>
        )}
      </For>
    </div>
  )
}

// Parse the mandarax_test tool result into a TestRunResult; null while streaming or for a live run.
function parseRunResult(props: ToolCardProps): TestRunResult | null {
  const text = resultText(props.result)
  if (!text) return null
  try {
    const parsed = TestRunResultSchema.safeParse(JSON.parse(text))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

function TestIcon(): JSX.Element {
  return <FlaskConical size={14} />
}

export function TestCard(props: ToolCardProps): JSX.Element {
  return (
    <ToolCard
      accent="test"
      Icon={TestIcon}
      title="Ran tests"
      part={props.part}
      result={props.result}
      durationMs={props.durationMs}
    >
      <TestResults result={parseRunResult(props)} ctx={props.ctx} />
    </ToolCard>
  )
}
