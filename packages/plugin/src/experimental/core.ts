import type {StandardSchemaV1} from '@standard-schema/spec'
import type {ConcivClient} from '../client/promise/index.js'

export type Json = string | number | boolean | null | readonly Json[] | {readonly [key: string]: Json}

export type PluginOptions = {readonly [key: string]: Json}

export type Cleanup = () => void | Promise<void>

export interface App {
  readonly name: string
  readonly version: string
  readonly channel: 'local' | 'dev' | 'beta' | 'prod'
  readonly platform: 'web' | 'desktop'
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
  readonly kind: 'registry'
  readonly id: string
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
  readonly kind: 'contract'
  readonly id: Id
  readonly [brand]?: T
}

export type Token = Contract<unknown>

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
      readonly status: 'pending'
    }
  | {
      readonly status: 'active'
      readonly value: T
      readonly generation: number
    }
  | {
      readonly status: 'inactive'
      readonly reason: 'disabled' | 'failed'
    }

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

export type StoreType<S extends StoreSchema> = ReadonlyDeep<StandardSchemaV1.InferOutput<S>>

type StoreSchema = StandardSchemaV1<unknown, object>

type ReadonlyDeep<T> = T extends object ? {readonly [K in keyof T]: ReadonlyDeep<T[K]>} : T

export interface StoreDeclaration<
  S extends StoreSchema = StoreSchema,
  Scope extends 'global' | 'project' | 'session' = 'global' | 'project' | 'session',
> {
  readonly scope: Scope
  readonly schema: S
  readonly initial: StoreType<S>
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
   * @param schema - Decodes the stored JSON; an object schema.
   * @param initial - The value before anything is stored.
   * @param from - Older homes to import the value from once.
   */
  global<S extends StoreSchema>(
    schema: S,
    initial: NoInfer<StoreType<S>>,
    from?: StoreFrom | readonly StoreFrom[],
  ): StoreDeclaration<S, 'global'>
  /**
   * One value for this project, the repo the engine runs in, kept with conciv's layered project settings. The host
   * loads every project store before setup, so `ctx.stores.name.value` is never undefined. A load that fails fails the
   * plugin's setup.
   *
   * @param schema - Decodes the stored JSON; an object schema.
   * @param initial - The value before anything is stored.
   * @param from - Older homes to import the value from once.
   */
  project<S extends StoreSchema>(
    schema: S,
    initial: NoInfer<StoreType<S>>,
    from?: StoreFrom | readonly StoreFrom[],
  ): StoreDeclaration<S, 'project'>
  /**
   * One value per session. The host starts loading it when the session mounts, before its regions render;
   * `ctx.stores.name(session).value` is undefined until then.
   *
   * @param schema - Decodes the stored JSON; an object schema.
   * @param initial - The value before anything is stored.
   * @param from - Older homes to import the value from once.
   */
  session<S extends StoreSchema>(
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
  readonly value: V
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

export type Mutable<T> = T extends object ? {-readonly [K in keyof T]: Mutable<T[K]>} : T

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
