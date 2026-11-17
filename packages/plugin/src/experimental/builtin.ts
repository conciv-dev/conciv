import type {JSX} from 'solid-js'
import type {ToolCardView} from '@conciv/protocol/tool-view-types'
import type {Json} from './core.js'
import {Registry} from './core.js'
import type {MountedSession} from './host-apis.js'

/**
 * Runs fn when the main thread is idle (a short timeout where requestIdleCallback is missing, e.g. Safari). Load lazy
 * chunks this way from setup, so they are compiled before a session first opens.
 *
 * @param fn - The work to run.
 * @returns Cancels it if it has not run.
 *
 * @example
 * ```ts
 * const Page = lazy(() => import("./page"))
 * onCleanup(onIdle(() => void Page.preload()))
 * ```
 */
export function onIdle(fn: () => void) {
  if (typeof requestIdleCallback !== 'undefined') {
    const id = requestIdleCallback(fn)

    return () => cancelIdleCallback(id)
  }

  const id = setTimeout(fn, 200)

  return () => clearTimeout(id)
}

export interface ToolCallProps {
  readonly tool: string
  readonly id: string
  readonly input: Json
  readonly result:
    | {
        readonly status: 'success'
        readonly output: Json
      }
    | {
        readonly status: 'error'
        readonly error: string
      }
  readonly session: MountedSession
}

export type ToolCall =
  | {
      readonly tools: readonly string[]
      /**
       * Renders one finished call's body each time the call's card mounts, under your plugin's context; its own
       * reactivity updates it. A card can leave the thread and mount again, and your render then runs again. Return
       * `undefined` to keep the host's default card. A render that throws records the error under your plugin and the
       * default card shows; the plugin keeps running. A call you declined or threw for is not asked again.
       *
       * @param props - The finished call and its session. Do not destructure.
       * @returns Your UI for the card's body, or `undefined` to keep the default card.
       */
      render(props: ToolCallProps): JSX.Element | undefined
    }
  | {
      readonly tools: readonly string[]
      /**
       * Draws the whole card for each call, while it runs, waits for approval and after it finishes, under your
       * plugin's context. Its props carry the call, its result, the duration and the page capture, as the host's own
       * cards get them.
       *
       * @remarks A render that throws records the error under your plugin and the default card shows for that call;
       * the plugin keeps running. `display: 'standalone'` draws the call outside the thread's group of calls.
       */
      readonly card: ToolCardView
      readonly streamTitle?: string
      readonly display?: 'standalone'
    }

/**
 * The registry of tool cards, by tool name: either a finished call's body (`render`) or the whole card (`card`).
 * Built-in plugins only.
 *
 * @example
 * ```tsx
 * ctx.add(ToolCall, {
 *   tools: ["page_screenshot"],
 *   render: (props) => (props.result.status === "success" ? <Shot call={props.id} /> : undefined),
 * })
 * ctx.add(ToolCall, {
 *   tools: ["page_act"],
 *   card: {render: (props) => <ActCard {...props} />, hasEmbeddedBody: () => true},
 *   display: "standalone",
 * })
 * ```
 */
export const ToolCall = Registry.define<ToolCall>('tool-call')
