import type {Expression, JSXAttribute, ObjectExpression, ObjectProperty} from 'oxc-parser'
import {declares} from '../../shared/properties.js'
import type {Provenance, ProvenanceMapper} from '../../shared/types.js'
import {findAttribute, camelToKebab, located, readSite, UNKNOWN, type Site} from './jsx.js'

const SX_KEYS: Record<string, string[]> = {
  p: ['padding'],
  px: ['padding-left', 'padding-right'],
  py: ['padding-top', 'padding-bottom'],
  pt: ['padding-top'],
  pr: ['padding-right'],
  pb: ['padding-bottom'],
  pl: ['padding-left'],
  m: ['margin'],
  mx: ['margin-left', 'margin-right'],
  my: ['margin-top', 'margin-bottom'],
  mt: ['margin-top'],
  mr: ['margin-right'],
  mb: ['margin-bottom'],
  ml: ['margin-left'],
  bgcolor: ['background-color'],
}

const SPACING_KEYS = ['p', 'px', 'py', 'pt', 'pr', 'pb', 'pl', 'm', 'mx', 'my', 'mt', 'mr', 'mb', 'ml', 'gap']

function keyName(property: ObjectProperty): string | null {
  if (property.computed) return null
  const {key} = property
  if (key.type === 'Identifier') return key.name
  if (key.type === 'Literal' && typeof key.value === 'string') return key.value
  return null
}

function covers(input: {key: string; property: string; sx: boolean}): boolean {
  const declared = (input.sx ? SX_KEYS[input.key] : undefined) ?? [camelToKebab(input.key)]
  return declared.some((name) => declares({declared: name, property: input.property}))
}

function pixels(value: string): number | null {
  if (!value.endsWith('px')) return null
  const parsed = Number(value.slice(0, -2))
  return Number.isFinite(parsed) ? parsed : null
}

function suggestion(input: {key: string; value: Expression; target: number | string; live: string}): string | null {
  const {value, target} = input
  if (value.type !== 'Literal' || typeof value.value !== 'number') return null
  if (!SPACING_KEYS.includes(input.key) || typeof target !== 'number') return null
  const live = pixels(input.live)
  if (live === null) return null
  const unit = live / value.value
  if (!Number.isFinite(unit) || unit <= 0 || target % unit !== 0) return null
  return `${input.key}: ${target / unit}`
}

function styleObject(attribute: JSXAttribute): ObjectExpression | null {
  const {value} = attribute
  if (value === null || value.type !== 'JSXExpressionContainer') return null
  if (value.expression.type !== 'ObjectExpression') return null
  return value.expression
}

function fromObject(input: {
  site: Site
  object: ObjectExpression
  via: 'sx' | 'style'
  property: string
  target: number | string
  live: string
  file: string
}): Provenance {
  const entries = input.object.properties
  const keys = entries.map((entry) => (entry.type === 'Property' ? keyName(entry) : null))
  const index = keys.findLastIndex(
    (key) => key !== null && covers({key, property: input.property, sx: input.via === 'sx'}),
  )
  const entry = entries[index]
  const key = keys[index]
  if (entry === undefined || entry.type !== 'Property' || key === null || key === undefined) return UNKNOWN
  if (entries.slice(index + 1).some((later) => later.type === 'SpreadElement')) return UNKNOWN
  const {line, column} = located({site: input.site, offset: entry.start})
  const suggest =
    input.via === 'sx' ? suggestion({key, value: entry.value, target: input.target, live: input.live}) : null
  return {
    via: input.via,
    file: input.file,
    line,
    column,
    declaration: input.site.code.slice(entry.start, entry.end),
    ...(suggest === null ? {} : {suggest}),
  }
}

export const styleMapper: ProvenanceMapper = {
  via: 'style',
  applies: ({winner}) => winner.inline || winner.sheet.emotion,
  async map(input) {
    const {source} = input.component
    const site = await readSite({cwd: input.cwd, source})
    if (site === null || source === null) return UNKNOWN
    const names: ('style' | 'sx')[] = input.winner.inline ? ['style', 'sx'] : ['sx']
    const found = names
      .map((via) => ({via, attribute: findAttribute({element: site.element, name: via})}))
      .find((item) => item.attribute !== null)
    if (found === undefined || found.attribute === null) return UNKNOWN
    const {via, attribute} = found
    const object = styleObject(attribute)
    if (object !== null) {
      return fromObject({
        site,
        object,
        via,
        property: input.property,
        target: input.target,
        live: input.winner.value,
        file: source.file,
      })
    }
    const {line, column} = located({site, offset: attribute.start})
    return {via, file: source.file, line, column, declaration: site.code.slice(attribute.start, attribute.end)}
  },
}
