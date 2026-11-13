import {createComponent, useContext, type Accessor, type Component} from 'solid-js'
import type {Context, SetupContext} from './context.js'
import type {Declarations} from './declarations.js'
import {DrawerContext, PanelContext, PluginContext} from './internal.js'

/**
 * The plugin's context inside a contribution: the same object setup receives. Pass the definition for the typed
 * declarations. Throws outside a plugin contribution. A component returned by a contract must be bound with
 * `bindPlugin` in the provider's setup; otherwise it reads the consuming plugin's context.
 *
 * @example
 * ```ts
 * function View() {
 *   const ctx = usePlugin<typeof definition>()
 *   return <span>{ctx.stores.prefs.value.shown ? "Shown" : "Hidden"}</span>
 * }
 * ```
 */
export function usePlugin(): Context
export function usePlugin<D extends Declarations>(): SetupContext<D>
export function usePlugin(): Context {
  const context = useContext(PluginContext)

  if (!context) throw new Error('usePlugin must run inside a plugin contribution')

  return context
}

/**
 * Binds one contract component to the providing plugin's context. Call during setup, then provide the returned
 * component: `usePlugin` inside it reads the provider, not the plugin that renders it. Props retain their
 * reactive getters. Data methods need no wrapper. Throws outside a plugin's owner.
 *
 * @param component - One component the contract exposes.
 * @returns The component under the providing plugin's context.
 *
 * @example
 * ```ts
 * ctx.provide(FileTree, { Tree: bindPlugin((props) => <Tree {...props} />) })
 * ```
 */
export function bindPlugin<P extends object>(component: Component<P>): Component<P> {
  const context = usePlugin()

  return (props) =>
    createComponent(PluginContext.Provider, {
      value: context,
      get children() {
        return createComponent(component, props)
      },
    })
}

export interface PanelFrame {
  readonly visible: Accessor<boolean>
  readonly present: Accessor<boolean>
  readonly placement: Accessor<'pane' | 'mobile'>
  readonly animate: Accessor<boolean>
  readonly open: Accessor<readonly string[]>
}

/**
 * Where the current panel render is shown. Throws outside a `Panel.render`.
 *
 * @example
 * ```ts
 * const panel = usePanel()
 * const compact = () => panel.placement() === "mobile"
 * ```
 */
export function usePanel() {
  const frame = useContext(PanelContext)

  if (!frame) throw new Error('usePanel must run inside a panel render')

  return frame
}

/**
 * The drawer showing this panel, or undefined outside one. Close it before an action that opens another view.
 *
 * @example
 * ```ts
 * const drawer = useDrawer()
 * const open = (path: string) => {
 *   drawer?.close()
 *   ctx.layout.open(`file:${path}`, session)
 * }
 * ```
 */
export function useDrawer() {
  return useContext(DrawerContext)
}
