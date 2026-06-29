import {createEffect, createSignal, For, onCleanup, Show, type JSX} from 'solid-js'
import {Collapsible} from '@mandarax/ui-kit-system'
import {ChevronRight, ExternalLink, FlaskConical, Sparkles} from 'lucide-solid'
import {ToolCard, resultText} from '@mandarax/ui-kit-chat'
import type {ToolCardProps, ToolViewCtx} from '@mandarax/protocol/tool-view-types'
import {
  TestEventSchema,
  TestRunResultSchema,
  type TestRunResult,
  type Summary,
  type TestError,
  type TestState,
  type TestEvent,
} from '../shared/events.js'

// The test-runner results card. Runner-blind: speaks TestEvent / TestRunResult only. result===null
// → open the extension's namespaced SSE (via ctx.apiBase) and build the tree live; result!==null →
// static render. Live stream + editor-open go through ctx.apiBase, so the card stays self-contained.

type Row = {name: string; state: TestState | 'running'; error?: TestError}
type FileGroup = {file: string; tests: Row[]}

const EMPTY_SUMMARY: Summary = {passed: 0, failed: 0, skipped: 0, durationMs: 0}

function relName(file: string): string {
  return file.split('/').slice(-2).join('/')
}

const FOCUS = 'focus-ring'
const CARD =
  'border border-pw-line rounded-pw-md bg-pw-fill-soft overflow-hidden font-pw-mono text-[0.8125rem] leading-[1.45] text-pw-text'
const BAR = 'flex items-center gap-2 py-2.25 px-3 bg-pw-fill border-b border-b-pw-line text-[0.75rem]'
const RUN_LABEL = 'flex items-center gap-1.25 text-pw-text-3 text-[0.6875rem]'
const PILL = 'py-px px-2 rounded-pw-pill font-semibold text-[0.6875rem]'
const PILL_STATE: Record<'pass' | 'fail' | 'skip', string> = {
  pass: 'bg-pw-success-18 text-pw-success',
  fail: 'bg-pw-danger-18 text-pw-danger',
  skip: 'bg-pw-warn-20 text-pw-warn',
}
const FILE_HEAD = `flex items-center gap-1.75 w-full py-1.25 px-3 font-semibold text-[0.8125rem] leading-[1.45] font-pw-mono text-pw-text [border:0] cursor-pointer text-left hover:bg-pw-fill ${FOCUS}`
const CHEVRON = 'flex-none text-pw-text-3 trans-tf150 [[data-state=open]_&]:[transform:rotate(90deg)]'
const FNAME = 'min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-pw-text'
const ROW = 'flex items-center gap-2.25 min-w-0 py-1.25 pr-3 pl-6 text-pw-text-2 cursor-pointer hover:bg-pw-fill'
const ROW_FAIL = 'bg-pw-danger-10'
const ROW_BTN = `w-full [border:0] text-left ${FOCUS}`
const TNAME = 'min-w-0 overflow-hidden text-ellipsis whitespace-nowrap'
const DOT_BASE = 'rounded-full flex-none'
const DOT_STATE: Record<TestState | 'running', string> = {
  pass: 'size-2.25 bg-pw-success',
  fail: 'size-2.25 bg-pw-danger',
  skip: 'size-2.25 bg-pw-warn',
  running: 'size-2.75 bg-transparent border-2 border-t-transparent border-x-pw-accent border-b-pw-accent anim-test-rot',
}
const ERR =
  'mt-0 mr-3 mb-2 ml-9 py-2 px-2.5 bg-pw-sunken border-l-2 border-l-pw-danger rounded text-pw-danger text-[0.71875rem]'
const ERR_PRE = 'm-0 whitespace-pre-wrap [word-break:break-word] [font:inherit]'
const ACTIONS = 'flex gap-1.75 mt-2'
const ACT = `inline-flex items-center gap-1.25 min-h-6 text-[0.6875rem] leading-none font-pw-mono py-1 px-2.25 rounded-[0.3125rem] cursor-pointer border trans-bg ${FOCUS}`
const ACT_PLAIN = 'border-pw-line-2 bg-pw-fill text-pw-text hover:bg-pw-fill-strong'
const ACT_FIX = 'border-pw-accent-line bg-pw-accent-08 text-pw-accent-link hover:bg-pw-accent-20'

function dotClass(state: TestState | 'running'): string {
  return `${DOT_BASE} ${DOT_STATE[state]}`
}

function stateLabel(state: TestState | 'running'): string {
  if (state === 'pass') return 'passed'
  if (state === 'fail') return 'failed'
  if (state === 'skip') return 'skipped'
  return 'running'
}

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
  return state === 'fail' ? `${ROW} ${ROW_FAIL}` : ROW
}

function openInEditor(apiBase: string, error: TestError): void {
  void fetch(`${apiBase}/api/editor/open`, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({file: error.file, line: error.line}),
  }).catch(() => {})
}

function parseTestEvent(raw: string): TestEvent | null {
  try {
    const result = TestEventSchema.safeParse(JSON.parse(raw))
    return result.success ? result.data : null
  } catch {
    return null
  }
}

function TestErrorBlock(props: {error: TestError; ctx: ToolViewCtx}): JSX.Element {
  return (
    <div class={ERR}>
      <pre class={ERR_PRE}>{props.error.message}</pre>
      <div class={ACTIONS}>
        <button class={`${ACT}  ${ACT_PLAIN}`} onClick={() => openInEditor(props.ctx.apiBase, props.error)}>
          <ExternalLink size={12} aria-hidden="true" />
          Open {openLabel(props.error)}
        </button>
        <button class={`${ACT}  ${ACT_FIX}`} onClick={() => props.ctx.sendMessage(fixMessage(props.error))}>
          <Sparkles size={12} aria-hidden="true" />
          Fix this
        </button>
      </div>
    </div>
  )
}

// The pure results tree. `result` null → live mode (open the namespaced SSE); otherwise static.
export function TestResults(props: {result: TestRunResult | null; ctx: ToolViewCtx}): JSX.Element {
  const [groups, setGroups] = createSignal<FileGroup[]>([])
  const [summary, setSummary] = createSignal<Summary>(EMPTY_SUMMARY)
  const [running, setRunning] = createSignal(false)
  const [openTest, setOpenTest] = createSignal<string | null>(null)
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
    setRunning(true)
    const source = new EventSource(`${props.ctx.apiBase}/api/ext/test-runner/stream`)
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
        source.close()
      }
    }
    source.addEventListener('message', (e) => {
      const ev = parseTestEvent(e.data)
      if (ev) applyLive(ev)
    })
    onCleanup(() => source.close())
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
    <div class={CARD}>
      <div class={BAR}>
        <Show when={running()}>
          <span class={RUN_LABEL}>
            <span class={`${DOT_BASE}  ${DOT_STATE.running}`} aria-hidden="true" />
            running
          </span>
        </Show>
        <span class={`${PILL}  ${PILL_STATE.pass}`}>{summary().passed} passed</span>
        <Show when={summary().failed > 0}>
          <span class={`${PILL}  ${PILL_STATE.fail}`}>{summary().failed} failed</span>
        </Show>
        <Show when={summary().skipped > 0}>
          <span class={`${PILL}  ${PILL_STATE.skip}`}>{summary().skipped} skipped</span>
        </Show>
      </div>
      <For each={groups()}>
        {(group) => (
          <Collapsible.Root
            open={!collapsed().has(group.file)}
            onOpenChange={(details) => setFileOpen(group.file, details.open)}
          >
            <Collapsible.Trigger class={FILE_HEAD}>
              <ChevronRight class={CHEVRON} size={14} aria-hidden="true" />
              <span class={FNAME}>{relName(group.file)}</span>
            </Collapsible.Trigger>
            <Collapsible.Content>
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
                          <span class="sr-only">{stateLabel(test.state)}: </span>
                          <span class={TNAME}>{test.name}</span>
                        </div>
                      }
                    >
                      {(error) => (
                        <div>
                          <button
                            type="button"
                            class={`${testRowClass(test.state)}  ${ROW_BTN}`}
                            aria-expanded={openTest() === key}
                            aria-controls={id}
                            onClick={() => toggleTest(key)}
                          >
                            <span class={dotClass(test.state)} aria-hidden="true" />
                            <span class="sr-only">{stateLabel(test.state)}: </span>
                            <span class={TNAME}>{test.name}</span>
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
    <ToolCard Icon={TestIcon} title="Ran tests" part={props.part} result={props.result}>
      <TestResults result={parseRunResult(props)} ctx={props.ctx} />
    </ToolCard>
  )
}
