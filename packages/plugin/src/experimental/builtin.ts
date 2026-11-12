import type {JSX} from 'solid-js'
import type {Json} from '../storage.js'
import {Registry, type StoreDeclaration, type StoreFrom, type StoreType} from './core.js'
import type {MountedSession} from './host-apis.js'

/**
 * An older home of a built-in's window value, imported once into a store that has no value yet: a `StoreFrom` key, or
 * a part of a shared app key, chosen by `pick`. The older home keeps its copy until the store is removed; a key it
 * picks a part of stays for its other owners, while the store keeps a marker that blocks the import.
 *
 * @example
 * ```ts
 * BuiltinStore.global(Prefs, { projectExpanded: true }, {
 *   key: "settings.v3",
 *   pick: (value: { sessionSummary?: unknown } | null) => value?.sessionSummary,
 * })
 * ```
 */
export type BuiltinStoreFrom =
  | StoreFrom
  | {
      /** The raw stored key that holds the older value. */
      readonly key: string
      /**
       * For session scope: `key` is a global key (e.g. "layout") whose field `sessions` holds every session's
       * state by the host's session key. pick receives only this session's entry, or undefined.
       */
      readonly sessions?: string
      /**
       * Returns the part of the older JSON this store keeps, or undefined for none. The store decodes it as it decodes
       * a stored value (see `StoreDeclaration.schema`). With `pick`, the older key stays for its other owners.
       *
       * @param value - The older key's parsed JSON, or null when it is missing; with `sessions`, this session's entry
       *   or undefined.
       */
      pick(value: unknown): unknown
    }

/** A `StoreDeclaration` whose older homes may be parts of shared app keys. Build one with `BuiltinStore`. */
export interface BuiltinStoreDeclaration<
  S extends StoreDeclaration['schema'] = StoreDeclaration['schema'],
  Scope extends 'global' | 'project' | 'session' = 'global' | 'project' | 'session',
> extends StoreDeclaration<S, Scope> {
  /** Older homes the value is imported from once, in place of `from`. See `BuiltinStoreFrom`. */
  readonly builtinFrom?: BuiltinStoreFrom | readonly BuiltinStoreFrom[]
}

/**
 * Declares a built-in's window state, as `Store` does, with older homes that may be parts of shared app keys.
 *
 * @example
 * ```ts
 * stores: { seen: BuiltinStore.global(Seen, {}, "highlights.v1") }
 * ```
 */
export const BuiltinStore: {
  /**
   * One value for every project, as `Store.global`.
   *
   * @param schema - Decodes the stored JSON; a zod object schema.
   * @param initial - The value before anything is stored.
   * @param from - Older homes to import the value from once.
   */
  global<S extends StoreDeclaration['schema']>(
    schema: S,
    initial: NoInfer<StoreType<S>>,
    from?: BuiltinStoreFrom | readonly BuiltinStoreFrom[],
  ): BuiltinStoreDeclaration<S, 'global'>
  /**
   * One value for this project, as `Store.project`.
   *
   * @param schema - Decodes the stored JSON; a zod object schema.
   * @param initial - The value before anything is stored.
   * @param from - Older homes to import the value from once.
   */
  project<S extends StoreDeclaration['schema']>(
    schema: S,
    initial: NoInfer<StoreType<S>>,
    from?: BuiltinStoreFrom | readonly BuiltinStoreFrom[],
  ): BuiltinStoreDeclaration<S, 'project'>
  /**
   * One value per session, as `Store.session`.
   *
   * @param schema - Decodes the stored JSON; a zod object schema.
   * @param initial - The value before anything is stored.
   * @param from - Older homes to import the value from once; `{ key, sessions, pick }` reads one session's entry of a
   *   global key.
   */
  session<S extends StoreDeclaration['schema']>(
    schema: S,
    initial: NoInfer<StoreType<S>>,
    from?: BuiltinStoreFrom | readonly BuiltinStoreFrom[],
  ): BuiltinStoreDeclaration<S, 'session'>
} = {
  global: (schema, initial, from) => ({scope: 'global', schema, initial, builtinFrom: from}),
  project: (schema, initial, from) => ({scope: 'project', schema, initial, builtinFrom: from}),
  session: (schema, initial, from) => ({scope: 'session', schema, initial, builtinFrom: from}),
}

/**
 * One finished tool call, as a `ToolCall` render receives it. Do not destructure: `session` is a getter.
 */
export interface ToolCallProps {
  /** The tool's name, as the plugin registered it. */
  readonly tool: string
  /** The call's id; the key a plugin's own per-call data is stored under. */
  readonly id: string
  /** The input the agent passed, as JSON. */
  readonly input: Json
  /**
   * How the call ended.
   * - `success`: `output` is the tool's result, as JSON.
   * - `error`: `error` is the message the tool failed with.
   */
  readonly result:
    | {
        /** The call succeeded. */
        readonly status: 'success'
        /** The tool's result, as JSON. */
        readonly output: Json
      }
    | {
        /** The call failed. */
        readonly status: 'error'
        /** The message the tool failed with. */
        readonly error: string
      }
  /** The routed session of the timeline that shows the call; a new object when another session is routed. */
  readonly session: MountedSession
}

/**
 * Fills the body of the card of a finished call of some tools, in place of the host's default body. The host draws
 * the card frame, its status and approval; the render only fills the body, once the call has finished. Returning
 * `undefined` keeps the host's default card.
 */
export interface ToolCall {
  /** The names of the tools whose cards you fill. When several contributions list a tool, the first contributed renders it. */
  readonly tools: readonly string[]
  /**
   * Renders one finished call's body once, under your plugin's context; its own reactivity updates it. Return
   * `undefined` to keep the host's default card. A render that throws records the error under your plugin and the
   * default card shows; the plugin keeps running.
   *
   * @param props - The finished call and its session. Do not destructure.
   * @returns Your UI for the card's body, or `undefined` to keep the default card.
   */
  render(props: ToolCallProps): JSX.Element | undefined
}

/**
 * The registry of tool card bodies, by tool name. Built-in plugins only.
 *
 * @example
 * ```tsx
 * ctx.add(ToolCall, {
 *   tools: ["page_screenshot"],
 *   render: (props) => (props.result.status === "success" ? <Shot call={props.id} /> : undefined),
 * })
 * ```
 */
export const ToolCall = Registry.define<ToolCall>('tool-call')
