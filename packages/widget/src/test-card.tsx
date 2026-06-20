import {createEffect, createSignal, For, onCleanup, Show, type JSX} from 'solid-js'
import {
  TestEventSchema,
  EditorOpenSchema,
  type TestRunResult,
  type Summary,
  type TestError,
  type TestState,
  type TestEvent,
} from '@mandarax/protocol/test-types'
import {OkSchema} from '@mandarax/protocol/chat-types'
import {createTransport} from './transport.js'

// The test-runner results card. Runner-blind: speaks TestEvent / TestRunResult only. result===null
// → subscribe to /api/test-runner/stream and build the tree live; result!==null → static render.

type Row = {name: string; state: TestState | 'running'; error?: TestError}
type FileGroup = {file: string; tests: Row[]}

const EMPTY_SUMMARY: Summary = {passed: 0, failed: 0, skipped: 0, durationMs: 0}

function relName(file: string): string {
  return file.split('/').slice(-2).join('/')
}

const DOT_BASE = 'size-2.25 rounded-full flex-[0_0_auto]'
function dotClass(state: TestState | 'running'): string {
  if (state === 'running')
    return 'size-2.75 rounded-full flex-[0_0_auto] bg-transparent border-2 border-pw-accent border-t-transparent anim-test-rot'
  const tone = state === 'pass' ? 'bg-pw-success' : state === 'fail' ? 'bg-pw-danger' : 'bg-pw-warn'
  return `${DOT_BASE} ${tone}`
}

// Summary pill colors by outcome (also reused for the bar counts).
function pillClass(kind: 'pass' | 'fail' | 'skip'): string {
  const base = 'px-2 py-px rounded-pw-pill font-semibold text-[0.6875rem]'
  const tone =
    kind === 'pass'
      ? 'bg-pw-success-18 text-pw-success'
      : kind === 'fail'
        ? 'bg-pw-danger-18 text-pw-danger'
        : 'bg-pw-warn-20 text-pw-warn'
  return `${base} ${tone}`
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

const ROW_BASE = 'flex items-center gap-2.25 pl-6 pr-3 py-1.25 text-pw-text-2 cursor-pointer hover:bg-pw-fill'
function testRowClass(state: Row['state']): string {
  if (state === 'fail') return `${ROW_BASE} bg-pw-danger-10`
  return ROW_BASE
}

// SSE frames are untrusted — parse to unknown, validate with the protocol schema (no `as`).
function parseTestEvent(raw: string): TestEvent | null {
  try {
    const result = TestEventSchema.safeParse(JSON.parse(raw))
    return result.success ? result.data : null
  } catch {
    return null
  }
}

function TestErrorBlock(props: {error: TestError; apiBase: string; onFix: (text: string) => void}): JSX.Element {
  const openEditor = createTransport({apiBase: props.apiBase}).route({
    method: 'POST',
    path: '/api/editor/open',
    request: EditorOpenSchema,
    response: OkSchema,
  })
  const openInEditor = () => void openEditor({file: props.error.file, line: props.error.line}).catch(() => {})
  return (
    <div class="text-[0.71875rem] text-pw-danger mb-2 ml-9 mr-3 mt-0 px-2.5 py-2 border-l-2 border-l-pw-danger rounded bg-pw-sunken">
      <pre class="m-0 whitespace-pre-wrap break-words [font:inherit]">{props.error.message}</pre>
      <div class="mt-2 flex gap-1.75">
        <button
          class="text-[0.6875rem] text-pw-text leading-none font-pw-mono px-2.25 py-1 border border-pw-line-2 rounded-[0.3125rem] bg-pw-fill inline-flex min-h-6 cursor-pointer transition-[background-color] duration-[120ms] ease-pw items-center hover:bg-pw-fill-strong"
          onClick={openInEditor}
        >
          ↗ Open {openLabel(props.error)}
        </button>
        <button
          class="text-[0.6875rem] text-pw-accent-link leading-none font-pw-mono px-2.25 py-1 border border-pw-accent-line rounded-[0.3125rem] bg-pw-accent-08 inline-flex min-h-6 cursor-pointer transition-[background-color] duration-[120ms] ease-pw items-center hover:bg-pw-accent-20"
          onClick={() => props.onFix(fixMessage(props.error))}
        >
          ✦ Fix this
        </button>
      </div>
    </div>
  )
}

export function TestCard(props: {
  apiBase: string
  onFix: (text: string) => void
  result: TestRunResult | null
}): JSX.Element {
  const [groups, setGroups] = createSignal<FileGroup[]>([])
  const [summary, setSummary] = createSignal<Summary>(EMPTY_SUMMARY)
  const [running, setRunning] = createSignal(false)
  const [openTest, setOpenTest] = createSignal<string | null>(null)
  // Live mode accumulates rows keyed by file::name as `test` events arrive.
  const live = new Map<string, Row & {file: string}>()

  // result present → static render from the transcript; null → live SSE for the active run.
  createEffect(() => {
    const result = props.result
    if (result) {
      setRunning(false)
      setSummary(result.summary)
      setGroups(groupByFile(result.tests.map((t) => ({...t}))))
      return
    }
    setRunning(true)
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
        // Stop after OUR run ends so a later run's stream can't overwrite this card.
        source.close()
      }
    }
    const source = createTransport({apiBase: props.apiBase}).eventSource('/api/test-runner/stream')
    source.addEventListener('message', (e) => {
      const ev = parseTestEvent(e.data)
      if (ev) applyLive(ev)
    })
    onCleanup(() => source.close())
  })

  const toggleTest = (key: string) => setOpenTest((current) => (current === key ? null : key))

  return (
    <div class="text-[0.8125rem] text-pw-text leading-[1.45] font-pw-mono border border-pw-line rounded-pw-md bg-pw-fill-soft pointer-events-auto self-stretch overflow-hidden anim-msg-lg">
      <div class="text-xs px-3 py-2.25 border-b border-b-pw-line bg-pw-fill flex gap-2 items-center">
        <Show when={running()}>
          <span class="text-[0.6875rem] text-pw-text-3 flex gap-1.25 items-center">
            <span class={dotClass('running')} aria-hidden="true" />
            running
          </span>
        </Show>
        <span class={pillClass('pass')}>{summary().passed} passed</span>
        <Show when={summary().failed > 0}>
          <span class={pillClass('fail')}>{summary().failed} failed</span>
        </Show>
        <Show when={summary().skipped > 0}>
          <span class={pillClass('skip')}>{summary().skipped} skipped</span>
        </Show>
      </div>
      <For each={groups()}>
        {(group) => (
          <div>
            <div class="font-semibold px-3 py-1.25 flex gap-2.25 items-center">
              <span class="text-pw-text">{relName(group.file)}</span>
            </div>
            <For each={group.tests}>
              {(test) => {
                const key = `${group.file}::${test.name}`
                return (
                  <div>
                    <div class={testRowClass(test.state)} onClick={() => toggleTest(key)}>
                      <span class={dotClass(test.state)} aria-hidden="true" />
                      <span>{test.name}</span>
                    </div>
                    <Show when={openTest() === key ? test.error : undefined}>
                      {(error) => <TestErrorBlock error={error()} apiBase={props.apiBase} onFix={props.onFix} />}
                    </Show>
                  </div>
                )
              }}
            </For>
          </div>
        )}
      </For>
    </div>
  )
}
