import {For, Show, onCleanup, untrack, type JSX} from 'solid-js'
import {createStore} from 'solid-js/store'
import {Dynamic} from 'solid-js/web'
import {mapKeys, mapValues} from 'es-toolkit'
import {
  Panel,
  Server,
  SettingsPage,
  type Context,
  type Plugin,
  type PluginOptions,
  type SetupContext,
} from '@conciv/plugin/experimental'
import {PluginContext, pluginIconName} from '@conciv/plugin/experimental/host'
import {QueryClient, QueryClientProvider} from '@conciv/client'
import {registerIcons} from '@conciv/ui-kit-chat'
import {ToolRegistry} from '@internal/plugin'
import type {ToolProps} from '@conciv/ui-kit-chat/tools'
import type {ShellEngine} from './client.js'
import {createShell, persistedCell, type Shell} from './context.js'

export type ShellTool = ToolProps

export type Stores = NonNullable<Plugin.Declarations['stores']>

export type Icons = NonNullable<Plugin.Declarations['icons']>

export interface FakeAppProps<S extends Stores, I extends Icons> {
  readonly plugin: Plugin.Definition<S, I>
  readonly id: string
  readonly options: PluginOptions
  readonly engine: ShellEngine | undefined
  readonly tools: readonly ShellTool[]
  readonly children?: JSX.Element
}

type Declared = Context & {
  readonly stores: Readonly<Record<string, unknown>>
  readonly icons: Readonly<Record<string, string>>
}

function declaresAll<S extends Stores, I extends Icons>(
  context: Declared,
  plugin: Plugin.Definition<S, I>,
): context is Declared & SetupContext<Plugin.Definition<S, I>> {
  return (
    Object.keys(plugin.stores ?? {}).every((name) => Object.hasOwn(context.stores, name)) &&
    Object.keys(plugin.icons ?? {}).every((name) => Object.hasOwn(context.icons, name))
  )
}

function setUp<S extends Stores, I extends Icons>(shell: Shell, id: string, plugin: Plugin.Definition<S, I>): void {
  const icons: Icons = plugin.icons ?? {}
  const stores: Stores = plugin.stores ?? {}
  onCleanup(registerIcons(mapKeys(icons, (_source, name) => pluginIconName(id, name))))
  const context: Declared = {
    ...shell.context,
    stores: mapValues(stores, (declaration) =>
      declaration.scope === 'session' ? () => persistedCell(declaration.initial) : persistedCell(declaration.initial),
    ),
    icons: mapValues(icons, (_source, name) => pluginIconName(id, name)),
  }
  if (!declaresAll(context, plugin)) throw new Error(`the plugin ${id} declares stores or icons the shell did not make`)
  const cleanup = plugin.setup?.(context)
  if (cleanup !== undefined) onCleanup(() => void cleanup())
}

function ToolCard(props: {shell: Shell; tool: ShellTool}): JSX.Element {
  const entry = () => props.shell.context.list(ToolRegistry).find((item) => item.name === props.tool.tool)
  const component = () =>
    props.tool.status === 'error' ? (entry()?.errorComponent ?? entry()?.render) : entry()?.render
  return (
    <Show when={component()} fallback={<p>No card for {props.tool.tool}</p>}>
      {(render) => <Dynamic component={render()} {...props.tool} />}
    </Show>
  )
}

export function FakeApp<S extends Stores, I extends Icons>(props: FakeAppProps<S, I>): JSX.Element {
  const shell = untrack(() => createShell({id: props.id, options: props.options, engine: props.engine}))
  onCleanup(shell.dispose)
  untrack(() => setUp(shell, props.id, props.plugin))
  const queries = new QueryClient({defaultOptions: {queries: {retry: false}}})
  const [view, setView] = createStore<{tab?: string}>({})
  const screen = () => shell.context.screen.current()
  const tabs = () => {
    const current = screen()
    if (current === undefined) return []
    return shell.context
      .list(Panel)
      .flatMap((panel) =>
        panel
          .list({session: shell.session, screen: current, open: shell.state.open})
          .map((tab) => ({panel, tab, screen: current})),
      )
  }
  const selected = () => view.tab ?? tabs()[0]?.tab.id
  return (
    <QueryClientProvider client={queries}>
      <PluginContext.Provider value={shell.context}>
        <main aria-label="App shell" class="flex flex-col gap-3">
          <For each={shell.context.list(Server)}>
            {(server) => <For each={server.entries}>{(entry) => entry.cover?.({tab: undefined})}</For>}
          </For>
          <Show when={tabs().length > 0}>
            <div role="tablist" aria-label="Panels" class="flex gap-2">
              <For each={tabs()}>
                {(item) => (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={selected() === item.tab.id}
                    onClick={() => setView('tab', item.tab.id)}
                  >
                    {item.tab.title}
                  </button>
                )}
              </For>
            </div>
            <For each={tabs().filter((item) => item.tab.id === selected())}>
              {(item) => (
                <section role="tabpanel" aria-label={item.tab.title}>
                  {item.panel.render({tab: item.tab, session: shell.session, screen: item.screen})}
                </section>
              )}
            </For>
          </Show>
          <For each={shell.context.list(SettingsPage)}>
            {(page) => <section aria-label={page.title}>{page.render({})}</section>}
          </For>
          <For each={props.tools}>{(tool) => <ToolCard shell={shell} tool={tool} />}</For>
          {props.children}
          <textarea
            aria-label="Message the conciv agent"
            value={shell.state.composer.text}
            onInput={(event) => screen()?.composer.setText(event.currentTarget.value)}
          />
          <Show when={shell.state.composer.parts.length > 0}>
            <ul aria-label="Composer attachments">
              <For each={shell.state.composer.parts}>
                {(part) => <li>{part.type === 'file' ? part.path : part.type === 'note' ? part.label : part.text}</li>}
              </For>
            </ul>
          </Show>
          <For each={shell.state.toasts}>
            {(toast) => (
              <div role="status">
                {toast.title}
                {toast.description}
              </div>
            )}
          </For>
          <For each={shell.state.dialogs}>{(dialog) => dialog.render()}</For>
        </main>
      </PluginContext.Provider>
    </QueryClientProvider>
  )
}
