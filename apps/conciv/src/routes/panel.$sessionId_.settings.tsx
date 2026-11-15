import {
  Outlet,
  createFileRoute,
  retainSearchParams,
  stripSearchParams,
  useMatchRoute,
  useRouter,
} from '@tanstack/solid-router'
import {For, Show, createMemo, type Component, type JSX} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import {Switch, TabsPrimitive as Tabs, TooltipIconButton} from '@conciv/ui-kit-system'
import SlidersHorizontal from 'lucide-solid/icons/sliders-horizontal'
import LayoutPanelTop from 'lucide-solid/icons/layout-panel-top'
import Keyboard from 'lucide-solid/icons/keyboard'
import Shield from 'lucide-solid/icons/shield'
import ChevronLeft from 'lucide-solid/icons/chevron-left'
import Puzzle from 'lucide-solid/icons/puzzle'
import Box from 'lucide-solid/icons/box'
import {MICRO, SettingsHeader} from '../settings/settings-ui.js'
import {extensionSettingsPage} from '../settings/extension-fields.js'
import type {SettingsTabId} from '../settings/last-tab.js'
import type {SettingsScope} from '@conciv/contract'
import {settingsSearchSchema} from '../settings/settings-search-schemas.js'
import {useAppData, useAppQueryClient} from '../app/context.js'
import {usePluginListChange} from '../runtime/plugin/root.js'
import {createSettingsPages} from '../runtime/plugin/settings-pages.js'
import {panelKey} from '../runtime/plugin/panel-keys.js'
import {icons} from '../runtime/plugin/icons.js'

const PAGE = 'flex flex-1 flex-col min-h-0'
const BACK = 'size-8 shrink-0'
const SCOPE = 'min-h-11 px-1.5'
const SPLIT = 'flex flex-1 min-h-0 flex-row'
const RAIL =
  'relative flex flex-col shrink-0 gap-0.5 w-37.5 py-2.5 px-2 overflow-x-hidden overflow-y-auto [scrollbar-width:none] [border-inline-end:1px_solid_var(--chat-line-soft)]'
const TAB =
  'group relative z-1 flex shrink-0 items-center gap-2.25 py-2 px-2.5 rounded-[var(--chat-radius-sm)] bg-transparent [border:none] font-chat text-[0.78125rem] font-medium whitespace-nowrap text-start text-chat-text-2 cursor-pointer trans-color hover:text-chat-text-hi data-[selected]:text-chat-text-hi data-[focus-visible]:[outline:0.125rem_solid_var(--chat-accent)] data-[focus-visible]:[outline-offset:-0.125rem]'
const TAB_ICON = 'size-3.75 shrink-0 group-data-[selected]:text-chat-accent'
const INDICATOR =
  'rounded-[var(--chat-radius-sm)] bg-chat-fill-strong [left:var(--left)] [top:var(--top)] [width:var(--width)] [height:var(--height)] [--transition-duration:var(--chat-duration-slow)] [--transition-timing-function:var(--chat-ease-expo)] before:content-[""] before:absolute before:start-0 before:top-1.25 before:bottom-1.25 before:w-0.5 before:rounded-chat-pill before:bg-chat-accent'
const SPACER = 'flex-1 min-h-3'
const BODY = 'flex flex-1 min-h-0 min-w-0 flex-col overflow-y-auto p-3.5 focus-visible:outline-none'
const TAB_PAGE = 'flex shrink-0 flex-col gap-3.5 anim-rise [&>*]:shrink-0'
const FOOTER =
  'flex h-8.5 shrink-0 items-center justify-between px-4 [border-block-start:1px_solid_var(--chat-line-soft)]'
const SAVED_DOT = 'inline-block size-1.5 me-1.5 rounded-chat-pill bg-chat-success'
const ROUTE = `${MICRO} min-w-0 ps-3 truncate`

type TabFace = {
  label: string
  icon: Component<{class?: string}>
}

type BuiltinTab = TabFace & {id: SettingsTabId}

type SettingsTab = TabFace & {id: string; selected: () => unknown; open: () => void}

const MAIN_TABS: BuiltinTab[] = [
  {id: 'general', label: 'General', icon: SlidersHorizontal},
  {id: 'views', label: 'Views', icon: LayoutPanelTop},
  {id: 'shortcuts', label: 'Shortcuts', icon: Keyboard},
  {id: 'plugins', label: 'Plugins', icon: Box},
]
const ADVANCED_TAB: BuiltinTab = {id: 'advanced', label: 'Advanced', icon: Shield}

export const Route = createFileRoute('/panel/$sessionId_/settings')({
  validateSearch: settingsSearchSchema,
  search: {middlewares: [stripSearchParams({scope: 'project'}), retainSearchParams(['scope'])]},
  component: SettingsLayout,
})

function TabTrigger(props: {tab: SettingsTab}): JSX.Element {
  return (
    <Tabs.Trigger class={TAB} value={props.tab.id}>
      <Dynamic component={props.tab.icon} class={TAB_ICON} aria-hidden="true" />
      {props.tab.label}
    </Tabs.Trigger>
  )
}

function SettingsLayout(): JSX.Element {
  const params = Route.useParams()
  const navigate = Route.useNavigate()
  const context = Route.useRouteContext()
  const matchRoute = useMatchRoute()
  const router = useRouter()
  const search = Route.useSearch()
  const builtin = (tab: BuiltinTab): SettingsTab => ({
    ...tab,
    selected: matchRoute({from: Route.fullPath, to: `./${tab.id}`, fuzzy: tab.id !== 'plugins', includeSearch: false}),
    open: () => void navigate({to: `./${tab.id}`}),
  })
  const mainTabs = MAIN_TABS.map(builtin)
  const appData = useAppData()
  const queryClient = useAppQueryClient()
  usePluginListChange(() => void queryClient.invalidateQueries({queryKey: appData.utils.plugin.list.key()}))
  const advancedTab = builtin(ADVANCED_TAB)
  const extensionTabs = context()
    .extensions.filter((extension) => extension.settings)
    .map((extension): SettingsTab => ({
      id: `extensions/${extension.name}`,
      label: extensionSettingsPage(extension).title,
      icon: extension.icon ?? Puzzle,
      selected: matchRoute({
        to: '/panel/$sessionId/settings/extensions/$name',
        params: {name: extension.name},
        fuzzy: true,
        includeSearch: false,
      }),
      open: () =>
        void navigate({
          to: '/panel/$sessionId/settings/extensions/$name',
          params: {sessionId: params().sessionId, name: extension.name},
        }),
    }))
  const settingsPages = createSettingsPages()
  const pageTabs = createMemo(() =>
    settingsPages.pages().map((item): SettingsTab => {
      const page = panelKey(item.plugin, item.value.id)
      return {
        id: `plugins/${page}`,
        label: item.value.title,
        icon: item.value.icon ? icons[item.value.icon] : Puzzle,
        selected: matchRoute({
          to: '/panel/$sessionId/settings/plugins/$page',
          params: {page},
          includeSearch: false,
        }),
        open: () =>
          void navigate({
            to: '/panel/$sessionId/settings/plugins/$page',
            params: {sessionId: params().sessionId, page},
          }),
      }
    }),
  )
  const tabs = () => [...mainTabs, ...extensionTabs, ...pageTabs(), advancedTab]
  const current = () => tabs().find((tab) => tab.selected())?.id ?? 'general'
  const select = (id: string) =>
    tabs()
      .find((tab) => tab.id === id)
      ?.open()
  const changeScope = (scope: SettingsScope) =>
    void router.navigate({to: '.', search: (previous) => ({...previous, scope})})
  const close = () =>
    void navigate({
      to: '/panel/$sessionId',
      params: {sessionId: params().sessionId},
      replace: true,
      state: {restoreFocus: 'settings'},
    })
  return (
    <div class={PAGE}>
      <SettingsHeader
        title="Settings"
        leading={
          <TooltipIconButton tooltip="Back to chat" side="bottom" class={BACK} onClick={close}>
            <ChevronLeft class="size-4" strokeWidth={1.5} aria-hidden="true" />
          </TooltipIconButton>
        }
        actions={
          <Switch.Root
            class={SCOPE}
            checked={search().scope === 'global'}
            onCheckedChange={(details) => changeScope(details.checked ? 'global' : 'project')}
          >
            <Switch.Label>All projects</Switch.Label>
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
            <Switch.HiddenInput />
          </Switch.Root>
        }
      />
      <Tabs.Root
        class={SPLIT}
        value={current()}
        orientation="vertical"
        onValueChange={(details) => select(details.value)}
      >
        <Tabs.List class={RAIL} aria-label="Settings sections">
          <Tabs.Indicator class={INDICATOR} />
          <For each={[...mainTabs, ...extensionTabs, ...pageTabs()]}>{(tab) => <TabTrigger tab={tab} />}</For>
          <span class={SPACER} aria-hidden="true" />
          <TabTrigger tab={advancedTab} />
        </Tabs.List>
        <Tabs.Content class={BODY} value={current()}>
          <Show when={current()} keyed>
            <div class={TAB_PAGE}>
              <Outlet />
            </div>
          </Show>
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
