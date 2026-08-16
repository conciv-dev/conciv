import type {JSX} from 'solid-js'
import type {MascotActivity, MascotFollow, MascotState} from '../core/config.js'
import type {CurveStyle} from '../core/path.js'
import type {MascotSkin} from '../core/skin.js'
import {isGeometryProperty} from '../core/style-merge.js'

export type MascotLayerProps = JSX.HTMLAttributes<HTMLSpanElement>

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

type ConsumerStyle = JSX.CSSProperties | string | undefined

type ForwardedRef = HTMLSpanElement | ((element: HTMLSpanElement) => void) | undefined

type Declaration = {property: string; value: string}

export function composeRefs(
  capture: (element: HTMLSpanElement) => void,
  forwarded: ForwardedRef,
): (element: HTMLSpanElement) => void {
  return (element) => {
    capture(element)
    if (typeof forwarded === 'function') forwarded(element)
  }
}

const QUOTES = ['"', "'"]

type Scan = {parts: string[]; start: number; depth: number; quote: string}

const nextQuote = (character: string, quote: string): string => {
  if (quote !== '') return character === quote ? '' : quote
  return QUOTES.includes(character) ? character : ''
}

const nextDepth = (character: string, depth: number): number => {
  if (character === '(') return depth + 1
  return character === ')' ? Math.max(0, depth - 1) : depth
}

const cutsHere = (character: string, separator: string, scan: Scan): boolean =>
  character === separator && scan.depth === 0 && scan.quote === ''

function scanCharacter(text: string, separator: string, scan: Scan, index: number): Scan {
  const character = text[index] ?? ''
  const quote = nextQuote(character, scan.quote)
  const depth = quote === '' ? nextDepth(character, scan.depth) : scan.depth
  const moved = {...scan, depth, quote}
  if (!cutsHere(character, separator, moved)) return moved
  return {...moved, parts: [...scan.parts, text.slice(scan.start, index)], start: index + 1}
}

function splitTop(text: string, separator: string): string[] {
  const scanned = [...text].reduce<Scan>((scan, _character, index) => scanCharacter(text, separator, scan, index), {
    parts: [],
    start: 0,
    depth: 0,
    quote: '',
  })
  return [...scanned.parts, text.slice(scanned.start)]
}

function declarationOf(text: string): Declaration[] {
  const [property, ...rest] = splitTop(text, ':')
  if (property === undefined || rest.length === 0) return []
  const value = rest.join(':').trim()
  if (value === '') return []
  return [{property: property.trim(), value}]
}

const objectDeclarations = (style: JSX.CSSProperties): Declaration[] =>
  Object.entries(style).flatMap(([property, value]) =>
    value === undefined || value === null ? [] : [{property, value: String(value)}],
  )

function styleDeclarations(style: ConsumerStyle): Declaration[] {
  if (style === undefined) return []
  if (typeof style === 'string') return splitTop(style, ';').flatMap(declarationOf)
  return objectDeclarations(style)
}

const allowed = (declarations: Declaration[], blockGeometry: boolean): Declaration[] =>
  blockGeometry ? declarations.filter((declaration) => !isGeometryProperty(declaration.property)) : declarations

const cssText = (declarations: Declaration[]): string =>
  declarations.map(({property, value}) => `${property}:${value}`).join(';')

export function mergeStyle(
  core: Record<string, string>,
  consumer: ConsumerStyle,
  blockGeometry = false,
): JSX.CSSProperties | string {
  const declarations = allowed(styleDeclarations(consumer), blockGeometry)
  if (typeof consumer === 'string') {
    const carried = Object.entries(core).map(([property, value]) => ({property, value}))
    return cssText([...carried, ...declarations])
  }
  return {...core, ...Object.fromEntries(declarations.map(({property, value}) => [property, value]))}
}
