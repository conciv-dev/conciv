import {For, Match, Show, Switch, createSignal, splitProps, type Accessor, type JSX} from 'solid-js'
import {SegmentGroup} from '@conciv/ui-kit-system'
import type {SettingsScope} from '@conciv/protocol/settings-types'
import {
  FALLBACK_SCHEME,
  SCHEME_VALUES,
  schemeOfLayer,
  type SchemeSetting,
  type SchemeValue,
} from '../data/widget-settings.js'
import {SchemeFieldPending} from '../shell/pending.js'
import {SettingsError} from './settings-error.js'
import {
  applyGloballyWrite,
  clearGlobalWrite,
  clearProjectWrite,
  schemeWriteFor,
  type SchemeWrites,
} from './scheme-writes.js'

const TILE_LABELS: Record<SchemeValue, string> = {auto: 'Auto', light: 'Light', dark: 'Dark'}
const HALF_CLASS: Record<'light' | 'dark', string> = {
  light: 'chat-scheme-half light',
  dark: 'chat-scheme-half dark',
}

const SCOPE_OPTIONS: {value: SettingsScope; label: string}[] = [
  {value: 'project', label: 'This project'},
  {value: 'global', label: 'All projects'},
]

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

function ScopeSwitch(props: {scope: Accessor<SettingsScope>; onScope: (scope: SettingsScope) => void}): JSX.Element {
  const [local] = splitProps(props, ['scope', 'onScope'])
  return (
    <SegmentGroup.Root
      class="chat-scheme-scope"
      aria-label="Where the color scheme applies"
      value={local.scope()}
      onValueChange={(details) => {
        const next = SCOPE_OPTIONS.find((option) => option.value === details.value)
        if (next) local.onScope(next.value)
      }}
    >
      <SegmentGroup.Indicator />
      <For each={SCOPE_OPTIONS}>
        {(option) => (
          <SegmentGroup.Item class="chat-scheme-scope-item" value={option.value}>
            <SegmentGroup.ItemText>{option.label}</SegmentGroup.ItemText>
            <SegmentGroup.ItemHiddenInput />
          </SegmentGroup.Item>
        )}
      </For>
    </SegmentGroup.Root>
  )
}

function SchemeTiles(props: {value: Accessor<SchemeValue>; onPick: (value: SchemeValue) => void}): JSX.Element {
  const [local] = splitProps(props, ['value', 'onPick'])
  return (
    <SegmentGroup.Root
      variant="plain"
      class="chat-scheme-tiles"
      aria-labelledby="scheme-field-label"
      value={local.value()}
      onValueChange={(details) => {
        const next = SCHEME_VALUES.find((value) => value === details.value)
        if (!next || next === local.value()) return
        local.onPick(next)
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

function ProvenanceLine(props: {
  scope: Accessor<SettingsScope>
  setting: Accessor<SchemeSetting>
  writes: SchemeWrites
}): JSX.Element {
  const [local] = splitProps(props, ['scope', 'setting', 'writes'])
  const projectValue = () => schemeOfLayer(local.setting().layers.project)
  const globalValue = () => schemeOfLayer(local.setting().layers.global)
  const labelOf = (value: SchemeValue | undefined) => TILE_LABELS[value ?? FALLBACK_SCHEME]
  return (
    <span class="chat-settings-field-hint">
      <Switch>
        <Match when={local.scope() === 'project' && projectValue() !== undefined}>
          <Show
            when={globalValue() !== undefined}
            fallback={<>Set for this project only. Other projects use the default ({labelOf(undefined)}).</>}
          >
            Overrides your global setting ({labelOf(globalValue())}).
          </Show>{' '}
          <button type="button" class="chat-settings-hint-action" onClick={() => local.writes.run(clearProjectWrite())}>
            Reset to global
          </button>
        </Match>
        <Match when={local.scope() === 'project' && globalValue() !== undefined}>
          Using your global setting ({labelOf(globalValue())}).
        </Match>
        <Match when={local.scope() === 'project'}>Using the default ({labelOf(undefined)}).</Match>
        <Match when={projectValue() !== undefined}>
          Applies to all your projects. This project keeps its own setting ({labelOf(projectValue())}).{' '}
          <Show when={globalValue() !== undefined}>
            <button
              type="button"
              class="chat-settings-hint-action"
              onClick={() => local.writes.run(clearGlobalWrite())}
            >
              Reset to default
            </button>
          </Show>
        </Match>
        <Match when={globalValue() !== undefined}>
          Applies to all your projects.{' '}
          <button type="button" class="chat-settings-hint-action" onClick={() => local.writes.run(clearGlobalWrite())}>
            Reset to default
          </button>
        </Match>
        <Match when={true}>No global setting yet. Picking one here applies it to all your projects.</Match>
      </Switch>
    </span>
  )
}

export function SchemeField(props: {
  setting: Accessor<SchemeSetting>
  writes: SchemeWrites
  isLoading: Accessor<boolean>
  isError: Accessor<boolean>
  retry: () => void
}): JSX.Element {
  const [local] = splitProps(props, ['setting', 'writes', 'isLoading', 'isError', 'retry'])
  const [scope, setScope] = createSignal<SettingsScope>('project')
  const shownValue = (): SchemeValue => {
    if (scope() === 'project') return local.setting().value
    return schemeOfLayer(local.setting().layers.global) ?? FALLBACK_SCHEME
  }
  const pick = (value: SchemeValue) => {
    if (scope() === 'project') return local.writes.run(schemeWriteFor(value, local.setting().source))
    local.writes.run(applyGloballyWrite(value))
  }
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
            <ScopeSwitch scope={scope} onScope={setScope} />
          </div>
          <SchemeTiles value={shownValue} onPick={pick} />
          <Show
            when={local.writes.error()}
            fallback={<ProvenanceLine scope={scope} setting={local.setting} writes={local.writes} />}
          >
            {(writeError) => (
              <SettingsError
                message={writeError().message}
                retryLabel="Try again"
                onRetry={writeError().retryable ? () => local.writes.retryLast() : undefined}
              />
            )}
          </Show>
        </div>
      </Match>
    </Switch>
  )
}
