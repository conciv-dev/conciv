import {createSignal, For, Show, type JSX} from 'solid-js'
import {createStore} from 'solid-js/store'
import {makeEventListener} from '@solid-primitives/event-listener'
import {compact, groupBy, uniq} from 'es-toolkit'
import type {makeExtRpcClient} from '@conciv/extension'
import {MARK_KINDS, STAGES, type DiffReport, type Stage} from '../shared/defs.js'
import type {Box, Decision, TargetNode, TargetRecord} from '../shared/types.js'
import type {XrayRouter} from '../server/xray-routes.js'
import {RadioChip, type Row, type RowGroup, type XrayData} from './panel.js'

export type XrayClient = ReturnType<typeof makeExtRpcClient<XrayRouter>>

export type XrayTab = {
  capturePixels: () => Promise<boolean>
  pick: () => Promise<string | null>
  find: (selector: string) => Element | null
  toast: (message: string, tone?: 'info' | 'success' | 'error') => void
}

export const DECISION_MODES = ['off', 'pins', 'marks'] as const
export type DecisionMode = (typeof DECISION_MODES)[number]

type MarkKind = (typeof MARK_KINDS)[number]
type Request = {id: string; session: string}
type Settled = {report: DiffReport | null}
type DeciderState = {action: string | null; failure: string | null}

export type Decider = {
  busy: () => string | null
  failure: () => string | null
  pin: (input: {node: TargetNode; origin?: HTMLElement}) => void
  revoke: (input: {decision: Decision; label: string}) => void
  mark: (input: {kind: MarkKind; node: string; value?: number | string; label: string}) => void
  accept: () => void
  capture: () => void
}

export function createDecider(input: {
  client: XrayClient
  target: () => string
  session: () => Promise<string>
  refetch: () => void
  announce: (message: string) => void
  tab: XrayTab | null
}): Decider {
  const {client, tab} = input
  const [state, setState] = createStore<DeciderState>({action: null, failure: null})
  const settle = (job: {action: string; done: string; work: (request: Request) => Promise<Settled>}): void => {
    if (state.action !== null) return
    setState({action: job.action, failure: null})
    input
      .session()
      .then((session) => job.work({id: input.target(), session}))
      .then(
        (settled) => {
          setState('action', null)
          input.announce(settled.report === null ? `${job.done}; the run after it did not finish` : job.done)
          input.refetch()
        },
        (error: unknown) => {
          const message = `${job.action} failed: ${failureText(error)}`
          setState({action: null, failure: message})
          input.announce(message)
          tab?.toast(message, 'error')
        },
      )
  }
  const pin = ({node, origin}: {node: TargetNode; origin?: HTMLElement}): void => {
    if (tab === null || state.action !== null) return
    const label = nodeName(node)
    input.announce(`Pick the element to pin ${label} to`)
    tab.pick().then(
      (path) => {
        origin?.focus()
        if (path === null) return input.announce(`Pinning ${label} was cancelled`)
        settle({
          action: 'Pin',
          done: `Pinned ${label}`,
          work: (request) => client.xray.pin({...request, node: node.id, path}),
        })
      },
      () => input.announce(`Pinning ${label} was cancelled`),
    )
  }
  const capture = (): void => {
    if (tab === null || state.action !== null) return
    tab.capturePixels().then(
      (granted) => {
        if (!granted) return tab.toast('Capture pixels needs Region Capture, which this browser lacks', 'error')
        settle({
          action: 'Capture',
          done: 'Captured the pixels of this tab',
          work: (request) => client.xray.capture(request).then((report) => ({report})),
        })
      },
      (error: unknown) => tab.toast(`Capture pixels needs a shared tab: ${failureText(error)}`, 'error'),
    )
  }
  return {
    busy: () => state.action,
    failure: () => state.failure,
    pin,
    revoke: ({decision, label}) =>
      settle({
        action: decision.kind === 'pin' ? 'Unpin' : 'Revoke',
        done: `${decision.kind === 'pin' ? 'Unpinned' : 'Revoked'} ${label}`,
        work: (request) =>
          decision.kind === 'pin'
            ? client.xray.unpin({...request, decision: decision.id})
            : client.xray.revoke({...request, decision: decision.id}),
      }),
    mark: ({kind, node, value, label}) =>
      settle({
        action: 'Mark',
        done: `Marked ${label} ${KIND_LABEL[kind]}`,
        work: (request) => client.xray.mark({...request, kind, node, ...(value === undefined ? {} : {value})}),
      }),
    accept: () => settle({action: 'Accept', done: 'Accepted this run', work: (request) => client.xray.accept(request)}),
    capture,
  }
}

export function rowGroups(input: {rows: Row[]; grouped: boolean}): RowGroup[] {
  if (!input.grouped) return [{name: null, rows: input.rows}]
  const grouped = groupBy(input.rows, (row) => row.stage ?? INFORMATIONAL)
  return GROUP_ORDER.flatMap((name) => {
    const rows = grouped[name]
    return rows === undefined ? [] : [{name: STAGE_LABEL[name], rows}]
  })
}

export function stageSorted(rows: Row[]): Row[] {
  return rows.toSorted((a, b) => stageOrder(a.stage) - stageOrder(b.stage))
}

export function nodeName(node: TargetNode): string {
  if (node.kind === 'text') return `text "${node.text}"`
  return `${node.kind} at ${Math.round(node.box.x)},${Math.round(node.box.y)}`
}

export function DecisionBar(props: {
  data: XrayData
  mode: DecisionMode
  decider: Decider
  onMode: (mode: DecisionMode) => void
}): JSX.Element {
  const report = () => props.data.report
  return (
    <section aria-label="Run" class="p-3 border border-base rounded-xl bg-base flex flex-col gap-3">
      <div class="flex flex-wrap gap-2 items-center">
        <StopBadge report={report()} />
        <Show when={report()}>
          {(run) => (
            <span class="text-sm op-fade tabular-nums">
              round {run().round} · {run().budgetLeft} left
            </span>
          )}
        </Show>
        <span class="ms-auto flex flex-wrap gap-2 items-center">
          <Acceptance data={props.data} decider={props.decider} />
          <Show when={window.CropTarget !== undefined}>
            <button
              type="button"
              class="btn-action-sm"
              aria-busy={props.decider.busy() === 'Capture'}
              disabled={props.decider.busy() !== null}
              onClick={() => props.decider.capture()}
            >
              <span class="i-ph-aperture-duotone" aria-hidden="true" />
              Capture pixels
            </button>
          </Show>
        </span>
      </div>
      <Show when={report()?.score}>{(score) => <Score score={score()} />}</Show>
      <Show when={(report()?.brief.length ?? 0) > 0}>
        <ol aria-label="Brief" class="text-sm m-0 ps-5 flex flex-col gap-1 text-pretty">
          <For each={report()?.brief}>{(item) => <li>{item}</li>}</For>
        </ol>
      </Show>
      <div role="radiogroup" aria-label="Decide" class="flex flex-wrap gap-2 items-center">
        <For each={DECISION_MODES}>
          {(mode) => (
            <RadioChip
              group="decide"
              small
              checked={props.mode === mode}
              icon={MODE_ICON[mode]}
              onSelect={() => props.onMode(mode)}
            >
              {MODE_LABEL[mode]}
            </RadioChip>
          )}
        </For>
      </div>
      <Decisions data={props.data} decider={props.decider} />
      <Show when={props.decider.failure()}>
        {(text) => (
          <p role="alert" class="text-sm text-red-700 m-0 text-pretty dark:text-red-300">
            {text()}
          </p>
        )}
      </Show>
    </section>
  )
}

export function RowBadges(props: {row: Row; data: XrayData}): JSX.Element {
  const parts = () =>
    compact([
      props.row.measured,
      props.row.width === null ? null : String(props.row.width),
      props.row.confidence === null ? null : CONFIDENCE.format(props.row.confidence),
    ])
  const marks = () => props.data.decisions.filter((decision) => props.row.nodes.includes(decision.anchor))
  const lost = () => marks().some((decision) => lostPin({decision, data: props.data}))
  return (
    <>
      <Show when={parts().length > 0}>
        <span class="text-xs color-meta whitespace-nowrap tabular-nums">{parts().join(' · ')}</span>
      </Show>
      <Show when={props.row.warning}>
        <span class="badge badge-color-amber">sample data</span>
      </Show>
      <For each={uniq(marks().map((decision) => decision.kind))}>
        {(kind) => <span class="badge badge-color-green">{DECISION_LABEL[kind]}</span>}
      </For>
      <Show when={lost()}>
        <span class="badge badge-color-red">pin lost</span>
      </Show>
    </>
  )
}

export function RowDecisions(props: {row: Row; data: XrayData; mode: DecisionMode; decider: Decider}): JSX.Element {
  const nodes = () => compact(props.row.nodes.map((id) => props.data.nodes.find((node) => node.id === id)))
  const anchor = () => nodes()[0]
  return (
    <Show when={props.mode !== 'off' && anchor()}>
      {(first) => (
        <div class="xray-rise ms-14 mt-2 px-4 py-3 border border-base rounded-lg bg-base flex flex-col gap-2">
          <For each={nodes()}>
            {(node) => (
              <div class="flex flex-wrap gap-2 items-center">
                <span class="text-sm font-mono me-auto min-w-0 truncate">{nodeName(node)}</span>
                <Show when={props.mode === 'pins'}>
                  <button
                    type="button"
                    class="btn-action-sm"
                    aria-label={`Pin ${nodeName(node)} to an element`}
                    aria-busy={props.decider.busy() === 'Pin'}
                    disabled={props.decider.busy() !== null}
                    onClick={(event) => props.decider.pin({node, origin: event.currentTarget})}
                  >
                    <span class="i-ph-push-pin-duotone" aria-hidden="true" />
                    Pin to an element
                  </button>
                </Show>
                <Show when={props.mode === 'marks'}>
                  <For each={NODE_MARKS}>
                    {(kind) => (
                      <button
                        type="button"
                        class="btn-action-sm"
                        aria-label={`${MARK_ACTION[kind]} ${nodeName(node)}`}
                        disabled={props.decider.busy() !== null}
                        onClick={() => props.decider.mark({kind, node: node.id, label: nodeName(node)})}
                      >
                        <span class={MARK_ICON[kind]} aria-hidden="true" />
                        {MARK_ACTION[kind]}
                      </button>
                    )}
                  </For>
                </Show>
              </div>
            )}
          </For>
          <Show when={props.mode === 'marks'}>
            <DeltaMarks row={props.row} node={first()} decider={props.decider} />
          </Show>
        </div>
      )}
    </Show>
  )
}

function DeltaMarks(props: {row: Row; node: TargetNode; decider: Decider}): JSX.Element {
  const [tolerance, setTolerance] = createSignal(TOLERANCE_START)
  const kinds = () => uniq(props.row.deltas.map((delta) => delta.kind))
  const busy = () => props.decider.busy() !== null
  const label = () => nodeName(props.node)
  return (
    <Show when={kinds().length > 0}>
      <div class="pt-2 border-t border-base flex flex-wrap gap-2 items-center">
        <For each={kinds()}>
          {(kind) => (
            <button
              type="button"
              class="btn-action-sm"
              disabled={busy()}
              onClick={() =>
                props.decider.mark({kind: 'accept-delta', node: props.node.id, value: kind, label: label()})
              }
            >
              <span class="i-ph-check-duotone" aria-hidden="true" />
              Accept {kind}
            </button>
          )}
        </For>
        <label class="text-sm ms-auto flex gap-2 items-center">
          <span class="op-fade">Tolerance ×</span>
          <input
            type="number"
            min="1"
            step="0.5"
            class="px-2 py-1 focus-base border border-base rounded bg-transparent w-16 tabular-nums"
            value={tolerance()}
            onInput={(event) => setTolerance(Math.max(1, event.currentTarget.valueAsNumber || TOLERANCE_START))}
          />
        </label>
        <button
          type="button"
          class="btn-action-sm"
          disabled={busy()}
          onClick={() =>
            props.decider.mark({kind: 'tolerance', node: props.node.id, value: tolerance(), label: label()})
          }
        >
          <span class="i-ph-sliders-horizontal-duotone" aria-hidden="true" />
          Raise tolerance
        </button>
      </div>
    </Show>
  )
}

export function NodePicks(props: {data: XrayData; decider: Decider}): JSX.Element {
  const paired = () => new Set(props.data.pairs.map((pair) => pair.node))
  return (
    <div class="inset-0 absolute">
      <For each={props.data.nodes}>
        {(node) => (
          <button
            type="button"
            aria-label={`Pin ${nodeName(node)}`}
            class={`focus-base rounded-sm transition-colors absolute hover:bg-primary-500/15 disabled:pointer-events-none ${paired().has(node.id) ? 'outline-1 outline-neutral-400 outline-dashed' : 'outline-2 outline-primary-500 outline'}`}
            style={placed({box: node.box, target: props.data.target})}
            disabled={props.decider.busy() !== null}
            onClick={(event) => props.decider.pin({node, origin: event.currentTarget})}
          />
        )}
      </For>
    </div>
  )
}

export function Outline(props: {element: Element}): JSX.Element {
  const [frame, setFrame] = createSignal(0)
  const redraw = () => setFrame((count) => count + 1)
  makeEventListener(window, 'scroll', redraw, {passive: true, capture: true})
  makeEventListener(window, 'resize', redraw, {passive: true})
  const rect = () => {
    frame()
    return props.element.getBoundingClientRect()
  }
  return (
    <div
      aria-hidden="true"
      class="outline-2 outline-primary-500 outline-offset-2 outline rounded-sm pointer-events-none fixed"
      style={{
        top: `${rect().top}px`,
        left: `${rect().left}px`,
        width: `${rect().width}px`,
        height: `${rect().height}px`,
      }}
    />
  )
}

function Decisions(props: {data: XrayData; decider: Decider}): JSX.Element {
  const label = (decision: Decision) => {
    const node = props.data.nodes.find((entry) => entry.id === decision.anchor)
    return node === undefined ? decision.anchor : nodeName(node)
  }
  return (
    <Show when={props.data.decisions.length > 0}>
      <ul aria-label="Decisions" class="m-0 p-0 list-none flex flex-col gap-1">
        <For each={props.data.decisions}>
          {(decision) => (
            <li class="text-sm flex flex-wrap gap-2 items-center">
              <span class="badge badge-color-green">{decisionText(decision)}</span>
              <span class="font-mono min-w-0 truncate">{label(decision)}</span>
              <Show when={lostPin({decision, data: props.data})}>
                <span class="badge badge-color-red">pin lost</span>
              </Show>
              <button
                type="button"
                class="btn-action-sm ms-auto"
                disabled={props.decider.busy() !== null}
                onClick={() => props.decider.revoke({decision, label: label(decision)})}
              >
                {revokeText({decision, label: label(decision)})}
              </button>
            </li>
          )}
        </For>
      </ul>
    </Show>
  )
}

function Acceptance(props: {data: XrayData; decider: Decider}): JSX.Element {
  const latest = () => runStamp(props.data.report?.livePath ?? null)
  const accepted = () => props.data.target.acceptedRun ?? null
  return (
    <>
      <Show when={accepted()}>
        {(run) => (
          <span class="flex gap-2 items-center">
            <span class="badge badge-color-green">Accepted</span>
            <span class="text-xs font-mono op-fade">run {run()}</span>
          </span>
        )}
      </Show>
      <Show when={latest() !== null && latest() !== accepted()}>
        <button
          type="button"
          class="text-sm btn-primary px-2.5 py-1"
          aria-busy={props.decider.busy() === 'Accept'}
          disabled={props.decider.busy() !== null}
          onClick={() => props.decider.accept()}
        >
          <span class="i-ph-seal-check-duotone" aria-hidden="true" />
          Accept this run
        </button>
      </Show>
    </>
  )
}

function StopBadge(props: {report: DiffReport | null}): JSX.Element {
  const stop = () => props.report?.stop ?? null
  return (
    <Show when={props.report !== null} fallback={<span class="badge badge-color-amber">no run</span>}>
      <span class={stop() === 'done' ? 'badge badge-color-green' : 'badge badge-color-amber'}>
        {stop() === null ? 'in progress' : `stop: ${stop()}`}
      </span>
    </Show>
  )
}

function Score(props: {score: number[]}): JSX.Element {
  return (
    <dl aria-label="Score" class="text-xs m-0 flex flex-wrap gap-x-3 gap-y-1 tabular-nums">
      <For each={SCORE_PARTS}>
        {(part, index) => (
          <div class="flex gap-1">
            <dt class="op-fade">{part.label}</dt>
            <dd class="m-0">{part.format(props.score[index()] ?? 0)}</dd>
          </div>
        )}
      </For>
    </dl>
  )
}

function decisionText(decision: Decision): string {
  if (decision.kind === 'accept-delta') return `accepted ${decision.value}`
  if (decision.kind === 'tolerance') return `tolerance ×${decision.value}`
  return DECISION_LABEL[decision.kind]
}

function revokeText(input: {decision: Decision; label: string}): string {
  if (input.decision.kind === 'pin') return `Unpin ${input.label}`
  return `Revoke ${decisionText(input.decision)} ${input.label}`
}

function lostPin(input: {decision: Decision; data: XrayData}): boolean {
  return input.decision.kind === 'pin' && (input.data.report?.pinsLost.includes(input.decision.id) ?? false)
}

function runStamp(path: string | null): string | null {
  const name = path?.split('/').at(-1)
  if (name === undefined || !name.startsWith(LIVE_PREFIX)) return null
  return name.slice(LIVE_PREFIX.length).split('.')[0] ?? null
}

function stageOrder(stage: Stage | null): number {
  return stage === null ? STAGES.length : STAGES.indexOf(stage)
}

function placed(input: {box: Box; target: TargetRecord}): JSX.CSSProperties {
  return {
    left: `${(input.box.x / input.target.width) * 100}%`,
    top: `${(input.box.y / input.target.height) * 100}%`,
    width: `${(input.box.w / input.target.width) * 100}%`,
    height: `${(input.box.h / input.target.height) * 100}%`,
  }
}

function failureText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

const INFORMATIONAL = 'informational'
const GROUP_ORDER: (Stage | typeof INFORMATIONAL)[] = [...STAGES, INFORMATIONAL]
const LIVE_PREFIX = 'live-'
const TOLERANCE_START = 2
const CONFIDENCE = new Intl.NumberFormat(undefined, {style: 'percent', maximumFractionDigits: 0})
const SHARE = new Intl.NumberFormat(undefined, {style: 'percent', maximumFractionDigits: 1})
const AMOUNT = new Intl.NumberFormat(undefined, {maximumFractionDigits: 2})
const NODE_MARKS: MarkKind[] = ['excluded', 'image-slot']

const STAGE_LABEL: Record<Stage | typeof INFORMATIONAL, string> = {
  structure: 'Structure',
  content: 'Content',
  geometry: 'Geometry',
  paint: 'Paint',
  informational: 'Informational',
}

const KIND_LABEL: Record<MarkKind, string> = {
  excluded: 'excluded',
  'image-slot': 'an image slot',
  'accept-delta': 'with an accepted delta',
  tolerance: 'with a raised tolerance',
}

const DECISION_LABEL: Record<Decision['kind'], string> = {
  pin: 'pinned',
  excluded: 'excluded',
  'image-slot': 'image slot',
  'accept-delta': 'accepted',
  tolerance: 'tolerance',
}

const MARK_ACTION: Record<MarkKind, string> = {
  excluded: 'Exclude',
  'image-slot': 'Image slot',
  'accept-delta': 'Accept',
  tolerance: 'Raise tolerance',
}

const MARK_ICON: Record<MarkKind, string> = {
  excluded: 'i-ph-eye-slash-duotone',
  'image-slot': 'i-ph-image-square-duotone',
  'accept-delta': 'i-ph-check-duotone',
  tolerance: 'i-ph-sliders-horizontal-duotone',
}

const MODE_LABEL: Record<DecisionMode, string> = {off: 'Inspect', pins: 'Pins', marks: 'Marks'}

const MODE_ICON: Record<DecisionMode, string> = {
  off: 'i-ph-magnifying-glass-duotone',
  pins: 'i-ph-push-pin-duotone',
  marks: 'i-ph-tag-duotone',
}

const SCORE_PARTS: {label: string; format: (value: number) => string}[] = [
  {label: 'unpaired', format: (value) => SHARE.format(value)},
  {label: 'structure', format: (value) => AMOUNT.format(value)},
  {label: 'content', format: (value) => AMOUNT.format(value)},
  {label: 'geometry', format: (value) => AMOUNT.format(value)},
  {label: 'paint', format: (value) => AMOUNT.format(value)},
  {label: 'residual', format: (value) => SHARE.format(value)},
]
