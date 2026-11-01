import {For, Show, type JSX} from 'solid-js'
import {RelativeTime, SegmentGroup, TooltipIconButton} from '@conciv/ui-kit-system'
import {filterChoice, stale, type Filter, type WidthTab, type XrayData} from './data.js'
import type {View} from './xray-schemas.js'

const MOBILE_WIDTH = 768

const SEGMENT_ROOT = 'gap-2! p-0! rounded-none! bg-transparent! border-0!'
const SEGMENT_LABEL = 'text-sm! font-sans! text-current! op-fade'
const SEGMENT_ITEM =
  'border border-base rounded! px-2! py-1! gap-2! font-sans! text-current! whitespace-nowrap shrink-0 op-50 grayscale transition hover:op-100 data-[state=checked]:op-100 data-[state=checked]:grayscale-0'
const SEGMENT_INDICATOR = 'bg-active! rounded!'

const VIEW_ITEMS: {view: View; label: string; icon: string}[] = [
  {view: 'list', label: 'List', icon: 'i-ph-list-bullets-duotone'},
  {view: 'capture', label: 'Capture', icon: 'i-ph-image-duotone'},
]

function parseView(value: string): View {
  return value === 'capture' ? 'capture' : 'list'
}

const CHIP_FOCUS = 'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary-500/40'

type RadioChipProps = {
  group: string
  checked: boolean
  icon: string
  small?: boolean
  disabled?: boolean
  onSelect: () => void
  children: JSX.Element
}

function chipState(state: {checked: boolean; disabled?: boolean}): string {
  if (state.disabled) return 'op-30! pointer-events-none'
  return state.checked ? 'bg-active op-100' : 'grayscale op-50 hover:op-100'
}

export function RadioChip(props: RadioChipProps): JSX.Element {
  return (
    <label
      class={`btn-action cursor-pointer whitespace-nowrap ${CHIP_FOCUS}  ${props.small ? 'text-sm' : ''}  ${chipState(props)}`}
    >
      <input
        type="radio"
        class="sr-only"
        name={props.group}
        checked={props.checked}
        disabled={props.disabled}
        onChange={() => props.onSelect()}
      />
      <span class={props.icon} aria-hidden="true" />
      {props.children}
    </label>
  )
}

type CheckChipProps = {
  checked: boolean
  icon: string
  label: string
  onToggle: (checked: boolean) => void
}

export function CheckChip(props: CheckChipProps): JSX.Element {
  return (
    <label
      class={`px-2 py-1 border border-base rounded-md flex gap-1 cursor-pointer select-none transition items-center ${CHIP_FOCUS}  ${props.checked ? 'bg-active' : 'grayscale op-50 hover:op-100'}`}
    >
      <input
        type="checkbox"
        class="me-1 accent-primary-500"
        checked={props.checked}
        onChange={(event) => props.onToggle(event.currentTarget.checked)}
      />
      <span class={props.icon} aria-hidden="true" />
      <span class="text-sm">{props.label}</span>
    </label>
  )
}

function widthIcon(width: number): string {
  return width < MOBILE_WIDTH ? 'i-ph-device-mobile-duotone' : 'i-ph-monitor-duotone'
}

function widthSummary(tab: WidthTab): string {
  return tab.off === null ? 'no run' : `${tab.off} off`
}

export function RunButton(props: {running: boolean; onRun: () => void; primary?: boolean}): JSX.Element {
  return (
    <button
      type="button"
      class={props.primary ? 'btn-primary text-sm' : 'btn-action-sm'}
      aria-busy={props.running}
      disabled={props.running}
      onClick={() => props.onRun()}
    >
      <span
        class={
          props.running ? 'i-ph-circle-notch animate-spin motion-reduce:animate-none' : 'i-ph-arrow-clockwise-duotone'
        }
        aria-hidden="true"
      />
      Run diff
    </button>
  )
}

export type XrayPanelProps = {
  data: XrayData
  filter: Filter
  query: string
  view: View
  running: boolean
  onFilter: (filter: Filter) => void
  onQuery: (query: string) => void
  onView: (view: View) => void
  onTarget: (id: string) => void
  onRun: () => void
}

export function XrayPanel(props: XrayPanelProps): JSX.Element {
  const choice = () => filterChoice(props.filter)
  const targetIds = () => props.data.widths.map((tab) => tab.target.id)
  const tabById = (id: string) => props.data.widths.find((tab) => tab.target.id === id)
  return (
    <div class="border border-base rounded-xl bg-glass flex flex-col">
      <div class="flex flex-wrap min-w-0 items-center">
        <input
          class="px-4 py-2 outline-none bg-transparent flex-1 min-w-40 placeholder:text-current placeholder:op-50"
          placeholder="Search"
          aria-label="Search components"
          name="q"
          autocomplete="off"
          spellcheck={false}
          value={props.query}
          onInput={(event) => props.onQuery(event.currentTarget.value)}
        />
        <div class="pe-2 ps-4 flex flex-wrap gap-2 max-w-full min-h-10 min-w-0 items-center">
          <SegmentGroup.Root
            value={props.data.target.id}
            onValueChange={(details) => details.value !== null && props.onTarget(details.value)}
            class={`${SEGMENT_ROOT} scrollbar-hidden py-1 max-w-full min-w-0 overflow-x-auto`}
          >
            <SegmentGroup.Label class={SEGMENT_LABEL}>Viewport</SegmentGroup.Label>
            <SegmentGroup.Indicator class={SEGMENT_INDICATOR} />
            <For each={targetIds()}>
              {(id) => (
                <Show when={tabById(id)}>
                  {(tab) => (
                    <SegmentGroup.Item value={id} class={`${SEGMENT_ITEM} text-sm!`}>
                      <span class={widthIcon(tab().target.width)} aria-hidden="true" />
                      <SegmentGroup.ItemText class="tabular-nums">
                        {tab().target.width} · {widthSummary(tab())}
                      </SegmentGroup.ItemText>
                      <SegmentGroup.ItemHiddenInput />
                    </SegmentGroup.Item>
                  )}
                </Show>
              )}
            </For>
          </SegmentGroup.Root>
          <span class="mx-1 border-s border-base h-5 hidden sm:block" aria-hidden="true" />
          <RunButton running={props.running} onRun={props.onRun} />
        </div>
      </div>
      <div class="p-2 border-t border-base flex flex-wrap gap-2 items-center">
        <CheckChip
          checked={choice().above}
          icon="i-ph-warning-circle-duotone text-orange-600 dark:text-orange-400"
          label="Off"
          onToggle={(above) => props.onFilter(above ? 'all' : 'none')}
        />
        <TooltipIconButton
          tooltip="Select all"
          class="btn-icon-compact rounded-md"
          onClick={() => props.onFilter('all')}
        >
          <span class="i-ph-selection-all-duotone" aria-hidden="true" />
        </TooltipIconButton>
      </div>
      <div class="p-2 pe-4 border-t border-base flex flex-wrap gap-2 items-center">
        <SegmentGroup.Root
          value={props.view}
          onValueChange={(details) => details.value !== null && props.onView(parseView(details.value))}
          class={SEGMENT_ROOT}
        >
          <SegmentGroup.Label class={`${SEGMENT_LABEL} ps-2`}>View as</SegmentGroup.Label>
          <SegmentGroup.Indicator class={SEGMENT_INDICATOR} />
          <For each={VIEW_ITEMS}>
            {(item) => (
              <SegmentGroup.Item value={item.view} class={`${SEGMENT_ITEM} text-base!`}>
                <span class={item.icon} aria-hidden="true" />
                <SegmentGroup.ItemText>{item.label}</SegmentGroup.ItemText>
                <SegmentGroup.ItemHiddenInput />
              </SegmentGroup.Item>
            )}
          </For>
        </SegmentGroup.Root>
        <span class="text-sm ms-auto flex flex-wrap gap-2 min-w-0 items-center justify-end">
          <Show when={stale(props.data) && !props.running}>
            <span class="badge badge-color-amber shrink-0">stale: source changed</span>
          </Show>
          <span class="min-w-0 truncate">
            <span class="font-mono op-75">{props.data.target.route}</span>
            <Show when={props.data.ranAt} fallback={<span class="op-fade">{' · not diffed yet'}</span>}>
              {(at) => (
                <span class="op-fade tabular-nums">
                  {' · diffed '}
                  <RelativeTime value={new Date(at())} />
                </span>
              )}
            </Show>
          </span>
        </span>
      </div>
    </div>
  )
}
