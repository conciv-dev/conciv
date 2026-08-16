import type {ComponentPropsWithRef, CSSProperties, Ref, RefCallback, RefObject} from 'react'
import type {MascotActivity, MascotFollow, MascotState} from '../core/config.js'
import type {CurveStyle} from '../core/path.js'
import type {MascotSkin} from '../core/skin.js'
import {camelCaseProperty, isGeometryProperty, kebabCaseProperty} from '../core/style-merge.js'

export type MascotLayerProps = ComponentPropsWithRef<'span'>

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

type StyleEntry = [string, string | number]

export function composeRefs(
  capture: RefObject<HTMLSpanElement | null>,
  forwarded: Ref<HTMLSpanElement> | undefined,
): RefCallback<HTMLSpanElement> {
  return (element) => {
    capture.current = element
    if (typeof forwarded === 'function') forwarded(element)
    if (typeof forwarded === 'object' && forwarded !== null) forwarded.current = element
  }
}

const isStyleValue = (value: unknown): value is string | number =>
  typeof value === 'string' || typeof value === 'number'

const carriedEntries = (core: Record<string, string>): StyleEntry[] =>
  Object.entries(core).map(([property, value]) => [camelCaseProperty(property), value])

function suppliedEntry(property: string, value: unknown, blockGeometry: boolean): StyleEntry[] {
  if (!isStyleValue(value)) return []
  if (blockGeometry && isGeometryProperty(kebabCaseProperty(property))) return []
  return [[property, value]]
}

const suppliedEntries = (consumer: CSSProperties | undefined, blockGeometry: boolean): StyleEntry[] =>
  Object.entries(consumer ?? {}).flatMap(([property, value]) => suppliedEntry(property, value, blockGeometry))

const styleFrom = (entries: StyleEntry[]): CSSProperties =>
  Object.assign<CSSProperties, Record<string, string | number>>({}, Object.fromEntries(entries))

export const mergeStyle = (
  core: Record<string, string>,
  consumer: CSSProperties | undefined,
  blockGeometry = false,
): CSSProperties => styleFrom([...carriedEntries(core), ...suppliedEntries(consumer, blockGeometry)])
