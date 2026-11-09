import {Outlet, createFileRoute, useMatchRoute} from '@tanstack/solid-router'
import {For, type Component, type JSX} from 'solid-js'
import {createStore} from 'solid-js/store'
import {Dynamic} from 'solid-js/web'
import {createResizeObserver} from '@solid-primitives/resize-observer'
import {TabsPrimitive as Tabs, TooltipIconButton} from '@conciv/ui-kit-system'
import SlidersHorizontal from 'lucide-solid/icons/sliders-horizontal'
import LayoutPanelTop from 'lucide-solid/icons/layout-panel-top'
import Keyboard from 'lucide-solid/icons/keyboard'
import Shield from 'lucide-solid/icons/shield'
import ChevronLeft from 'lucide-solid/icons/chevron-left'
import {MICRO} from '../settings/settings-ui.js'
import {writeLastTab, type SettingsTabId} from '../settings/last-tab.js'

const PAGE = 'flex flex-1 flex-col min-h-0'
const HEADER = 'flex h-13 shrink-0 items-center gap-1.5 px-2 [border-block-end:1px_solid_var(--chat-line-soft)]'
const TITLE =
  'flex-1 m-0 [font-family:var(--chat-font-display)] text-[0.9375rem] font-semibold text-chat-text-hi leading-[1.25]'
const BACK = 'size-9 shrink-0'
const SPLIT = 'flex flex-1 min-h-0 flex-col @lg:flex-row'
const RAIL =
  'relative flex shrink-0 gap-0.5 pt-1.5 px-2 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [border-block-end:1px_solid_var(--chat-line-soft)] @lg:flex-col @lg:w-37.5 @lg:py-2.5 @lg:overflow-x-hidden @lg:overflow-y-auto @lg:[border-block-end:none] @lg:[border-inline-end:1px_solid_var(--chat-line-soft)]'
const TAB =
  'group relative z-1 flex shrink-0 items-center gap-2.25 py-2 px-2.5 rounded-t-[var(--chat-radius-sm)] @lg:rounded-[var(--chat-radius-sm)] bg-transparent [border:none] font-chat text-[0.78125rem] font-medium whitespace-nowrap text-start text-chat-text-2 cursor-pointer trans-color hover:text-chat-text-hi data-[selected]:text-chat-text-hi data-[focus-visible]:[outline:0.125rem_solid_var(--chat-accent)] data-[focus-visible]:[outline-offset:-0.125rem]'
const TAB_ICON = 'size-3.75 shrink-0 group-data-[selected]:text-chat-accent'
const INDICATOR =
  'rounded-t-[var(--chat-radius-sm)] @lg:rounded-[var(--chat-radius-sm)] bg-chat-fill-strong [left:var(--left)] [top:var(--top)] [width:var(--width)] [height:var(--height)] [--transition-duration:var(--chat-duration-slow)] [--transition-timing-function:var(--chat-ease-expo)] before:content-[""] before:absolute before:inset-x-0 before:bottom-0 before:h-0.5 before:rounded-chat-pill before:bg-chat-accent @lg:before:inset-x-auto @lg:before:start-0 @lg:before:top-1.25 @lg:before:bottom-1.25 @lg:before:w-0.5 @lg:before:h-auto'
const SPACER = 'hidden @lg:block flex-1 min-h-3'
const BODY =
  'flex flex-1 min-h-0 min-w-0 flex-col gap-3.5 overflow-y-auto p-3.5 focus-visible:outline-none [&>*]:shrink-0'
const FOOTER =
  'flex h-8.5 shrink-0 items-center justify-between px-4 [border-block-start:1px_solid_var(--chat-line-soft)]'
const SAVED_DOT = 'inline-block size-1.5 me-1.5 rounded-chat-pill bg-chat-success'
const ROUTE = `${MICRO} min-w-0 ps-3 truncate`

type SettingsTab = {
  id: SettingsTabId
  label: string
  icon: Component<{class?: string}>
}

const MAIN_TABS: SettingsTab[] = [
  {id: 'general', label: 'General', icon: SlidersHorizontal},
  {id: 'views', label: 'Views', icon: LayoutPanelTop},
  {id: 'shortcuts', label: 'Shortcuts', icon: Keyboard},
]
const ADVANCED_TAB: SettingsTab = {id: 'advanced', label: 'Advanced', icon: Shield}
const TABS = [...MAIN_TABS, ADVANCED_TAB]

type Placed = {element: Element; left: number; top: number}

export const Route = createFileRoute('/panel/$sessionId_/settings')({component: SettingsLayout})

function milliseconds(value: string): number {
  const amount = Number.parseFloat(value)
  if (Number.isNaN(amount)) return 0
  return value.trim().endsWith('ms') ? amount : amount * 1000
}

function glide(previous: readonly Placed[], current: readonly Placed[]): void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  for (const {element, left, top} of current) {
    const before = previous.find((entry) => entry.element === element)
    if (!before) continue
    const style = getComputedStyle(element)
    const dx = before.left - left
    const dy = before.top - top
    element.animate([{transform: `translate(${dx}px, ${dy}px)`}, {transform: 'none'}], {
      duration: milliseconds(style.getPropertyValue('--chat-duration-slow')),
      easing: style.getPropertyValue('--chat-ease-expo').trim() || 'ease-out',
    })
  }
}

function TabTrigger(props: {tab: SettingsTab}): JSX.Element {
  return (
    <Tabs.Trigger class={TAB} value={props.tab.id} data-glide="">
      <Dynamic component={props.tab.icon} class={TAB_ICON} aria-hidden="true" />
      {props.tab.label}
    </Tabs.Trigger>
  )
}

function SettingsLayout(): JSX.Element {
  const params = Route.useParams()
  const navigate = Route.useNavigate()
  const matchRoute = useMatchRoute()
  const [layout, setLayout] = createStore<{orientation: 'horizontal' | 'vertical'}>({orientation: 'horizontal'})
  let split: HTMLDivElement | undefined
  let rail: HTMLDivElement | undefined
  let placed: Placed[] = []
  const matches = TABS.map((tab) => ({
    id: tab.id,
    match: matchRoute({from: Route.fullPath, to: `./${tab.id}`, fuzzy: true}),
  }))
  const current = () => matches.find((entry) => entry.match())?.id ?? 'general'
  const select = (id: string) => {
    const tab = TABS.find((candidate) => candidate.id === id)
    if (!tab) return
    writeLastTab(tab.id)
    void navigate({to: `./${tab.id}`})
  }
  const close = () =>
    void navigate({
      to: '/panel/$sessionId',
      params: {sessionId: params().sessionId},
      replace: true,
      state: {restoreFocus: 'settings'},
    })
  createResizeObserver(
    () => split,
    () => {
      if (!split || !rail) return
      const orientation = getComputedStyle(rail).flexDirection === 'column' ? 'vertical' : 'horizontal'
      const origin = split.getBoundingClientRect()
      const next = [...split.querySelectorAll('[data-glide]')].map((element) => {
        const rect = element.getBoundingClientRect()
        return {element, left: rect.left - origin.left, top: rect.top - origin.top}
      })
      if (orientation !== layout.orientation) {
        setLayout('orientation', orientation)
        glide(placed, next)
      }
      placed = next
    },
  )
  return (
    <div class={PAGE}>
      <header class={HEADER}>
        <TooltipIconButton tooltip="Back to chat" side="bottom" class={BACK} onClick={close}>
          <ChevronLeft class="size-4" strokeWidth={1.5} aria-hidden="true" />
        </TooltipIconButton>
        <h2 class={TITLE}>Settings</h2>
      </header>
      <Tabs.Root
        ref={(element: HTMLDivElement) => {
          split = element
        }}
        class={SPLIT}
        value={current()}
        orientation={layout.orientation}
        onValueChange={(details) => select(details.value)}
      >
        <Tabs.List
          ref={(element: HTMLDivElement) => {
            rail = element
          }}
          class={RAIL}
          aria-label="Settings sections"
        >
          <Tabs.Indicator class={INDICATOR} />
          <For each={MAIN_TABS}>{(tab) => <TabTrigger tab={tab} />}</For>
          <span class={SPACER} aria-hidden="true" />
          <TabTrigger tab={ADVANCED_TAB} />
        </Tabs.List>
        <Tabs.Content class={BODY} value={current()} data-glide="">
          <Outlet />
        </Tabs.Content>
      </Tabs.Root>
      <footer class={FOOTER}>
        <span class={MICRO}>
          <span class={SAVED_DOT} aria-hidden="true" />
          Saved automatically
        </span>
        <span class={ROUTE}>{`${Route.fullPath}/${current()}`}</span>
      </footer>
    </div>
  )
}
