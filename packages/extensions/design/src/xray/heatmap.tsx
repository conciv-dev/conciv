import {createMemo, For, Match, Show, Switch, type JSX} from 'solid-js'
import {minBy} from 'es-toolkit'
import {Collapsible} from '@conciv/ui-kit-system'
import {STAGES, type DiffReport, type Stage} from '../shared/defs.js'
import {kindStage} from '../shared/tolerances.js'
import type {TargetNode} from '../shared/types.js'
import {nodeName} from './decisions.js'
import type {ReportResponse, XrayData} from './panel.js'

type Cell = {kind: 'absent'} | {kind: 'match'} | {kind: 'item'; stage: Stage; confidence: number}
type HeatRow = {node: TargetNode; cells: Cell[]}

export function HeatMap(props: {data: XrayData}): JSX.Element {
  const rows = createMemo(() => heatRows(props.data))
  return (
    <Show when={rows().length > 0}>
      <Collapsible.Root class="mt-4 border border-base rounded-lg bg-base">
        <Collapsible.Trigger class="group text-sm px-3 py-2 text-start focus-base rounded-lg flex gap-2 w-full transition items-center hover:bg-active">
          <span class="i-ph-grid-four-duotone op-75" aria-hidden="true" />
          Heat map
          <span class="op-fade tabular-nums">
            {COUNT.format(rows().length)} {PLURAL.select(rows().length) === 'one' ? 'node' : 'nodes'} ×{' '}
            {COUNT.format(props.data.columns.length)}{' '}
            {PLURAL.select(props.data.columns.length) === 'one' ? 'width' : 'widths'}
          </span>
          <span
            class="i-ph-caret-down ms-auto op-50 transition-transform duration-150 group-data-[state=open]:rotate-180 motion-reduce:transition-none"
            aria-hidden="true"
          />
        </Collapsible.Trigger>
        <Collapsible.Content>
          <div class="px-3 pb-3 flex flex-col gap-2 overflow-x-auto">
            <table class="text-xs border-collapse">
              <caption class="sr-only">The worst stage of each node at each registered width</caption>
              <thead>
                <tr>
                  <th scope="col" class="font-medium px-2 py-1 text-start">
                    Node
                  </th>
                  <For each={props.data.columns}>
                    {(column) => (
                      <th scope="col" class="font-medium px-2 py-1 text-center tabular-nums">
                        {column.target.width}
                      </th>
                    )}
                  </For>
                </tr>
              </thead>
              <tbody>
                <For each={rows()}>
                  {(row) => (
                    <tr class="border-t border-base">
                      <th scope="row" class="font-mono font-normal px-2 py-1 text-start max-w-56 truncate">
                        {nodeName(row.node)}
                      </th>
                      <For each={row.cells}>
                        {(cell) => (
                          <td class="px-2 py-1 text-center">
                            <HeatCell cell={cell} />
                          </td>
                        )}
                      </For>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
            <ul aria-label="Stages" class="m-0 p-0 list-none flex flex-wrap gap-3">
              <For each={STAGES}>
                {(stage) => (
                  <li class="text-xs flex gap-1.5 items-center">
                    <span class={`rounded-sm size-3 ${STAGE_COLOR[stage]}`} aria-hidden="true" />
                    {stage}
                  </li>
                )}
              </For>
            </ul>
          </div>
        </Collapsible.Content>
      </Collapsible.Root>
    </Show>
  )
}

function heatRows(data: XrayData): HeatRow[] {
  return data.nodes
    .map((node) => ({
      node,
      cells: data.columns.map((column) => cellAt({column, node: twinIn({data, column, node: node.id})})),
    }))
    .filter((row) => row.cells.some((cell) => cell.kind === 'item'))
}

function twinIn(input: {data: XrayData; column: ReportResponse; node: string}): string | null {
  if (input.column.target.id === input.data.target.id) return input.node
  const twin = input.data.twins[input.column.target.id]?.find((entry) => entry.node === input.node)
  return twin?.twin ?? null
}

function cellAt(input: {column: ReportResponse; node: string | null}): Cell {
  const {node} = input
  if (node === null) return {kind: 'absent'}
  const items = nodeItems({report: input.column.report, node})
  const worst = minBy(items, (item) => STAGES.indexOf(item.stage))
  return worst === undefined ? {kind: 'match'} : {kind: 'item', ...worst}
}

function nodeItems(input: {report: DiffReport | null; node: string}): {stage: Stage; confidence: number}[] {
  const {report, node} = input
  if (report === null) return []
  const deltas = report.components
    .filter((component) => component.nodes?.includes(node) ?? false)
    .flatMap((component) => component.deltas)
    .flatMap((delta) => {
      const stage = kindStage(delta.kind)
      return stage === null ? [] : [{stage, confidence: delta.confidence ?? 1}]
    })
  const unmatched = report.unmatched.flatMap((entry) =>
    entry.node === node && entry.stage !== null && entry.stage !== undefined
      ? [{stage: entry.stage, confidence: 1}]
      : [],
  )
  return [...deltas, ...unmatched]
}

function HeatCell(props: {cell: Cell}): JSX.Element {
  const item = () => (props.cell.kind === 'item' ? props.cell : null)
  return (
    <Switch>
      <Match when={props.cell.kind === 'absent'}>
        <span class="op-30">–</span>
        <span class="sr-only">no twin</span>
      </Match>
      <Match when={props.cell.kind === 'match'}>
        <span class="i-ph-check text-green-600 inline-block dark:text-green-400" aria-hidden="true" />
        <span class="sr-only">matches</span>
      </Match>
      <Match when={item()}>
        {(found) => (
          <>
            <span
              class={`rounded-sm size-3 inline-block ${STAGE_COLOR[found().stage]}`}
              style={{opacity: Math.max(MIN_OPACITY, found().confidence)}}
              aria-hidden="true"
            />
            <span class="sr-only">
              {found().stage}, {CONFIDENCE.format(found().confidence)} confidence
            </span>
          </>
        )}
      </Match>
    </Switch>
  )
}

const MIN_OPACITY = 0.25
const COUNT = new Intl.NumberFormat(undefined)
const PLURAL = new Intl.PluralRules(undefined)
const CONFIDENCE = new Intl.NumberFormat(undefined, {style: 'percent', maximumFractionDigits: 0})

const STAGE_COLOR: Record<Stage, string> = {
  structure: 'bg-red-500',
  content: 'bg-amber-500',
  geometry: 'bg-orange-500',
  paint: 'bg-primary-500',
}
