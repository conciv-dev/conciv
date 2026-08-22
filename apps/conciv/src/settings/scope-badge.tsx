import {Show, createMemo, createSignal, splitProps, type Accessor, type JSX} from 'solid-js'
import {useQuery, type QueryClient} from '@tanstack/solid-query'
import {Menu} from '@conciv/ui-kit-system'
import Check from 'lucide-solid/icons/check'
import type {SettingsLogEntry, SettingsScope} from '@conciv/protocol/settings-types'
import type {AppData} from '../data/app-data.js'
import type {SchemeSetting} from '../data/widget-settings.js'
import {applyGloballyWrite, resetWrite, useGlobalValueWrite, type SchemeWrites} from './scheme-writes.js'

const BADGE =
  'chat-scope-badge relative inline-flex items-center gap-1 px-1.5 py-0.5 [font-family:var(--chat-mono)] text-[9.5px] uppercase tracking-[0.12em] [color:var(--chat-microlabel)] bg-transparent [border:1px_solid_var(--chat-line-soft)] rounded-[var(--chat-radius-chip)] cursor-pointer trans-color-bg hover:[color:var(--chat-text-2)] hover:[background:var(--chat-fill)] disabled:opacity-50 disabled:cursor-default'
const FLASH = 'chat-saved-flash inline-flex items-center [color:var(--chat-success)]'

function newestGlobalRow(rows: SettingsLogEntry[]): SettingsLogEntry | undefined {
  return rows
    .filter((row) => row.scope === 'global')
    .reduce<SettingsLogEntry | undefined>((newest, row) => (newest && newest.id > row.id ? newest : row), undefined)
}

export function ScopeBadge(props: {
  setting: Accessor<SchemeSetting>
  writes: SchemeWrites
  data: AppData
  queryClient: QueryClient
}): JSX.Element {
  const [local] = splitProps(props, ['setting', 'writes', 'data', 'queryClient'])
  const [open, setOpen] = createSignal(false)
  const history = useQuery(
    () => local.data.utils.settings.history.queryOptions({input: {key: 'scheme'}, enabled: open()}),
    () => local.queryClient,
  )
  const globalRow = createMemo(() => (history.isSuccess ? newestGlobalRow(history.data ?? []) : undefined))
  const globalIsSet = createMemo(() => {
    const row = globalRow()
    return row !== undefined && row.value !== null
  })
  const source = () => local.setting().source
  const label = () => source().toUpperCase()
  const resetLayers = (): SettingsScope[] => {
    if (source() === 'global') return ['global']
    return globalIsSet() ? ['project', 'global'] : ['project']
  }

  return (
    <Menu.Root open={open()} onOpenChange={(details) => setOpen(details.open)} positioning={{placement: 'bottom-end'}}>
      <Menu.Trigger
        asChild={(triggerProps) => (
          <button
            {...triggerProps()}
            type="button"
            class={BADGE}
            disabled={local.writes.isPending()}
            aria-label={`Color scheme source: ${label()}. Change where it applies.`}
          >
            {label()}
            <Show when={local.writes.savedAt()} keyed>
              <span class={FLASH} aria-hidden="true">
                <Check class="size-3 block" strokeWidth={2.25} />
              </span>
            </Show>
          </button>
        )}
      />
      <Menu.Positioner>
        <Menu.Content aria-label="Where the color scheme applies">
          <Menu.Item value="global" onSelect={() => local.writes.run(applyGloballyWrite(local.setting().value))}>
            Apply to all projects
          </Menu.Item>
          <Show when={source() === 'project' && globalIsSet()}>
            <Menu.Item value="use-global" onSelect={() => local.writes.run(useGlobalValueWrite())}>
              Use global value
            </Menu.Item>
          </Show>
          <Show when={source() !== 'default'}>
            <Menu.Item value="reset" onSelect={() => local.writes.run(resetWrite(resetLayers()))}>
              Reset to default
            </Menu.Item>
          </Show>
        </Menu.Content>
      </Menu.Positioner>
    </Menu.Root>
  )
}
