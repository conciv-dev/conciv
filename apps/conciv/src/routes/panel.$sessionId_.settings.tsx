import {Outlet, createFileRoute, useMatchRoute} from '@tanstack/solid-router'
import {For, type Component, type JSX} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import {Tabs, TooltipIconButton} from '@conciv/ui-kit-system'
import Palette from 'lucide-solid/icons/palette'
import PanelsTopLeft from 'lucide-solid/icons/panels-top-left'
import Keyboard from 'lucide-solid/icons/keyboard'
import Wrench from 'lucide-solid/icons/wrench'
import X from 'lucide-solid/icons/x'

const PAGE = 'flex flex-1 flex-col min-h-0'
const HEADER = 'flex h-13 shrink-0 items-center gap-2 ps-5 pe-3 [border-block-end:1px_solid_var(--chat-line-soft)]'
const TITLE =
  'flex-1 m-0 [font-family:var(--chat-font-display)] text-[0.9375rem] leading-[1.25] font-semibold tracking-[-0.012em] text-chat-text-hi'
const CLOSE = 'size-8'
const TAB_LIST = 'shrink-0 px-2 overflow-x-auto [scrollbar-width:none]'
const TAB = 'min-h-10 !px-2'
const PANEL = 'flex-1 min-h-0 overflow-y-auto p-4 !pt-4'

type SettingsTab = {
  id: 'appearance' | 'views' | 'shortcuts' | 'advanced'
  label: string
  icon: Component<{class?: string}>
}

const TABS: SettingsTab[] = [
  {id: 'appearance', label: 'Appearance', icon: Palette},
  {id: 'views', label: 'Views', icon: PanelsTopLeft},
  {id: 'shortcuts', label: 'Shortcuts', icon: Keyboard},
  {id: 'advanced', label: 'Advanced', icon: Wrench},
]

export const Route = createFileRoute('/panel/$sessionId_/settings')({component: SettingsLayout})

function SettingsLayout(): JSX.Element {
  const params = Route.useParams()
  const navigate = Route.useNavigate()
  const matchRoute = useMatchRoute()
  const matches = TABS.map((tab) => ({
    id: tab.id,
    match: matchRoute({from: Route.fullPath, to: `./${tab.id}`, fuzzy: true}),
  }))
  const current = () => matches.find((entry) => entry.match())?.id ?? 'appearance'
  const select = (id: string) => {
    const tab = TABS.find((candidate) => candidate.id === id)
    if (tab) void navigate({to: `./${tab.id}`})
  }
  const close = () =>
    void navigate({
      to: '/panel/$sessionId',
      params: {sessionId: params().sessionId},
      replace: true,
      state: {restoreFocus: 'settings'},
    })
  return (
    <div class={PAGE}>
      <header class={HEADER}>
        <h2 class={TITLE}>Settings</h2>
        <TooltipIconButton tooltip="Close settings" side="bottom" class={CLOSE} onClick={close}>
          <X class="size-4" strokeWidth={1.75} aria-hidden="true" />
        </TooltipIconButton>
      </header>
      <Tabs.Root class={PAGE} value={current()} onValueChange={(details) => select(details.value)}>
        <Tabs.List class={TAB_LIST} aria-label="Settings sections">
          <For each={TABS}>
            {(tab) => (
              <Tabs.Trigger class={TAB} value={tab.id}>
                <Dynamic component={tab.icon} class="size-3.5 shrink-0" aria-hidden="true" />
                {tab.label}
              </Tabs.Trigger>
            )}
          </For>
          <Tabs.Indicator />
        </Tabs.List>
        <Tabs.Content class={PANEL} value={current()}>
          <Outlet />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  )
}
