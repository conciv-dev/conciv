import type {JSX} from 'solid-js'
import type {MascotActivity, MascotFollow, MascotState} from '../core/config.js'
import type {CurveStyle} from '../core/path.js'
import type {MascotSkin} from '../core/skin.js'

export type MascotLayerProps = JSX.HTMLAttributes<HTMLDivElement>

export type MascotProps = MascotLayerProps & {
  state?: MascotState
  working?: boolean
  follow?: MascotFollow
  activity?: MascotActivity
  curve?: CurveStyle
  skin?: MascotSkin
}

export type MascotBinaryProps = MascotLayerProps & {curve?: CurveStyle}

type ForwardedRef = HTMLDivElement | ((element: HTMLDivElement) => void) | undefined

export function composeRefs(
  capture: (element: HTMLDivElement) => void,
  forwarded: ForwardedRef,
): (element: HTMLDivElement) => void {
  return (element) => {
    capture(element)
    if (typeof forwarded === 'function') forwarded(element)
  }
}

export function mergeStyle(
  core: Record<string, string>,
  consumer: JSX.CSSProperties | string | undefined,
): JSX.CSSProperties | string {
  if (typeof consumer === 'string') return `${cssText(core)};${consumer}`
  return {...core, ...consumer}
}

const cssText = (style: Record<string, string>): string =>
  Object.entries(style)
    .map(([property, value]) => `${property}:${value}`)
    .join(';')
