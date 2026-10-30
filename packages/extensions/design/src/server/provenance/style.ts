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

const SPACING_UNIT = 8

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

function suggestion(input: {key: string; value: Expression; target: number | string}): string | null {
  const {value, target} = input
  if (value.type !== 'Literal' || typeof value.value !== 'number') return null
  if (!SPACING_KEYS.includes(input.key) || typeof target !== 'number' || target % SPACING_UNIT !== 0) return null
  return `${input.key}: ${target / SPACING_UNIT}`
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
  file: string
}): Provenance {
  const matched = input.object.properties
    .filter((entry): entry is ObjectProperty => entry.type === 'Property')
    .map((entry) => ({entry, key: keyName(entry)}))
    .filter((item) => item.key !== null && covers({key: item.key, property: input.property, sx: input.via === 'sx'}))
    .at(-1)
  if (matched === undefined || matched.key === null) return UNKNOWN
  const {line, column} = located({site: input.site, offset: matched.entry.start})
  const suggest = suggestion({key: matched.key, value: matched.entry.value, target: input.target})
  return {
    via: input.via,
    file: input.file,
    line,
    column,
    declaration: input.site.code.slice(matched.entry.start, matched.entry.end),
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
      return fromObject({site, object, via, property: input.property, target: input.target, file: source.file})
    }
    const {line, column} = located({site, offset: attribute.start})
    return {via, file: source.file, line, column, declaration: site.code.slice(attribute.start, attribute.end)}
  },
}
