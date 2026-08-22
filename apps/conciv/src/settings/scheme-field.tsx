import {For, Match, Show, Switch, splitProps, type Accessor, type JSX} from 'solid-js'
import type {QueryClient} from '@tanstack/solid-query'
import {SegmentGroup} from '@conciv/ui-kit-system'
import type {AppData} from '../data/app-data.js'
import {SCHEME_VALUES, type SchemeSetting, type SchemeValue} from '../data/widget-settings.js'
import {SchemeFieldPending} from '../shell/pending.js'
import {ScopeBadge} from './scope-badge.js'
import {SettingsError} from './settings-error.js'
import {schemeWriteFor, type SchemeWrites} from './scheme-writes.js'

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

function SchemeTiles(props: {setting: Accessor<SchemeSetting>; writes: SchemeWrites}): JSX.Element {
  const [local] = splitProps(props, ['setting', 'writes'])
  return (
    <SegmentGroup.Root
      variant="plain"
      class="chat-scheme-tiles"
      aria-labelledby="scheme-field-label"
      value={local.setting().value}
      onValueChange={(details) => {
        const next = SCHEME_VALUES.find((value) => value === details.value)
        if (!next || next === local.setting().value) return
        local.writes.run(schemeWriteFor(next, local.setting().source))
      }}
    >
      <For each={SCHEME_VALUES}>
        {(value) => (
          <SegmentGroup.Item variant="plain" class="chat-scheme-tile" value={value}>
            <span class="chat-scheme-preview" aria-hidden="true">
              <Show when={value !== 'dark'}>
                <MiniSurface scheme="light" />
              </Show>
              <Show when={value !== 'light'}>
                <MiniSurface scheme="dark" />
              </Show>
            </span>
            <SegmentGroup.ItemText variant="plain" class="chat-scheme-tile-label">
              {TILE_LABELS[value]}
            </SegmentGroup.ItemText>
            <SegmentGroup.ItemHiddenInput />
          </SegmentGroup.Item>
        )}
      </For>
    </SegmentGroup.Root>
  )
}

export function SchemeField(props: {
  setting: Accessor<SchemeSetting>
  writes: SchemeWrites
  data: AppData
  queryClient: QueryClient
  isLoading: Accessor<boolean>
  isError: Accessor<boolean>
  retry: () => void
}): JSX.Element {
  const [local] = splitProps(props, ['setting', 'writes', 'data', 'queryClient', 'isLoading', 'isError', 'retry'])
  return (
    <Switch>
      <Match when={local.isLoading()}>
        <SchemeFieldPending />
      </Match>
      <Match when={local.isError()}>
        <SettingsError message="Could not load your settings." retryLabel="Try again" onRetry={() => local.retry()} />
      </Match>
      <Match when={true}>
        <div class="chat-settings-field">
          <div class="chat-settings-field-head">
            <span class="chat-settings-field-label" id="scheme-field-label">
              Color scheme
            </span>
            <ScopeBadge
              setting={local.setting}
              writes={local.writes}
              data={local.data}
              queryClient={local.queryClient}
            />
          </div>
          <SchemeTiles setting={local.setting} writes={local.writes} />
          <Show
            when={local.writes.isError()}
            fallback={<span class="chat-settings-field-hint">Auto follows the host page.</span>}
          >
            <SettingsError
              message="Could not save that setting."
              retryLabel="Try again"
              onRetry={() => local.writes.retryLast()}
            />
          </Show>
        </div>
      </Match>
    </Switch>
  )
}
