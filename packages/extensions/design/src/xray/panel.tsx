import {For, Show, type JSX} from 'solid-js'
import {RelativeTime} from '@conciv/ui-kit-system'
import {choiceFilter, filterChoice, stale, type Filter, type WidthTab, type XrayData} from './data.js'
import type {View} from './xray-schemas.js'

const MOBILE_WIDTH = 768

const CHIP_FOCUS = 'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary-500/40'

type RadioChipProps = {
  group: string
  checked: boolean
  icon: string
  small?: boolean
  onSelect: () => void
  children: JSX.Element
}

function RadioChip(props: RadioChipProps): JSX.Element {
  return (
    <label
      class={`btn-action cursor-pointer whitespace-nowrap ${CHIP_FOCUS}  ${props.small ? 'text-sm' : ''}  ${props.checked ? 'bg-active op-100' : 'grayscale op-50 hover:op-100'}`}
    >
      <input
        type="radio"
        class="sr-only"
        name={props.group}
        checked={props.checked}
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

function CheckChip(props: CheckChipProps): JSX.Element {
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
        <div class="me-2 flex flex-wrap gap-2 min-h-10 items-center">
          <div role="radiogroup" aria-label="Viewport" class="flex gap-2 items-center">
            <span class="text-sm op-fade" aria-hidden="true">
              Viewport
            </span>
            <For each={props.data.widths}>
              {(tab) => (
                <RadioChip
                  group="viewport"
                  small
                  checked={tab.target.id === props.data.target.id}
                  icon={widthIcon(tab.target.width)}
                  onSelect={() => props.onTarget(tab.target.id)}
                >
                  <span class="tabular-nums">
                    {tab.target.width} · {widthSummary(tab)}
                  </span>
                </RadioChip>
              )}
            </For>
          </div>
          <span class="mx-1 border-s border-base h-5" aria-hidden="true" />
          <Show when={stale(props.data) && !props.running}>
            <span class="badge badge-color-amber">stale: source changed</span>
          </Show>
          <RunButton running={props.running} onRun={props.onRun} />
        </div>
      </div>
      <div class="p-2 border-t border-base flex flex-wrap gap-2 items-center">
        <CheckChip
          checked={choice().above}
          icon="i-ph-warning-circle-duotone text-orange-600 dark:text-orange-400"
          label="Off"
          onToggle={(above) => props.onFilter(choiceFilter({...choice(), above}))}
        />
        <CheckChip
          checked={choice().match}
          icon="i-ph-check-circle-duotone text-green-600 dark:text-green-400"
          label="Match"
          onToggle={(match) => props.onFilter(choiceFilter({...choice(), match}))}
        />
        <button
          type="button"
          class="btn-icon-compact rounded-md"
          aria-label="Invert selection"
          onClick={() => props.onFilter(choiceFilter({above: !choice().above, match: !choice().match}))}
        >
          <span class="i-ph-selection-inverse-duotone" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="btn-icon-compact rounded-md"
          aria-label="Select all"
          onClick={() => props.onFilter('all')}
        >
          <span class="i-ph-selection-all-duotone" aria-hidden="true" />
        </button>
      </div>
      <div class="p-2 pe-4 border-t border-base flex flex-wrap gap-2 items-center">
        <div role="radiogroup" aria-label="View as" class="flex gap-2 items-center">
          <span class="text-sm ps-2 op-fade" aria-hidden="true">
            View as
          </span>
          <RadioChip
            group="view"
            checked={props.view === 'list'}
            icon="i-ph-list-bullets-duotone"
            onSelect={() => props.onView('list')}
          >
            List
          </RadioChip>
          <RadioChip
            group="view"
            checked={props.view === 'capture'}
            icon="i-ph-image-duotone"
            onSelect={() => props.onView('capture')}
          >
            Capture
          </RadioChip>
        </div>
        <span class="text-sm ms-auto min-w-0 truncate">
          <span class="font-mono op-75">{props.data.target.route}</span>
          <Show when={props.data.ranAt}>
            {(at) => (
              <span class="op-fade tabular-nums">
                {' · diffed '}
                <RelativeTime value={new Date(at())} />
              </span>
            )}
          </Show>
        </span>
      </div>
    </div>
  )
}
