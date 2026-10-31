import Specificity, {type SpecificityObject} from '@bramus/specificity'
import type {WinnerInput, WinnerResult} from '../shared/defs.js'
import {propertyAliases} from '../shared/properties.js'
import type {Winner} from '../shared/types.js'

type Sheet = Winner['sheet']

type Origin = {sheet: Sheet; conditions: string[]; layer: string | null; parent: string | null}

type Entry = {rule: CSSStyleRule; selector: string; origin: Origin}

type Scan = {entries: Entry[]; layers: string[]}

type Candidate = {winner: Winner; layer: number; specificity: SpecificityObject; order: number}

const INLINE_SHEET: Sheet = {href: null, viteDevId: null, emotion: false, styled: false, adopted: false}

const ZERO: SpecificityObject = {a: 0, b: 0, c: 0}

function readRules(sheet: CSSStyleSheet | null): CSSRuleList | null {
  if (sheet === null) return null
  try {
    return sheet.cssRules
  } catch {
    return null
  }
}

function sheetOwner(sheet: CSSStyleSheet): Element | null {
  const owner = sheet.ownerNode
  if (owner instanceof Element) return owner
  if (sheet.parentStyleSheet === null) return null
  return sheetOwner(sheet.parentStyleSheet)
}

function describeSheet(input: {sheet: CSSStyleSheet; adopted: boolean}): Sheet {
  const owner = sheetOwner(input.sheet)
  return {
    href: input.sheet.href,
    viteDevId: owner?.getAttribute('data-vite-dev-id') ?? null,
    emotion: owner?.hasAttribute('data-emotion') ?? false,
    styled: owner?.hasAttribute('data-styled') ?? false,
    adopted: input.adopted,
  }
}

function nest(input: {parent: string; child: string}): string {
  return input.child
    .split(',')
    .map((part) => {
      const trimmed = part.trim()
      if (trimmed.includes('&')) return trimmed.split('&').join(`:is(${input.parent})`)
      return `:is(${input.parent}) ${trimmed}`
    })
    .join(', ')
}

function register(input: {scan: Scan; name: string}): void {
  if (!input.scan.layers.includes(input.name)) input.scan.layers.push(input.name)
}

function layerName(input: {origin: Origin; name: string}): string {
  if (input.origin.layer === null) return input.name
  return `${input.origin.layer}.${input.name}`
}

function walk(input: {rules: CSSRuleList; origin: Origin; scan: Scan}): void {
  for (const rule of Array.from(input.rules)) visit({rule, origin: input.origin, scan: input.scan})
}

function visitStyle(input: {rule: CSSStyleRule; origin: Origin; scan: Scan}): void {
  const {rule, origin, scan} = input
  const selector = origin.parent === null ? rule.selectorText : nest({parent: origin.parent, child: rule.selectorText})
  scan.entries.push({rule, selector, origin})
  walk({rules: rule.cssRules, origin: {...origin, parent: selector}, scan})
}

function visitMedia(input: {rule: CSSMediaRule; origin: Origin; scan: Scan}): void {
  const {rule, origin, scan} = input
  if (!window.matchMedia(rule.media.mediaText).matches) return
  walk({
    rules: rule.cssRules,
    origin: {...origin, conditions: [...origin.conditions, `@media ${rule.conditionText}`]},
    scan,
  })
}

function visitSupports(input: {rule: CSSSupportsRule; origin: Origin; scan: Scan}): void {
  const {rule, origin, scan} = input
  if (!CSS.supports(rule.conditionText)) return
  walk({
    rules: rule.cssRules,
    origin: {...origin, conditions: [...origin.conditions, `@supports ${rule.conditionText}`]},
    scan,
  })
}

function visitLayerBlock(input: {rule: CSSLayerBlockRule; origin: Origin; scan: Scan}): void {
  const {rule, origin, scan} = input
  const layer = layerName({origin, name: rule.name})
  register({scan, name: layer})
  walk({rules: rule.cssRules, origin: {...origin, layer}, scan})
}

function visitLayerStatement(input: {rule: CSSLayerStatementRule; origin: Origin; scan: Scan}): void {
  const {rule, origin, scan} = input
  for (const name of rule.nameList) register({scan, name: layerName({origin, name})})
}

function visitImport(input: {rule: CSSImportRule; origin: Origin; scan: Scan}): void {
  const {rule, origin, scan} = input
  const rules = readRules(rule.styleSheet)
  if (rules === null) return
  if (rule.media.mediaText !== '' && !window.matchMedia(rule.media.mediaText).matches) return
  const layer = rule.layerName === null ? origin.layer : layerName({origin, name: rule.layerName})
  if (layer !== null) register({scan, name: layer})
  walk({rules, origin: {...origin, layer}, scan})
}

function visit(input: {rule: CSSRule; origin: Origin; scan: Scan}): void {
  const {rule, origin, scan} = input
  if (rule instanceof CSSStyleRule) return visitStyle({rule, origin, scan})
  if (rule instanceof CSSMediaRule) return visitMedia({rule, origin, scan})
  if (rule instanceof CSSSupportsRule) return visitSupports({rule, origin, scan})
  if (rule instanceof CSSLayerBlockRule) return visitLayerBlock({rule, origin, scan})
  if (rule instanceof CSSLayerStatementRule) return visitLayerStatement({rule, origin, scan})
  if (rule instanceof CSSImportRule) return visitImport({rule, origin, scan})
}

function scanSheets(): Scan {
  const scan: Scan = {entries: [], layers: []}
  const sheets = [
    ...Array.from(document.styleSheets).map((sheet) => ({sheet, adopted: false})),
    ...document.adoptedStyleSheets.map((sheet) => ({sheet, adopted: true})),
  ]
  for (const {sheet, adopted} of sheets) {
    const rules = readRules(sheet)
    if (rules === null) continue
    walk({rules, origin: {sheet: describeSheet({sheet, adopted}), conditions: [], layer: null, parent: null}, scan})
  }
  return scan
}

function matches(input: {element: Element; part: string}): boolean {
  try {
    return input.element.matches(input.part)
  } catch {
    return false
  }
}

function partSpecificity(part: string): SpecificityObject {
  try {
    return Specificity.calculate(part)[0]?.toObject() ?? ZERO
  } catch {
    return ZERO
  }
}

function bestPart(input: {element: Element; selector: string}): {part: string; specificity: SpecificityObject} | null {
  const parts = input.selector
    .split(',')
    .map((part) => part.trim())
    .filter((part) => matches({element: input.element, part}))
    .map((part) => ({part, specificity: partSpecificity(part)}))
  return parts.reduce<{part: string; specificity: SpecificityObject} | null>((best, next) => {
    if (best === null || Specificity.compare(next.specificity, best.specificity) > 0) return next
    return best
  }, null)
}

function outranks(input: {a: Candidate; b: Candidate}): boolean {
  const {a, b} = input
  if (a.winner.important !== b.winner.important) return a.winner.important
  if (a.winner.inline !== b.winner.inline) return a.winner.inline
  if (a.layer !== b.layer) return a.winner.important ? a.layer < b.layer : a.layer > b.layer
  const bySpecificity = Specificity.compare(a.specificity, b.specificity)
  if (bySpecificity !== 0) return bySpecificity > 0
  return a.order > b.order
}

function declared(input: {style: CSSStyleDeclaration; aliases: string[]}): {alias: string; value: string} | null {
  const alias = input.aliases.find((name) => input.style.getPropertyValue(name) !== '')
  if (alias === undefined) return null
  return {alias, value: input.style.getPropertyValue(alias)}
}

function inlineCandidate(input: {element: Element; aliases: string[]; layers: number}): Candidate | null {
  if (!(input.element instanceof HTMLElement || input.element instanceof SVGElement)) return null
  const style = input.element.style
  const hit = declared({style, aliases: input.aliases})
  if (hit === null) return null
  return {
    winner: {
      selector: null,
      declaration: `${hit.alias}: ${hit.value}`,
      value: hit.value,
      important: style.getPropertyPriority(hit.alias) === 'important',
      inline: true,
      inherited: false,
      sheet: INLINE_SHEET,
      conditions: [],
      rulePath: 'style',
    },
    layer: input.layers,
    specificity: ZERO,
    order: Number.MAX_SAFE_INTEGER,
  }
}

function ruleCandidates(input: {element: Element; aliases: string[]; scan: Scan}): Candidate[] {
  const {scan} = input
  return scan.entries.flatMap((entry, order) => {
    const hit = declared({style: entry.rule.style, aliases: input.aliases})
    if (hit === null) return []
    const best = bestPart({element: input.element, selector: entry.selector})
    if (best === null) return []
    const {origin} = entry
    const layerPath = origin.layer === null ? [] : [`@layer ${origin.layer}`]
    return [
      {
        winner: {
          selector: best.part,
          declaration: `${hit.alias}: ${hit.value}`,
          value: hit.value,
          important: entry.rule.style.getPropertyPriority(hit.alias) === 'important',
          inline: false,
          inherited: false,
          sheet: origin.sheet,
          conditions: origin.conditions,
          rulePath: [...origin.conditions, ...layerPath, best.part].join(' > '),
        },
        layer: origin.layer === null ? scan.layers.length : scan.layers.indexOf(origin.layer),
        specificity: best.specificity,
        order,
      },
    ]
  })
}

function resolveVar(input: {element: Element; value: string}): string {
  const start = input.value.indexOf('var(')
  if (start === -1) return input.value
  const close = input.value.indexOf(')', start)
  if (close === -1) return input.value
  const [name = '', ...fallback] = input.value.slice(start + 4, close).split(',')
  const custom = getComputedStyle(input.element).getPropertyValue(name.trim()).trim()
  const resolved = custom === '' ? fallback.join(',').trim() : custom
  return resolveVar({
    element: input.element,
    value: `${input.value.slice(0, start)}${resolved}${input.value.slice(close + 1)}`,
  })
}

function normalized(input: {property: string; value: string}): string {
  const probe = document.createElement('span').style
  probe.setProperty(input.property, input.value)
  return probe.getPropertyValue(input.property)
}

function confirms(input: {element: Element; property: string; value: string}): boolean {
  const computed = getComputedStyle(input.element).getPropertyValue(input.property)
  const value = resolveVar({element: input.element, value: input.value})
  if (value === computed) return true
  const expected = normalized({property: input.property, value: computed})
  return expected !== '' && normalized({property: input.property, value}) === expected
}

type WinnerQuery = {element: Element; property: string; scan: Scan}

function inherits(input: WinnerQuery): Winner | null {
  const parent = input.element.parentElement
  if (parent === null) return null
  const own = getComputedStyle(input.element).getPropertyValue(input.property)
  if (own !== getComputedStyle(parent).getPropertyValue(input.property)) return null
  const winner = winningDeclaration({...input, element: parent})
  if (winner === null) return null
  return {...winner, inherited: true}
}

function winningDeclaration(input: WinnerQuery): Winner | null {
  const {scan} = input
  const aliases = propertyAliases(input.property)
  const inline = inlineCandidate({element: input.element, aliases, layers: scan.layers.length})
  const candidates = [...ruleCandidates({element: input.element, aliases, scan}), ...(inline === null ? [] : [inline])]
  const best = candidates.reduce<Candidate | null>((top, next) => {
    if (top === null || outranks({a: next, b: top})) return next
    return top
  }, null)
  if (best === null) return inherits(input)
  if (!confirms({element: input.element, property: input.property, value: best.winner.value})) return null
  return best.winner
}

export function winnerStep(input: WinnerInput): Promise<WinnerResult> {
  const element = document.querySelector(input.selector)
  if (element === null) return Promise.resolve(Object.fromEntries(input.properties.map((property) => [property, null])))
  const scan = scanSheets()
  return Promise.resolve(
    Object.fromEntries(input.properties.map((property) => [property, winningDeclaration({element, property, scan})])),
  )
}
