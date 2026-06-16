import {createEffect, createSignal, For, onCleanup, Show, type JSX} from 'solid-js'
import {
  TestEventSchema,
  EditorOpenSchema,
  type TestRunResult,
  type Summary,
  type TestError,
  type TestState,
  type TestEvent,
} from '@aidx/protocol/test-types'
import {OkSchema} from '@aidx/protocol/chat-types'
import {createTransport} from './transport.js'

// The test-runner results card. Runner-blind: speaks TestEvent / TestRunResult only. result===null
// → subscribe to /api/test-runner/stream and build the tree live; result!==null → static render.

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
  const openEditor = createTransport({apiBase: props.apiBase}).route({method: 'POST', path: '/api/editor/open', request: EditorOpenSchema, response: OkSchema})
  const openInEditor = () => void openEditor({file: props.error.file, line: props.error.line}).catch(() => {})
  return (
    <div class="pw-test-err">
      <pre>{props.error.message}</pre>
      <div class="pw-test-actions">
        <button class="pw-test-act" onClick={openInEditor}>
          ↗ Open {openLabel(props.error)}
        </button>
        <button class="pw-test-act pw-test-fix" onClick={() => props.onFix(fixMessage(props.error))}>
          ✦ Fix this
        </button>
      </div>
    </div>
  )
}

export function TestCard(props: {apiBase: string; onFix: (text: string) => void; result: TestRunResult | null}): JSX.Element {
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
          <div>
            <div class="pw-test-file">
              <span class="pw-test-fname">{relName(group.file)}</span>
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
