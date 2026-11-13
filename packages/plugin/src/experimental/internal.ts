import {createContext, type Accessor, type JSX} from 'solid-js'
import type {Context} from './context.js'
import type {Live} from './core.js'
import type {PanelFrame} from './solid.js'

export const PluginContext = createContext<Context>()

export const LifetimeContext = createContext<{
  readonly ended: boolean
}>()

export const PanelContext = createContext<PanelFrame>()

export const DrawerContext = createContext<{
  readonly close: () => void
  readonly open: (view: {readonly title: string; readonly content: JSX.Element; readonly trigger: HTMLElement}) => void
}>()

const live = Symbol.for('conciv.plugin.live')

/**
 * Marks an accessor `ctx.use` returns, so `createKeyed` follows its generations.
 *
 * @param read - Returns the provider's current `Live` value, one object per transition.
 * @returns The same function, marked.
 */
export function liveAccessor<T>(read: () => Live<T>): Accessor<Live<T>> {
  return Object.assign(read, {[live]: true})
}

/**
 * Whether the host marked the accessor with `liveAccessor`.
 *
 * @param source - Any accessor.
 * @returns True for the accessors `ctx.use` returns.
 */
export function isLiveAccessor(source: Accessor<unknown>): source is Accessor<Live<unknown>> {
  return live in source
}
