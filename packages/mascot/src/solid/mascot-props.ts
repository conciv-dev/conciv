import type {JSX} from 'solid-js'
import type {MascotActivity, MascotFollow, MascotState} from '../core/config.js'
import type {CurveStyle} from '../core/path.js'
import type {MascotSkin} from '../core/skin.js'

export type MascotLayerProps = JSX.HTMLAttributes<HTMLDivElement>

export type MascotFollowPartProps = MascotLayerProps & {follow?: boolean}

export type MascotProps = MascotLayerProps & {
  state?: MascotState
  working?: boolean
  follow?: MascotFollow
  activity?: MascotActivity
  curve?: CurveStyle
  initialSkin?: MascotSkin
}

export type MascotBinaryProps = MascotLayerProps & {curve?: CurveStyle}

export type ConsumerStyle = JSX.CSSProperties | string | undefined

type ForwardedRef = HTMLDivElement | ((element: HTMLDivElement) => void) | undefined

export const LAYER_GEOMETRY_PROPERTIES = [
  'position',
  'inset',
  'background-image',
  'background-repeat',
  'background-position',
  'background-size',
]

const DEFAULT_ROOT_SIZE: Record<string, string> = {'inline-size': '44px', 'block-size': '44px'}

const ROOT_SIZE_PROPERTIES = ['inline-size', 'block-size', 'width', 'height']

export function composeRefs(
  capture: (element: HTMLDivElement) => void,
  forwarded: ForwardedRef,
): (element: HTMLDivElement) => void {
  return (element) => {
    capture(element)
    if (typeof forwarded === 'function') forwarded(element)
  }
}

const declarationOf = (declaration: string): [string, string][] => {
  const separator = declaration.indexOf(':')
  if (separator === -1) return []
  return [[declaration.slice(0, separator).trim(), declaration.slice(separator + 1).trim()]]
}

const parseCssText = (text: string): Record<string, string> =>
  Object.fromEntries(text.split(';').flatMap(declarationOf))

const styleRecord = (style: ConsumerStyle): Record<string, string> => {
  if (style === undefined) return {}
  if (typeof style === 'string') return parseCssText(style)
  return Object.fromEntries(Object.entries(style).map(([property, value]) => [property, String(value)]))
}

const withoutProperties = (style: Record<string, string>, blocked: string[]): Record<string, string> =>
  Object.fromEntries(Object.entries(style).filter(([property]) => !blocked.includes(property)))

export const mergeStyle = (
  core: Record<string, string>,
  consumer: ConsumerStyle,
  blocked: string[] = [],
): JSX.CSSProperties => ({...core, ...withoutProperties(styleRecord(consumer), blocked)})

export function defaultRootSize(className: string | undefined, style: ConsumerStyle): Record<string, string> {
  if (className !== undefined) return {}
  const consumer = styleRecord(style)
  if (ROOT_SIZE_PROPERTIES.some((property) => consumer[property] !== undefined)) return {}
  return DEFAULT_ROOT_SIZE
}
