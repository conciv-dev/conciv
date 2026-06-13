import {type JSX, useEffect, useRef, useState} from 'react'
import type {RunResult, Summary, TestError, TestState, VitestEvent} from '@devgent/protocol/vitest-types'

// The vitest results card, rendered in the chat thread AT the agent's `devgent tools vitest
// run` tool-call. Two modes, one component:
//   - result === null  → the run is still active (tool-call present, no tool-result yet):
//                         subscribe to /__pw/vitest/stream and build the tree live.
//   - result !== null  → the run finished (or we reloaded): render the full tree from the
//                         tool-result JSON in the transcript. No SSE, fully persistent.
// So results live in history at the right place AND stream live while running.

type Row = {name: string; state: TestState | 'running'; error?: TestError}
type FileGroup = {file: string; tests: Row[]}

const EMPTY_SUMMARY: Summary = {passed: 0, failed: 0, skipped: 0, durationMs: 0}

function relName(file: string): string {
  return file.split('/').slice(-2).join('/')
}

function dotClass(state: TestState | 'running'): string {
  if (state === 'running') return 'pw-vitest-dot pw-vitest-running'
  return `pw-vitest-dot pw-vitest-${state}`
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
  if (state === 'fail') return 'pw-vitest-test pw-vitest-test-fail'
  return 'pw-vitest-test'
}

function TestErrorBlock(props: {error: TestError; apiBase: string; onFix: (text: string) => void}): JSX.Element {
  const openInEditor = () =>
    void fetch(`${props.apiBase}/__pw/tools/open`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({file: props.error.file, line: props.error.line}),
    })
  return (
    <div className="pw-vitest-err">
      <pre>{props.error.message}</pre>
      <div className="pw-vitest-actions">
        <button className="pw-vitest-act" onClick={openInEditor}>
          ↗ Open {openLabel(props.error)}
        </button>
        <button className="pw-vitest-act pw-vitest-fix" onClick={() => props.onFix(fixMessage(props.error))}>
          ✦ Fix this
        </button>
      </div>
    </div>
  )
}

export function VitestCard(props: {
  apiBase: string
  onFix: (text: string) => void
  result: RunResult | null
}): JSX.Element {
  const [groups, setGroups] = useState<FileGroup[]>([])
  const [summary, setSummary] = useState<Summary>(EMPTY_SUMMARY)
  const [running, setRunning] = useState(false)
  const [openTest, setOpenTest] = useState<string | null>(null)
  // Live mode accumulates rows keyed by file::name as `test` events arrive.
  const live = useRef(new Map<string, Row & {file: string}>())

  // result present → static render from the transcript; null → live SSE for the active run.
  // EventSource subscribe/teardown is genuine external sync — a legitimate useEffect.
  useEffect(() => {
    const result = props.result
    if (result) {
      setRunning(false)
      setSummary(result.summary)
      setGroups(groupByFile(result.tests.map((t) => ({...t}))))
      return
    }
    setRunning(true)
    const map = live.current
    const applyLive = (ev: VitestEvent) => {
      if (ev.type === 'snapshot') {
        setSummary(ev.summary)
        return
      }
      if (ev.type === 'run-start') {
        map.clear()
        setGroups([])
        setSummary(EMPTY_SUMMARY)
        return
      }
      if (ev.type === 'test') {
        map.set(`${ev.file}::${ev.name}`, {file: ev.file, name: ev.name, state: ev.state, error: ev.error})
        setGroups(groupByFile([...map.values()]))
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
    const source = new EventSource(`${props.apiBase}/__pw/vitest/stream`)
    source.addEventListener('message', (e) => applyLive(JSON.parse(e.data) as VitestEvent))
    return () => source.close()
  }, [props.result, props.apiBase])

  const toggleTest = (key: string) => setOpenTest((current) => (current === key ? null : key))

  return (
    <div className="pw-vitest">
      <div className="pw-vitest-bar">
        {running ? (
          <span className="pw-vitest-running-label">
            <span className="pw-vitest-dot pw-vitest-running" aria-hidden="true" />
            running
          </span>
        ) : null}
        <span className="pw-vitest-pill pw-vitest-pass">{summary.passed} passed</span>
        {summary.failed > 0 ? <span className="pw-vitest-pill pw-vitest-fail">{summary.failed} failed</span> : null}
        {summary.skipped > 0 ? <span className="pw-vitest-pill pw-vitest-skip">{summary.skipped} skipped</span> : null}
      </div>
      {groups.map((group) => (
        <div key={group.file}>
          <div className="pw-vitest-file">
            <span className="pw-vitest-fname">{relName(group.file)}</span>
          </div>
          {group.tests.map((test) => {
            const key = `${group.file}::${test.name}`
            const expanded = Boolean(test.error) && openTest === key
            return (
              <div key={key}>
                <div className={testRowClass(test.state)} onClick={() => toggleTest(key)}>
                  <span className={dotClass(test.state)} aria-hidden="true" />
                  <span>{test.name}</span>
                </div>
                {expanded && test.error ? (
                  <TestErrorBlock error={test.error} apiBase={props.apiBase} onFix={props.onFix} />
                ) : null}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
