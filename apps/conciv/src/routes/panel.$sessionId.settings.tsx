import {Link, Outlet, createFileRoute, useMatchRoute, useRouter} from '@tanstack/solid-router'
import {For, Show, createMemo, createSignal, type Component, type JSX} from 'solid-js'
import {TooltipIconButton} from '@conciv/ui-kit-system'
import ArrowLeft from 'lucide-solid/icons/arrow-left'
import Keyboard from 'lucide-solid/icons/keyboard'
import Palette from 'lucide-solid/icons/palette'
import Plug from 'lucide-solid/icons/plug'
import X from 'lucide-solid/icons/x'
import {usePanelChrome} from '../app/panel-chrome.js'
import {SettingsRail} from '../settings/settings-rail.js'
import {SETTINGS_NAV_LABEL, SETTINGS_SECTIONS, type SettingsSectionId} from '../settings/settings-sections.js'

const RAIL =
  'flex h-15 shrink-0 box-border items-center gap-2.5 pe-3 ps-4 [border-block-end:1px_solid_var(--chat-line-soft)]'
const RAIL_LEFT = 'flex flex-1 flex-col min-w-0 gap-[2px]'
const RAIL_MICROLABEL =
  '[font-family:var(--chat-mono)] text-[9.5px] uppercase tracking-[0.14em] [color:var(--chat-microlabel)] whitespace-nowrap'
const RAIL_TITLE =
  'min-w-0 truncate [font-family:var(--chat-font-display)] text-[14.5px] font-semibold tracking-[-0.012em] [color:var(--chat-text-hi)] m-0'
const GHOST =
  'bg-transparent border border-transparent text-chat-text-2 cursor-pointer inline-flex items-center justify-center size-7 rounded-[var(--chat-radius-sm)] trans-color-bg hover:[background:var(--chat-fill)] hover:[border-color:var(--chat-line-soft)] hover:text-chat-text'

const SECTION_ICONS: Record<SettingsSectionId, Component<{class?: string; 'aria-hidden'?: boolean}>> = {
  appearance: Palette,
  composer: Keyboard,
  connection: Plug,
}

export const Route = createFileRoute('/panel/settings')({component: SettingsLayout})

function SettingsLayout(): JSX.Element {
  const router = useRouter()
  const panelChrome = usePanelChrome()
  const matchRoute = useMatchRoute()
  const [nav, setNav] = createSignal<HTMLElement | undefined>()
  const [navLabel, setNavLabel] = createSignal<HTMLElement | undefined>()
  const [list, setList] = createSignal<HTMLUListElement | undefined>()

  const activeIndex = createMemo(() => {
    const index = SETTINGS_SECTIONS.findIndex((section) => section.path && matchRoute({to: section.path}))
    return index < 0 ? 0 : index
  })
  const activeLabel = () => SETTINGS_SECTIONS[activeIndex()]?.label ?? 'Settings'

  return (
    <>
      <header class={RAIL}>
        <TooltipIconButton tooltip="Back to the conversation" class={GHOST} onClick={() => router.history.back()}>
          <ArrowLeft class="size-4 block" strokeWidth={1.75} aria-hidden="true" />
        </TooltipIconButton>
        <div class={RAIL_LEFT}>
          <span class={RAIL_MICROLABEL}>SETTINGS</span>
          <h2 class={RAIL_TITLE}>{activeLabel()}</h2>
        </div>
        <TooltipIconButton tooltip="Close chat" class={GHOST} onClick={() => panelChrome.close()}>
          <X class="size-3.5 block" strokeWidth={1.75} aria-hidden="true" />
        </TooltipIconButton>
      </header>
      <div class="chat-settings-body">
        <nav class="chat-settings-nav" aria-label="Settings sections" ref={setNav}>
          <span class="chat-settings-nav-label" ref={setNavLabel}>
            {SETTINGS_NAV_LABEL}
          </span>
          <ul class="chat-settings-nav-list" ref={setList}>
            <For each={SETTINGS_SECTIONS}>
              {(section) => {
                const Icon = SECTION_ICONS[section.id]
                return (
                  <li class="chat-settings-nav-row">
                    <Show
                      when={section.path}
                      keyed
                      fallback={
                        <span class="chat-settings-nav-link" aria-disabled="true">
                          <Icon class="chat-settings-nav-icon" aria-hidden={true} />
                          {section.label}
                        </span>
                      }
                    >
                      {(path) => (
                        <Link to={path} replace class="chat-settings-nav-link" activeProps={{'data-active': ''}}>
                          <Icon class="chat-settings-nav-icon" aria-hidden={true} />
                          {section.label}
                        </Link>
                      )}
                    </Show>
                  </li>
                )
              }}
            </For>
          </ul>
          <SettingsRail root={nav} header={navLabel} list={list} active={activeIndex} />
        </nav>
        <div class="chat-settings-content">
          <Outlet />
        </div>
      </div>
    </>
  )
}
