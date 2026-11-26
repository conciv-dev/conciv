import type {ToolCallPart} from '@conciv/types/chat-message-types'
import {
  argumentRecord,
  clipTarget,
  resolveRowMark,
  shortToolLabel,
  type ToolRowProjection,
  type ToolRowProps,
} from '../primitives/tool-row.js'

export type GenericToolHeadline = {
  title: string
  subtitle: string | undefined
  args: string[]
  target: string | undefined
}

const LABEL_KEYS = ['description', 'query', 'url', 'path', 'pattern', 'name']

const MAX_ARGS = 3

type Scalar = string | number | boolean

function isScalar(value: unknown): value is Scalar {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
}

export function genericToolHeadline(part: ToolCallPart): GenericToolHeadline {
  const input = argumentRecord(part)
  const subtitle = LABEL_KEYS.map((key) => input[key]).find(
    (value): value is string => typeof value === 'string' && value.length > 0,
  )
  const scalars = Object.entries(input)
    .filter((entry): entry is [string, Scalar] => !LABEL_KEYS.includes(entry[0]) && isScalar(entry[1]))
    .slice(0, MAX_ARGS)
  return {
    title: `Called ${part.name}`,
    subtitle,
    args: scalars.map(([key, value]) => `${key}=${value}`),
    target: subtitle ?? (scalars[0] === undefined ? undefined : String(scalars[0][1])),
  }
}

export function genericToolRowProjection(source: ToolRowProps): ToolRowProjection {
  const headline = genericToolHeadline(source.part)
  const args = headline.args.join(' ')
  return {
    mark: source.result?.outcome ?? resolveRowMark(source.part, source.result),
    label: shortToolLabel(source.part.name),
    target: clipTarget(headline.target || headline.title),
    meta: source.result?.outcome ?? (args.length > 0 ? args : undefined),
  }
}
