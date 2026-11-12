import type {JSX} from 'solid-js'
import type {Json} from '../storage.js'
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
