import {groupBy, orderBy} from 'es-toolkit'
import type {CatalogConfig, Hint, PropSketch, Ranked} from '../../shared/catalog-defs.js'
import {importLine} from './import-line.js'

export function renderComponents(input: {
  ranked: Ranked[]
  limits: Pick<CatalogConfig, 'appTierFull'>
  hints?: Hint[]
}): string {
  const {ranked, limits} = input
  if (ranked.length === 0) return NONE
  const hints = input.hints ?? []
  const {kit = [], app = [], other = []} = groupBy(wanted({ranked, hints}), (component) => component.tier)
  const shownApp = app.slice(0, limits.appTierFull)
  return [
    ...kit.map(block),
    ...shownApp.map(block),
    ...(app.length > shownApp.length ? [`${app.length - shownApp.length} more app components, ask show`] : []),
    ...(other.length > 0 ? [`${other.length} other components, ask show`] : []),
  ].join(BLOCK_GAP)
}

const NONE = 'no components found in this project'

const BLOCK_GAP = '\n\n'

const FACT_GAP = ' · '

const SEE_FILE = 'see file'

const PREFER = 'prefer'

function wanted(input: {ranked: Ranked[]; hints: Hint[]}): Ranked[] {
  const {ranked, hints} = input
  if (hints.length === 0) return ranked
  return orderBy(
    ranked,
    [
      (component) => (component.flag === PREFER ? 1 : 0),
      (component) =>
        hints.filter((hint) => hint.specifier === component.specifier && component.names.includes(hint.component))
          .length,
    ],
    ['desc', 'desc'],
  )
}

function block(component: Ranked): string {
  return [
    importLine(component),
    component.file,
    ...(component.sentence === null ? [] : [component.sentence]),
    ...propsLine(component.props),
    ...(component.usage === null ? [] : [component.usage]),
    facts(component),
  ].join('\n')
}

function propsLine(sketched: Ranked['props']): string[] {
  if (sketched === SEE_FILE) return [`props: ${SEE_FILE}`]
  const matter = sketched.filter((prop) => prop.required || prop.values.length > 0)
  if (matter.length === 0) return []
  return [`props: ${matter.map(propText).join(', ')}`]
}

function propText(prop: PropSketch): string {
  const name = prop.required ? `${prop.name} (required)` : prop.name
  if (prop.values.length === 0) return name
  return `${name}: ${prop.values.map((value) => `'${value}'`).join(' | ')}`
}

function facts(component: Ranked): string {
  return [
    component.tier,
    `${component.imports} imports`,
    ...(component.onPage > 0 ? [`${component.onPage} on this page`] : []),
    ...(component.flag === null ? [] : [component.flag]),
  ].join(FACT_GAP)
}
