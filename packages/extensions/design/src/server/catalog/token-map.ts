import {formatHex8, interpolate, parse} from 'culori'
import postcss from 'postcss'
import {z} from 'zod'
import {CatalogSchemas, type Scheme, type Token, type TokenMap} from '../../shared/catalog-defs.js'

export function createTokenMap(input: {tokens: Token[]}): TokenMap {
  const {tokens} = input
  const resolved = CatalogSchemas.Scheme.options.flatMap((scheme) =>
    tokens
      .filter((token) => applies({token, scheme}))
      .map((token) => ({
        token,
        scheme,
        value: resolvedValue({value: token.value, scheme, tokens, seen: [token.name]}),
      })),
  )
  return {
    kitTokenFor({kind, value, scheme}) {
      const wanted = normalised({kind, value})
      if (wanted === null) return null
      const found = resolved.find(
        (entry) => entry.scheme === scheme && entry.value !== null && normalised({kind, value: entry.value}) === wanted,
      )
      return found?.token ?? null
    },
  }
}

const VAR = 'var('
const COLOR_MIX = 'color-mix('
const CLOSE = ')'
const PX = 'px'
const PERCENT = '%'
const WHOLE = 100
const HALF = 50
const QUOTES = ['"', "'"]
const COLOR_KINDS = new Set(['fill', 'text color'])
const LENGTH_KINDS = new Set(['radius', 'font size', 'line height'])
const FAMILY_KINDS = new Set(['font family'])

const MixSpaceSchema = z.enum(['srgb', 'oklch', 'oklab', 'lab', 'lch', 'hsl'])

function applies(input: {token: Token; scheme: Scheme}): boolean {
  return input.token.scheme === 'any' || input.token.scheme === input.scheme
}

function resolvedValue(input: {value: string; scheme: Scheme; tokens: Token[]; seen: string[]}): string | null {
  const {value} = input
  if (value.startsWith(VAR) && value.endsWith(CLOSE)) return referenced({...input, args: inner({value, open: VAR})})
  if (value.startsWith(COLOR_MIX) && value.endsWith(CLOSE))
    return mixed({...input, args: inner({value, open: COLOR_MIX})})
  return value
}

function inner(input: {value: string; open: string}): string[] {
  return postcss.list.comma(input.value.slice(input.open.length, -CLOSE.length))
}

function referenced(input: {args: string[]; scheme: Scheme; tokens: Token[]; seen: string[]}): string | null {
  const {args, scheme, tokens, seen} = input
  const [name, fallback] = args
  if (name === undefined || seen.includes(name)) return null
  const target = tokens.find((token) => token.name === name && applies({token, scheme}))
  const value = target?.value ?? fallback
  if (value === undefined) return null
  return resolvedValue({value, scheme, tokens, seen: [...seen, name]})
}

function mixed(input: {args: string[]; scheme: Scheme; tokens: Token[]; seen: string[]}): string | null {
  const [space = '', ...parts] = input.args
  const mode = MixSpaceSchema.safeParse(postcss.list.space(space)[1])
  const [from, to, ...rest] = parts.map((part) => mixPart({...input, part}))
  if (!mode.success || from === undefined || from === null || to === undefined || to === null || rest.length > 0)
    return null
  const blend = interpolate([from.color, to.color], mode.data === 'srgb' ? 'rgb' : mode.data)
  return formatHex8(blend(secondShare({first: from.share, second: to.share}))) ?? null
}

function mixPart(input: {part: string; scheme: Scheme; tokens: Token[]; seen: string[]}) {
  const [color = '', share] = postcss.list.space(input.part)
  const value = resolvedValue({...input, value: color})
  const parsed = value === null ? undefined : parse(value)
  return parsed === undefined ? null : {color: parsed, share: percent(share)}
}

function secondShare(input: {first: number | null; second: number | null}): number {
  const first = input.first ?? (input.second === null ? HALF : WHOLE - input.second)
  const second = input.second ?? WHOLE - first
  return second / (first + second)
}

function percent(share: string | undefined): number | null {
  if (share === undefined || !share.endsWith(PERCENT)) return null
  return Number(share.slice(0, -PERCENT.length))
}

function normalised(input: {kind: string; value: string}): string | null {
  const {kind, value} = input
  if (COLOR_KINDS.has(kind)) return formatHex8(parse(value)) ?? null
  if (LENGTH_KINDS.has(kind)) return pixels(value)
  if (FAMILY_KINDS.has(kind)) return firstFamily(value)
  return null
}

function pixels(value: string): string | null {
  if (!value.endsWith(PX)) return null
  const amount = Number(value.slice(0, -PX.length))
  return Number.isFinite(amount) ? String(amount) : null
}

function firstFamily(value: string): string | null {
  const [first] = postcss.list.comma(value)
  if (first === undefined) return null
  return QUOTES.reduce((text, quote) => text.replaceAll(quote, ''), first)
    .trim()
    .toLowerCase()
}
