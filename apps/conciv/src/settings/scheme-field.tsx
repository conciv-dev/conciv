import {For, Show, splitProps, type Accessor, type JSX} from 'solid-js'
import type {QueryClient} from '@tanstack/solid-query'
import {SegmentGroup} from '@conciv/ui-kit-system'
import type {AppData} from '../data/app-data.js'
import {SCHEME_VALUES, type SchemeSetting, type SchemeValue} from '../data/widget-settings.js'
import {ScopeBadge} from './scope-badge.js'
import {schemeWriteFor, type SchemeWrites} from './scheme-writes.js'

const FIELD = 'flex flex-col gap-2.5'
const FIELD_HEAD = 'flex items-center justify-between gap-3'
const FIELD_LABEL = '[font-family:var(--chat-font-display)] text-[13px] font-semibold [color:var(--chat-text-hi)]'
const TILE_ITEM = 'flex-col gap-1.5 data-[state=checked]:[box-shadow:inset_0_0_0_1px_var(--chat-accent-line)]'
const ERROR_ROW = 'flex items-center gap-2 text-[11.5px] [color:var(--chat-danger)]'
const RETRY =
  'bg-transparent [border:none] underline cursor-pointer [color:var(--chat-danger)] text-[11.5px] px-1 min-h-8'

const TILE_LABELS: Record<SchemeValue, string> = {auto: 'Auto', light: 'Light', dark: 'Dark'}

const HALF_CLASS: Record<'light' | 'dark', string> = {
  light: 'chat-scheme-half light',
  dark: 'chat-scheme-half dark',
}

function MiniSurface(props: {scheme: 'light' | 'dark'}): JSX.Element {
  const [local] = splitProps(props, ['scheme'])
  return (
    <span class={HALF_CLASS[local.scheme]}>
      <span class="chat-scheme-bar-strong" />
      <span class="chat-scheme-bar" />
      <span class="chat-scheme-chip" />
    </span>
  )
}

export function SchemeField(props: {
  setting: Accessor<SchemeSetting>
  writes: SchemeWrites
  data: AppData
  queryClient: QueryClient
  isError: Accessor<boolean>
  retry: () => void
}): JSX.Element {
  const [local] = splitProps(props, ['setting', 'writes', 'data', 'queryClient', 'isError', 'retry'])
  return (
    <div class={FIELD}>
      <div class={FIELD_HEAD}>
        <span class={FIELD_LABEL} id="scheme-field-label">
          Color scheme
        </span>
        <ScopeBadge setting={local.setting} writes={local.writes} data={local.data} queryClient={local.queryClient} />
      </div>
      <Show
        when={!local.isError()}
        fallback={
          <p class={ERROR_ROW} role="status">
            Could not load your settings.
            <button type="button" class={RETRY} onClick={() => local.retry()}>
              Try again
            </button>
          </p>
        }
      >
        <SegmentGroup.Root
          class="chat-scheme-tiles"
          aria-labelledby="scheme-field-label"
          value={local.setting().value}
          disabled={local.writes.isPending()}
          onValueChange={(details) => {
            const next = SCHEME_VALUES.find((value) => value === details.value)
            if (!next || next === local.setting().value) return
            local.writes.run(schemeWriteFor(next))
          }}
        >
          <SegmentGroup.Indicator />
          <For each={SCHEME_VALUES}>
            {(value) => (
              <SegmentGroup.Item class={TILE_ITEM} value={value}>
                <span class="chat-scheme-preview" aria-hidden="true">
                  <Show when={value !== 'dark'}>
                    <MiniSurface scheme="light" />
                  </Show>
                  <Show when={value !== 'light'}>
                    <MiniSurface scheme="dark" />
                  </Show>
                </span>
                <SegmentGroup.ItemText>{TILE_LABELS[value]}</SegmentGroup.ItemText>
                <SegmentGroup.ItemHiddenInput />
              </SegmentGroup.Item>
            )}
          </For>
        </SegmentGroup.Root>
      </Show>
    </div>
  )
}
