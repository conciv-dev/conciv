import {Show, splitProps, type Accessor, type JSX} from 'solid-js'
import {Menu} from '@conciv/ui-kit-system'
import ChevronDown from 'lucide-solid/icons/chevron-down'
import type {SettingsSource} from '@conciv/protocol/settings-types'
import type {SchemeSetting} from '../data/widget-settings.js'
import {
  applyGloballyWrite,
  forkToProjectWrite,
  resetWrite,
  useGlobalValueWrite,
  type SchemeWrites,
} from './scheme-writes.js'

const BADGE_TONE: Record<SettingsSource, string> = {
  project: 'chat-scope-badge-project',
  global: 'chat-scope-badge-global',
  default: 'chat-scope-badge-default',
}

const MENU_CONTENT = 'p-2 flex flex-col gap-1 w-64'
const MENU_CONTENT_STYLE = {
  background: 'var(--chat-bg)',
  'border-color': 'var(--chat-line)',
  'border-radius': 'var(--chat-radius-md)',
}
const MENU_ROW =
  'flex items-center gap-2 px-1 py-1.5 rounded-[var(--chat-radius-sm)] text-[12.5px] [color:var(--chat-text-2)] bg-transparent [border:none] cursor-pointer w-full text-start trans-color-bg hover:[background:var(--chat-fill)] hover:[color:var(--chat-text-hi)]'

export function ScopeBadge(props: {setting: Accessor<SchemeSetting>; writes: SchemeWrites}): JSX.Element {
  const [local] = splitProps(props, ['setting', 'writes'])
  const source = () => local.setting().source
  const label = () => source().toUpperCase()
  const globalIsSet = () => local.setting().layers.global.state === 'valid'

  return (
    <Menu.Root positioning={{placement: 'bottom-start'}}>
      <Menu.Trigger
        asChild={(triggerProps) => (
          <button
            {...triggerProps()}
            type="button"
            class={`chat-scope-badge  ${BADGE_TONE[source()]}`}
            disabled={local.writes.isPending()}
            aria-label={`Color scheme source: ${label()}. Change where it applies.`}
          >
            {label()}
            <ChevronDown class="chat-scope-badge-chevron" strokeWidth={2.5} aria-hidden="true" />
          </button>
        )}
      />
      <Menu.Positioner>
        <Menu.Content aria-label="Where the color scheme applies" class={MENU_CONTENT} style={MENU_CONTENT_STYLE}>
          <Show when={source() !== 'global'}>
            <Menu.Item
              class={MENU_ROW}
              value="global"
              onSelect={() => local.writes.run(applyGloballyWrite(local.setting().value))}
            >
              Apply to all projects
            </Menu.Item>
          </Show>
          <Show when={source() === 'global'}>
            <Menu.Item
              class={MENU_ROW}
              value="fork"
              onSelect={() => local.writes.run(forkToProjectWrite(local.setting().value))}
            >
              Set for this project only
            </Menu.Item>
          </Show>
          <Show when={source() === 'project' && globalIsSet()}>
            <Menu.Item class={MENU_ROW} value="use-global" onSelect={() => local.writes.run(useGlobalValueWrite())}>
              Use global value
            </Menu.Item>
          </Show>
          <Show when={source() !== 'default'}>
            <Menu.Item class={MENU_ROW} value="reset" onSelect={() => local.writes.run(resetWrite())}>
              Reset to default
            </Menu.Item>
          </Show>
        </Menu.Content>
      </Menu.Positioner>
    </Menu.Root>
  )
}
