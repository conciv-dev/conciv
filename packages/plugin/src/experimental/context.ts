import type {Accessor} from 'solid-js'
import type {
  BaseContext,
  App,
  Cleanup,
  Contract,
  DeclaredStores,
  Live,
  Persisted,
  StoreDeclaration,
  StoreType,
  Token,
  TokenValue,
} from './core.js'
import type {
  Appearance,
  Attention,
  Commands,
  Desktop,
  Dialogs,
  Keybinds,
  Layout,
  Links,
  Router,
  Screen,
  Servers,
  SessionRef,
  Sessions,
  Storage,
  System,
  Tabs,
  Toasts,
  Ui,
} from './host-apis.js'

/**
 * What every window entry gets. Contracts are provided and read at runtime: `ctx.provide` for your own, `ctx.use` for
 * other plugins'. The APIs the host always provides are properties, each created on first read.
 * Setup runs under the plugin's root owner: Solid's `onCleanup` in setup runs when the plugin goes away.
 * `usePlugin()` returns the same object inside contributions.
 */
export interface Context extends BaseContext {
  /**
   * Provides an in-process contract. Withdrawn with the current owner, else with the plugin. Throws for a contract
   * whose id is not your plugin's id or under it (`<id>.<name>`).
   *
   * @param token - The contract.
   * @param impl - Its implementation.
   * @returns Withdraws the contract early.
   *
   * @example
   * ```ts
   * ctx.provide(Changes, { diffs, open })
   * ```
   */
  provide<C extends Contract<unknown>>(token: C, impl: TokenValue<C>): Cleanup
  /**
   * Follows a contract that another plugin provides. Returns a `Live` accessor: pending while its provider loads,
   * active with its value, inactive while it is turned off or failed. The plugin must keep working while it is
   * inactive. Branch on it, or follow it with `createKeyed`. The provider is the plugin whose id the token's id names.
   *
   * @param token - The contract.
   * @returns The provider as a `Live` accessor; the same accessor for every call with the token.
   *
   * @example
   * ```ts
   * createKeyed(ctx.use(Changes), (changes) => changes.watch(screen, "files"))
   * ```
   */
  use<T extends Token>(token: T): Accessor<Live<TokenValue<T>>>
  /**
   * Panel tabs, scroll offsets, and the settings page.
   *
   * @example
   * ```ts
   * ctx.layout.open(`${ctx.id}:main`, session, { background: true })
   * ```
   */
  readonly layout: Layout
  /**
   * The sessions of open shell tabs, and the mounted one.
   *
   * @example
   * ```ts
   * const session = ctx.sessions.current()
   * ```
   */
  readonly sessions: Sessions
  /**
   * The mounted session screen and its route-following composer. Read it where you act, so an action targets the
   * session routed at that moment; a `MountedSession` carries no such actions.
   *
   * @example
   * ```ts
   * const screen = ctx.screen.current()
   * if (screen) screen.composer.attach({ type: "file", path })
   * ```
   */
  readonly screen: Screen
  /**
   * Stores for keys only known at runtime, and window-local memory. Declare `stores` for keys known up front.
   *
   * @example
   * ```ts
   * const recent = ctx.storage.store(`recent.${server}`, { schema: Recent, initial: { paths: [] } })
   * ```
   */
  readonly storage: Storage
  /**
   * Not implemented yet. Always undefined in this version.
   *
   * The clipboard, saving files, and opening URLs in a new browser tab.
   *
   * @example
   * ```ts
   * await ctx.system?.copy(url)
   * ```
   */
  readonly system: System | undefined
  /**
   * Abilities on the user's machine, through the engine: opening a file in the user's editor.
   *
   * @example
   * ```ts
   * if (!ctx.desktop) return
   * void ctx.desktop.launch(path, { line: 12 })
   * ```
   */
  readonly desktop: Desktop | undefined
  /**
   * Not implemented yet. Always undefined in this version.
   *
   * Dialogs that close with the owner that opened them, else when the plugin goes away.
   *
   * @example
   * ```ts
   * ctx.dialogs?.open((dialog) => <ConfirmDialog onDone={dialog.close} />)
   * ```
   */
  readonly dialogs: Dialogs | undefined
  /**
   * Short messages in a corner of the window. A plugin's toasts close when it goes away.
   *
   * @example
   * ```ts
   * const saving = ctx.toast.show({ title: "Saving", variant: "loading", persistent: true })
   * await save()
   * saving.dismiss()
   * ```
   */
  readonly toast: Toasts
  /**
   * The open session tabs across engines: list, open, show and close them.
   *
   * @example
   * ```ts
   * ctx.tabs.open({ server: session.server.id, id: session.id }, { focus: true })
   * ```
   */
  readonly tabs: Tabs
  /**
   * Not implemented yet. Always undefined in this version.
   *
   * System notifications and sounds that follow the user's notification settings, for when they look elsewhere.
   *
   * @example
   * ```ts
   * void ctx.attention?.notify({ title: "Tests done", session: { server: session.server.id, id: session.id } })
   * ```
   */
  readonly attention: Attention | undefined
  /**
   * Not implemented yet. Always undefined in this version.
   *
   * Runs published plugin commands and the app's own.
   *
   * @example
   * ```ts
   * if (!ctx.commands?.run("terminal.toggle")) ctx.toast.show({ title: "No terminal" })
   * ```
   */
  readonly commands: Commands | undefined
  /**
   * Routes local links to the plugins that handle them.
   *
   * @example
   * ```ts
   * ctx.links.open({ href: path, session, exact: true })
   * ```
   */
  readonly links: Links
  /**
   * The app's own components: icons, buttons, tooltips, menus and menu rows, the loading indicator, the dialog frame,
   * switches, text fields, selects, keybind chips, Markdown, highlighted code, and settings pages, sections and rows.
   *
   * @example
   * ```tsx
   * <ctx.ui.Button icon="check" onClick={apply}>Apply</ctx.ui.Button>
   * ```
   */
  readonly ui: Ui
  /**
   * The running app: its version, release channel and platform, as `ctx.app` in engine plugins.
   *
   * @example
   * ```ts
   * if (ctx.app.channel === "dev") showDebug()
   * ```
   */
  readonly app: App
  /**
   * The user's appearance settings.
   *
   * @example
   * ```ts
   * terminal.options.fontFamily = ctx.appearance.font("mono")
   * ```
   */
  readonly appearance: Appearance
  /**
   * The app's route.
   *
   * @example
   * ```ts
   * const onSettings = () => ctx.router.path().includes("/settings")
   * ```
   */
  readonly router: Router
  /**
   * The effective keybinds of published commands.
   *
   * @example
   * ```ts
   * const keys = () => ctx.keybinds.keybind(`${ctx.id}.toggle`)
   * ```
   */
  readonly keybinds: Keybinds
  /**
   * The servers the app lists: their ids, and each one's live `ServerRef`.
   *
   * @example
   * ```ts
   * const known = () => new Set(ctx.servers.list())
   * const server = (id: string) => ctx.servers.get(id)
   * ```
   */
  readonly servers: Servers
}

type Handle<S> =
  S extends StoreDeclaration<infer Schema, infer Scope>
    ? Scope extends 'global' | 'project'
      ? Persisted<StoreType<Schema>, StoreType<Schema>>
      : (session: SessionRef) => Persisted<StoreType<Schema>>
    : never

/** The context `Plugin.Setup<typeof definition>` receives: the host's members, and the definition's declared stores. */
export interface SetupContext<D> extends Context {
  /**
   * Each declared store, by its name in `stores`. A global or project store is a `Persisted` that has loaded before
   * setup; a session store is a function of the session whose `value` is undefined until that session's store loads.
   *
   * @example
   * ```ts
   * const shown = () => ctx.stores.prefs.value.shown
   * const open = (session: SessionRef) => ctx.stores.view(session).value?.open ?? []
   * ```
   */
  readonly stores: {readonly [K in keyof DeclaredStores<D>]: Handle<DeclaredStores<D>[K]>}
}
