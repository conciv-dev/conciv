import {createSignal, For, Show, type JSX} from 'solid-js'
import {createTimer} from '@solid-primitives/timer'
import {compact, uniq} from 'es-toolkit'
import type {DeltaKindName} from '../shared/defs.js'
import type {Box, SourceLoc, TargetRecord} from '../shared/types.js'
import {deltaValue, rowAboveTolerance, rowName, type Delta, type Row, type XrayImages} from './data.js'
import {fixPrompt, traced} from './fix-prompt.js'

const CONTEXT_PX = 24
const CROP_MAX_PX = 560
const COPIED_MS = 1200

const PX_KINDS: DeltaKindName[] = [
  'inset-left',
  'inset-right',
  'inset-top',
  'inset-bottom',
  'gap-before',
  'gap-after',
  'padding',
  'fontSize',
  'lineHeight',
  'radius',
]

const COLOR_KINDS: DeltaKindName[] = ['background', 'foreground']

const PLURAL = new Intl.PluralRules(undefined)

const UNMATCHED_NOTE = {
  extra: 'The live page renders an element the design does not have.',
  missing: 'The design has an element here that the live page does not render.',
}

function count(input: {value: number; one: string; other: string}): string {
  return `${input.value} ${PLURAL.select(input.value) === 'one' ? input.one : input.other}`
}

function cellValue(input: {delta: Delta; value: number | string}): string {
  const text = deltaValue(input)
  if (typeof input.value === 'number' && PX_KINDS.includes(input.delta.kind) && input.value !== 0) return `${text}px`
  return text
}

function deltaSource(delta: Delta): SourceLoc | null {
  if (!traced(delta) || delta.file === undefined) return null
  return {file: delta.file, line: delta.line ?? 1, column: delta.column ?? 1}
}

function deltaWhere(delta: Delta): string {
  return delta.line === undefined ? `${delta.file}` : `${delta.file}:${delta.line}`
}

type Crop = {x: number; y: number; w: number; h: number}

function cropAround(input: {boxes: Box[]; target: TargetRecord}): Crop {
  const x = Math.max(Math.min(...input.boxes.map((box) => box.x)) - CONTEXT_PX, 0)
  const y = Math.max(Math.min(...input.boxes.map((box) => box.y)) - CONTEXT_PX, 0)
  const right = Math.max(...input.boxes.map((box) => box.x + box.w))
  const bottom = Math.max(...input.boxes.map((box) => box.y + box.h))
  return {
    x,
    y,
    w: Math.min(right + CONTEXT_PX, input.target.width) - x,
    h: Math.min(bottom + CONTEXT_PX, input.target.height) - y,
  }
}

function placed(input: {box: Box; crop: Crop}): JSX.CSSProperties {
  return {
    left: `${((input.box.x - input.crop.x) / input.crop.w) * 100}%`,
    top: `${((input.box.y - input.crop.y) / input.crop.h) * 100}%`,
    width: `${(input.box.w / input.crop.w) * 100}%`,
    height: `${(input.box.h / input.crop.h) * 100}%`,
  }
}

function Swatch(props: {delta: Delta; value: number | string}): JSX.Element {
  return (
    <Show when={COLOR_KINDS.includes(props.delta.kind) && typeof props.value === 'string'}>
      <span
        class="me-1.5 align-[-1px] border border-base rounded-sm size-2.5 inline-block"
        style={{background: String(props.value)}}
        aria-hidden="true"
      />
    </Show>
  )
}

function SetBy(props: {delta: Delta; onOpen: (source: SourceLoc) => void}): JSX.Element {
  return (
    <Show
      when={deltaSource(props.delta)}
      fallback={
        <Show when={props.delta.via} fallback={<span class="color-meta">unknown</span>}>
          {(via) => <span class="color-meta">{via()}</span>}
        </Show>
      }
    >
      {(source) => (
        <span class="flex gap-2 items-center">
          <Show when={props.delta.declaration} fallback={<span>{props.delta.via}</span>}>
            {(declaration) => <code class="font-mono px-1 rounded bg-code">{declaration()}</code>}
          </Show>
          <button
            type="button"
            class="color-meta focus-base rounded transition hover:text-current hover:underline"
            onClick={() => props.onOpen(source())}
          >
            {deltaWhere(props.delta)}
          </button>
        </span>
      )}
    </Show>
  )
}

function noDeltaNote(row: Row): string {
  if (row.unmatched !== null) return UNMATCHED_NOTE[row.unmatched]
  if (rowAboveTolerance(row)) return 'The paint differs from the design, but no property delta was measured.'
  return 'Matches the design.'
}

function PropertyTable(props: {row: Row; onOpen: (source: SourceLoc) => void}): JSX.Element {
  return (
    <Show
      when={props.row.deltas.length > 0}
      fallback={<p class="text-sm m-0 op-fade flex-1">{noDeltaNote(props.row)}</p>}
    >
      <div class="flex-1 max-w-full min-w-0 overflow-x-auto">
        <table class="w-full border-collapse">
          <thead>
            <tr>
              <th class="font-semibold px-2 py-1 text-start border-b border-base">Property</th>
              <th class="font-semibold px-2 py-1 text-start border-b border-base">Live</th>
              <th class="font-semibold px-2 py-1 text-start border-b border-base">Design</th>
              <th class="font-semibold px-2 py-1 text-start border-b border-base w-full">Set by</th>
            </tr>
          </thead>
          <tbody class="text-sm font-mono">
            <For each={props.row.deltas}>
              {(delta) => (
                <tr class="border-b border-base last:border-b-0">
                  <td class="p-2 whitespace-nowrap">{delta.kind}</td>
                  <td class="p-2 whitespace-nowrap">
                    <Swatch delta={delta} value={delta.live} />
                    {cellValue({delta, value: delta.live})}
                  </td>
                  <td class="color-active p-2 whitespace-nowrap">
                    <Swatch delta={delta} value={delta.target} />
                    {cellValue({delta, value: delta.target})}
                  </td>
                  <td class="p-2 whitespace-nowrap">
                    <SetBy delta={delta} onOpen={props.onOpen} />
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
    </Show>
  )
}

function CaptureCrop(props: {row: Row; live: string; target: TargetRecord}): JSX.Element {
  const boxes = () => compact([props.row.live, props.row.target])
  const crop = () => cropAround({boxes: boxes(), target: props.target})
  return (
    <Show when={boxes().length > 0}>
      <figure class="m-0 flex flex-col gap-1.5 min-w-0" style={{width: `${Math.min(crop().w, CROP_MAX_PX)}px`}}>
        <figcaption class="text-xs flex flex-wrap gap-3 items-center">
          <span class="color-meta">Live capture · {props.target.width}</span>
          <span class="op-75 flex gap-1 items-center">
            <span class="border border-neutral-400 border-dashed h-2 w-3" aria-hidden="true" />
            live box
          </span>
          <span class="op-75 flex gap-1 items-center">
            <span class="border border-primary-500 h-2 w-3" aria-hidden="true" />
            design box
          </span>
        </figcaption>
        <div
          class="border border-base rounded bg-secondary max-w-full relative overflow-hidden"
          style={{'aspect-ratio': `${crop().w} / ${crop().h}`}}
        >
          <img
            class="max-w-none absolute"
            src={props.live}
            alt={`Live capture around ${rowName(props.row)}`}
            draggable={false}
            style={{
              width: `${(props.target.width / crop().w) * 100}%`,
              left: `${(-crop().x / crop().w) * 100}%`,
              top: `${(-crop().y / crop().h) * 100}%`,
            }}
          />
          <Show when={props.row.live}>
            {(live) => (
              <span
                class="outline-1 outline-neutral-400 outline outline-dashed absolute"
                style={placed({box: live(), crop: crop()})}
                aria-hidden="true"
              />
            )}
          </Show>
          <Show when={props.row.target}>
            {(design) => (
              <span
                class="outline-1 outline-primary-500 outline absolute"
                style={placed({box: design(), crop: crop()})}
                aria-hidden="true"
              />
            )}
          </Show>
        </div>
      </figure>
    </Show>
  )
}

export type ComponentDetailProps = {
  row: Row
  images: XrayImages
  target: TargetRecord
  opening: boolean
  onOpen: (source: SourceLoc) => void
  onCopied: (copied: boolean) => void
}

export function ComponentDetail(props: ComponentDetailProps): JSX.Element {
  const [copied, setCopied] = createSignal(false)
  createTimer(
    () => setCopied(false),
    () => copied() && COPIED_MS,
    setTimeout,
  )
  const prompt = () => fixPrompt(props.row)
  const lines = () => uniq(props.row.deltas.flatMap((delta) => (traced(delta) ? [deltaWhere(delta)] : []))).length
  const copy = (text: string) => {
    const report = props.onCopied
    void navigator.clipboard.writeText(text).then(
      () => {
        setCopied(true)
        report(true)
      },
      () => report(false),
    )
  }
  return (
    <div class="xray-rise ms-14 border border-base rounded-lg bg-base overflow-hidden">
      <div class="p-4 flex flex-wrap gap-6 items-start">
        <PropertyTable row={props.row} onOpen={props.onOpen} />
        <Show when={props.images.live}>
          {(live) => <CaptureCrop row={props.row} live={live()} target={props.target} />}
        </Show>
      </div>
      <div class="px-4 py-3 border-t border-base flex flex-wrap gap-2 items-center justify-end">
        <span class="text-sm me-auto op-fade">
          {count({value: props.row.deltas.length, one: 'property', other: 'properties'})} ·{' '}
          {count({value: lines(), one: 'source line', other: 'source lines'})}
        </span>
        <button
          type="button"
          class="btn-action-sm"
          disabled={props.row.source === null || props.opening}
          title={props.row.source === null ? 'No source position' : undefined}
          onClick={() => {
            if (props.row.source !== null) props.onOpen(props.row.source)
          }}
        >
          <span class="i-ph-pencil-simple-duotone" aria-hidden="true" />
          Open source
        </button>
        <Show when={prompt()}>
          {(text) => (
            <button type="button" class="text-sm btn-primary px-2.5 py-1" onClick={() => copy(text())}>
              <span class={copied() ? 'i-ph-check' : 'i-ph-copy-duotone'} aria-hidden="true" />
              Copy fix prompt
            </button>
          )}
        </Show>
      </div>
    </div>
  )
}
