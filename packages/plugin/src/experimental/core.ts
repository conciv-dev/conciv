import type {z} from 'zod'
import type {ConcivClient} from '../servers.js'
import type {PluginOptions} from '../options.js'

export type {Json} from '../storage.js'
export type {PluginOptions} from '../options.js'

/**
 * Undoes a registration, or tears something down. Every `add` and `on` returns one, and so does a window's
 * `provide`; `onCleanup` and a setup's return value take one.
 * Calling it early withdraws at once; a second call does nothing. When the host runs it, a throw or a rejection is
 * logged and the other cleanups still run; main's `Scope` waits for a returned promise until its deadline.
 */
export type Cleanup = () => void | Promise<void>

/** The running app, with the fields engine plugins get in `ctx.app`. */
export interface App {
  /** The app's name, `conciv`, as in an engine plugin's `ctx.app.name`. */
  readonly name: string
  /**
   * The app version, e.g. `0.0.22`. It is `""` only in a window whose platform reports none, such as a test or
   * Storybook fixture, as no build-time version constant exists in every build.
   */
  readonly version: string
  /**
   * The release channel.
   * - `local`: a build from source, with no channel set.
   * - `dev`: the development channel.
   * - `beta`: the beta channel.
   * - `prod`: the stable release.
   */
  readonly channel: 'local' | 'dev' | 'beta' | 'prod'
  /**
   * Where the code runs.
   * - `web`: a browser tab.
   * - `desktop`: a desktop app.
   */
  readonly platform: 'web' | 'desktop'
  /** A packaged desktop app, not a development run. Always false on the web. */
  readonly packaged: boolean
}

declare const brand: unique symbol

/**
 * A token kind: a typed list that accepts contributions. The plugin or host that owns the registry decides how to
 * use its items; others `ctx.add` to it. Define one with `Registry.define`.
 *
 * @example
 * ```ts
 * export const Badge = Registry.define<{ readonly label: string }>("details.badge")
 * ctx.add(Badge, { label: "New" })
 * ```
 */
export interface Registry<T> {
  /** The token kind. */
  readonly kind: 'registry'
  /** The registry's id; contributions are grouped by it. */
  readonly id: string
  /** Carries the item type `T` at compile time only; never set. */
  readonly [brand]?: T
}

/**
 * A token kind: an in-process contract one plugin provides from its window entry and others read with `ctx.use`.
 * Any interface, no schema. Define one with `Contract.define` in the provider's `contract.ts`.
 *
 * @example
 * ```ts
 * export const FileTree = Contract.define<FileTree, "file.tree">("file.tree")
 * ctx.provide(FileTree, { open: (path) => reveal(path) })
 * ```
 */
export interface Contract<T, Id extends string = string> {
  /** The token kind. */
  readonly kind: 'contract'
  /** The contract's id: `<plugin id>` or `<plugin id>.<name>`. */
  readonly id: Id
  /** Carries the contract type `T` at compile time only; never set. */
  readonly [brand]?: T
}

/** Something a plugin provides under its id and other code reads with `ctx.use`: an in-process `Contract`. */
export type Token = Contract<unknown>

/** The value a token gives its users: the contract itself. */
export type TokenValue<T> = T extends Contract<infer V> ? V : never

/**
 * A provider as its users see it. The host returns one object per transition, so a reader re-runs only when the
 * provider changes.
 * - `pending`: the provider has not started yet, e.g. while its entry loads.
 * - `active`: `value` is the contract. `generation` counts activations: a provider that restarts comes back with a
 *   new one.
 * - `inactive`: the provider is gone, and `reason` says why: `disabled` (turned off or absent) or `failed` (its setup
 *   threw). A provider that restarts is `pending` until it is back.
 *
 * @example
 * ```ts
 * const live = ctx.use(Changes)()
 * if (live.status === "active") live.value.open(session)
 * ```
 */
export type Live<T> =
  | {
      /** The provider has not started yet. */
      readonly status: 'pending'
    }
  | {
      /** The provider is running. */
      readonly status: 'active'
      /** The contract. */
      readonly value: T
      /** Counts activations, starting at 1; each restart brings a new one. */
      readonly generation: number
    }
  | {
      /** The provider is gone. */
      readonly status: 'inactive'
      /**
       * Why the provider is gone.
       * - `disabled`: turned off or not composed.
       * - `failed`: its setup threw.
       */
      readonly reason: 'disabled' | 'failed'
    }

/**
 * What every window entry gets. The host adds the APIs it always provides as properties (`ctx.layout`,
 * `ctx.storage`, …), created on first read, and `provide` for the contracts it hosts.
 */
export interface BaseContext {
  /**
   * The plugin's options from the conciv config, as `ctx.options` in its engine part. Empty for a built-in.
   *
   * @example
   * ```ts
   * // plugins: [["conciv-acme", { team: "core" }]]
   * const team = ctx.options.team
   * ```
   */
  readonly options: PluginOptions
  /**
   * The client of the engine that runs the plugin. Call the plugin's engine part through it. A new client after that
   * engine restarts; read it where you call it. While the engine is unreachable, every call rejects. A built-in
   * plugin gets a client whose calls all reject.
   *
   * @example
   * ```ts
   * const result = await ctx.client.rpc(Acme).search({ query })
   * ```
   */
  readonly client: ConcivClient
  /**
   * The plugin's id, as its engine part's `Plugin.define` declares it.
   *
   * @example
   * ```ts
   * const key = `${ctx.id}:${tab.id}`
   * ```
   */
  readonly id: string
  /**
   * Aborts when the plugin is disabled or reloaded, or when the window closes. After an `await`, return if it
   * aborted. A window has no owner after an `await`, so listen to the signal for teardown that starts there.
   *
   * @example
   * ```ts
   * const config = await load({ signal: ctx.signal })
   * if (ctx.signal.aborted) return
   * ```
   */
  readonly signal: AbortSignal
  /**
   * Contributes an item that follows reactive state: the window re-runs the function when what it reads changes.
   * Return undefined to withdraw the item until it returns one again. The host withdraws it with the current owner
   * (a `createKeyed` run or a component), else with the plugin; made after that owner or the plugin ended, it is
   * withdrawn at once.
   *
   * @param registry - Where the item goes, such as `Command` or `Slot`.
   * @param item - Returns the item, or undefined for none.
   * @returns Withdraws the item early.
   *
   * @example
   * ```ts
   * ctx.add(Command, () => ({ id: "toggle", title: title(), run: toggle }))
   * ctx.add(Slot, () => (shown() ? chip : undefined))
   * ```
   */
  add<T>(registry: Registry<T>, item: () => T | undefined): Cleanup
  /**
   * Contributes a fixed item to a registry. The host withdraws it with the current owner (a `createKeyed` run or a
   * component), else with the plugin; made after that owner or the plugin ended, it is withdrawn at once. Use the
   * function form for an item that follows reactive state.
   *
   * @param registry - Where the item goes, such as `Command` or `Panel`.
   * @param item - The item.
   * @returns Withdraws the item early.
   *
   * @example
   * ```ts
   * ctx.add(Command, { id: "open", title: "Open", run: open })
   * ```
   */
  add<T>(registry: Registry<T>, item: T): Cleanup
  /**
   * The items every plugin contributed to a registry, in contribution order. Reactive. Use it for a registry your
   * plugin owns.
   *
   * @param registry - The registry to read.
   *
   * @example
   * ```ts
   * const badges = () => ctx.list(Badge)
   * ```
   */
  list<T>(registry: Registry<T>): readonly T[]
}

/**
 * An older home of a stored value, imported once into a store that has no value yet: a stored key of the same
 * storage, such as the key of a store the plugin renamed, e.g. `"plugin.acme.settings"`. Where `from` takes a list,
 * it names several older homes, newest first, and the first that holds a value is imported. The older home keeps its
 * copy until the store is removed.
 *
 * @example
 * ```ts
 * Store.global(Prefs, { expanded: true }, ["plugin.acme.settings.v2", "plugin.acme.settings"])
 * ```
 */
export type StoreFrom = string

/**
 * A store schema's decoded value, read-only as a stored value is: zod's output type with every field and entry
 * `readonly`. `update` hands out a `Mutable` draft of it.
 */
export type StoreType<S extends z.ZodObject> = ReadonlyDeep<z.output<S>>

type ReadonlyDeep<T> = T extends object ? {readonly [K in keyof T]: ReadonlyDeep<T[K]>} : T

/** A store a plugin declares in `Plugin.define({ stores })`. Build one with `Store.global`, `Store.project` or `Store.session`. */
export interface StoreDeclaration<
  S extends z.ZodObject = z.ZodObject,
  Scope extends 'global' | 'project' | 'session' = 'global' | 'project' | 'session',
> {
  /**
   * Where the value lives.
   * - `global`: one value for every project, loaded before setup.
   * - `project`: one value for this project, the repo the engine runs in, loaded before setup.
   * - `session`: one value per session, loaded when the session mounts.
   */
  readonly scope: Scope
  /**
   * Decodes the stored JSON; a zod object schema. A field that is missing or fails to decode takes its `initial`
   * value; a value that fails as a whole reads as `initial`.
   */
  readonly schema: S
  /** The value before anything is stored, and after `Storage.remove`. */
  readonly initial: StoreType<S>
  /** Older homes the value is imported from once. See `StoreFrom`. */
  readonly from?: StoreFrom | readonly StoreFrom[]
}

/**
 * Declares window state. The store's name in `stores` is its key, stored as `plugin.<id>.<name>`. The host loads
 * declared stores for you before they are read.
 *
 * @example
 * ```ts
 * stores: {
 *   prefs: Store.global(Prefs, { shown: true }, "plugin.acme.settings"),
 *   layout: Store.project(Layout, { columns: 2 }),
 *   view: Store.session(View, { open: [] }),
 * }
 * ```
 */
export const Store: {
  /**
   * One value for every project. The host loads every global store before setup, so `ctx.stores.name.value` is never
   * undefined. A load that fails fails the plugin's setup.
   *
   * @param schema - Decodes the stored JSON; a zod object schema.
   * @param initial - The value before anything is stored.
   * @param from - Older homes to import the value from once.
   */
  global<S extends z.ZodObject>(
    schema: S,
    initial: NoInfer<StoreType<S>>,
    from?: StoreFrom | readonly StoreFrom[],
  ): StoreDeclaration<S, 'global'>
  /**
   * One value for this project, the repo the engine runs in, kept with conciv's layered project settings. The host
   * loads every project store before setup, so `ctx.stores.name.value` is never undefined. A load that fails fails the
   * plugin's setup.
   *
   * @param schema - Decodes the stored JSON; a zod object schema.
   * @param initial - The value before anything is stored.
   * @param from - Older homes to import the value from once.
   */
  project<S extends z.ZodObject>(
    schema: S,
    initial: NoInfer<StoreType<S>>,
    from?: StoreFrom | readonly StoreFrom[],
  ): StoreDeclaration<S, 'project'>
  /**
   * One value per session. The host starts loading it when the session mounts, before its regions render;
   * `ctx.stores.name(session).value` is undefined until then.
   *
   * @param schema - Decodes the stored JSON; a zod object schema.
   * @param initial - The value before anything is stored.
   * @param from - Older homes to import the value from once.
   */
  session<S extends z.ZodObject>(
    schema: S,
    initial: NoInfer<StoreType<S>>,
    from?: StoreFrom | readonly StoreFrom[],
  ): StoreDeclaration<S, 'session'>
} = {
  global: (schema, initial, from) => ({scope: 'global', schema, initial, from}),
  project: (schema, initial, from) => ({scope: 'project', schema, initial, from}),
  session: (schema, initial, from) => ({scope: 'session', schema, initial, from}),
}

/**
 * Stored state. `V` is the value's type while it may still be loading: a global or project declared store uses `T`,
 * so `value` is never undefined.
 *
 * @example
 * ```ts
 * const prefs = ctx.stores.prefs
 * prefs.update((draft) => { draft.shown = !draft.shown })
 * prefs.set({ shown: true })
 * ```
 */
export interface Persisted<T, V = T | undefined> {
  /** The stored value; undefined until it has loaded. Reactive. */
  readonly value: V
  /** The stored value has loaded. Reactive. */
  ready(): boolean
  /**
   * Mutates a deep-mutable draft, even when the schema's fields are readonly. Return nothing or `undefined`;
   * returning a replacement is a compile error and throws at runtime. Use `set` to replace the value. It waits for
   * load and applies in call order with `set`.
   *
   * @param mutate - Edits a draft of the current value in place.
   */
  update(mutate: (draft: Mutable<T>) => undefined): void
  /**
   * Replaces the stored value. It waits for load and applies in call order with `update`. Use this for primitives or
   * to replace an object or collection.
   *
   * @param next - The complete next value, typed by the store's schema.
   */
  set(next: T): void
}

/** A stored value's writable draft, recursively removing readonly fields and collection entries. */
export type Mutable<T> = T extends object ? {-readonly [K in keyof T]: Mutable<T[K]>} : T

/** The stores a definition declares; `{}` when it declares none. */
export type DeclaredStores<D> = D extends {readonly stores?: infer M}
  ? M extends Readonly<Record<string, StoreDeclaration>>
    ? M
    : {}
  : {}

/**
 * Defines registries.
 *
 * @example
 * ```ts
 * export const Badge = Registry.define<{ readonly label: string }>("details.badge")
 * ```
 */
export const Registry: {
  /**
   * Creates a registry token.
   *
   * @param id - The registry's id; start it with your plugin's id.
   */
  define<T>(id: string): Registry<T>
} = {
  define: (id) => ({kind: 'registry', id}),
}

/**
 * Defines in-process contracts.
 *
 * @example
 * ```ts
 * export const Changes = Contract.define<Changes, "review.changes">("review.changes")
 * ```
 */
export const Contract: {
  /**
   * Creates a contract token.
   *
   * @param id - The contract's id: your plugin's id, or `<id>.<name>`. Only that plugin may provide it.
   */
  define<T, const Id extends string>(id: Id): Contract<T, Id>
} = {
  define: (id) => ({kind: 'contract', id}),
}
