import {basename, extname} from 'node:path'
import {groupBy, pascalCase} from 'es-toolkit'
import type {CatalogConfig, PropSketch, Ranked} from '../../shared/catalog-defs.js'

export function renderComponents(input: {ranked: Ranked[]; limits: Pick<CatalogConfig, 'appTierFull'>}): string {
  const {ranked, limits} = input
  if (ranked.length === 0) return NONE
  const {kit = [], app = [], other = []} = groupBy(ranked, (component) => component.tier)
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

const DEFAULT_EXPORT = 'default'

const SEE_FILE = 'see file'

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

function importLine(component: Ranked): string {
  const named = component.names.find((name) => name !== DEFAULT_EXPORT)
  if (named !== undefined) return `import {${named}} from '${component.specifier}'`
  return `import ${pascalCase(basename(component.file, extname(component.file)))} from '${component.specifier}'`
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
