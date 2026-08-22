import {Link, Outlet, createFileRoute, useMatchRoute, useRouter} from '@tanstack/solid-router'
import {For, createMemo, createSignal, type JSX} from 'solid-js'
import {TooltipIconButton} from '@conciv/ui-kit-system'
import ArrowLeft from 'lucide-solid/icons/arrow-left'
import X from 'lucide-solid/icons/x'
import {usePanelChrome} from '../app/panel-chrome.js'
import {SettingsRail} from '../settings/settings-rail.js'
import {SETTINGS_GROUP_LABEL, SETTINGS_SECTIONS} from '../settings/settings-sections.js'

const RAIL =
  'flex h-15 shrink-0 box-border items-center gap-2.5 pe-3 ps-3 [border-block-end:1px_solid_var(--chat-line-soft)]'
const RAIL_LEFT = 'flex flex-1 flex-col min-w-0 gap-[2px]'
const RAIL_MICROLABEL =
  '[font-family:var(--chat-mono)] text-[9.5px] uppercase tracking-[0.14em] [color:var(--chat-microlabel)] whitespace-nowrap'
const RAIL_TITLE =
  'min-w-0 truncate [font-family:var(--chat-font-display)] text-[14.5px] font-semibold tracking-[-0.012em] [color:var(--chat-text-hi)] m-0'
const GHOST =
  'bg-transparent border border-transparent text-chat-text-2 cursor-pointer inline-flex items-center justify-center size-7 rounded-[var(--chat-radius-sm)] trans-color-bg hover:[background:var(--chat-fill)] hover:[border-color:var(--chat-line-soft)] hover:text-chat-text'

export const Route = createFileRoute('/panel/settings')({component: SettingsLayout})

function SettingsLayout(): JSX.Element {
  const router = useRouter()
  const panelChrome = usePanelChrome()
  const matchRoute = useMatchRoute()
  const [nav, setNav] = createSignal<HTMLElement | undefined>()
  const [groupLabel, setGroupLabel] = createSignal<HTMLElement | undefined>()
  const [list, setList] = createSignal<HTMLUListElement | undefined>()

  const activeIndex = createMemo(() => {
    const index = SETTINGS_SECTIONS.findIndex((section) => matchRoute({to: section.path}))
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
          <span class="chat-settings-nav-label" ref={setGroupLabel}>
            {SETTINGS_GROUP_LABEL}
          </span>
          <ul class="chat-settings-nav-list" ref={setList}>
            <For each={SETTINGS_SECTIONS}>
              {(section) => (
                <li class="chat-settings-nav-row">
                  <Link to={section.path} replace class="chat-settings-nav-link" activeProps={{'data-active': ''}}>
                    {section.label}
                  </Link>
                </li>
              )}
            </For>
          </ul>
          <SettingsRail root={nav} header={groupLabel} list={list} active={activeIndex} />
        </nav>
        <div class="chat-settings-content">
          <Outlet />
        </div>
      </div>
    </>
  )
}
