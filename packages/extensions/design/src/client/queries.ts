export async function pageQueries(doc: Document): Promise<{queries: number[]; sheets: string}> {
  const view = doc.defaultView
  if (view === null) return {queries: [], sheets: await digest('')}
  const rem = Number.parseFloat(view.getComputedStyle(doc.documentElement).fontSize) || 0
  const rules = [...doc.styleSheets, ...doc.adoptedStyleSheets].flatMap((sheet) => rulesOf({sheet, view}))
  const queries = [...new Set(rules.flatMap((rule) => widthsOf({rule, rem, view})))].toSorted((a, b) => a - b)
  return {queries, sheets: await digest(rules.map((rule) => rule.cssText).join('\n'))}
}

const SEPARATORS = [':', '<', '>', '=', ',']
const WIDTH = 'width'
const PX = 'px'
const EM = 'em'

type PageWindow = Window & typeof globalThis

function rulesOf(input: {sheet: CSSStyleSheet | null; view: PageWindow}): CSSRule[] {
  const {sheet, view} = input
  if (sheet === null) return []
  try {
    return [...sheet.cssRules].flatMap((rule) => [rule, ...nested({rule, view})])
  } catch {
    return []
  }
}

function nested(input: {rule: CSSRule; view: PageWindow}): CSSRule[] {
  const {rule, view} = input
  if (rule instanceof view.CSSImportRule) return rulesOf({sheet: rule.styleSheet, view})
  if (rule instanceof view.CSSGroupingRule || rule instanceof view.CSSStyleRule)
    return [...rule.cssRules].flatMap((inner) => [inner, ...nested({rule: inner, view})])
  return []
}

function widthsOf(input: {rule: CSSRule; rem: number; view: PageWindow}): number[] {
  const {rule, rem} = input
  if (!(rule instanceof input.view.CSSConditionRule)) return []
  return rule.conditionText.split('(').flatMap((part) => {
    const feature = part.split(')')[0] ?? ''
    if (!feature.includes(WIDTH)) return []
    const spaced = SEPARATORS.reduce((text, separator) => text.replaceAll(separator, ' '), feature)
    return spaced.split(' ').flatMap((token) => lengthOf({token: token.trim(), rem}))
  })
}

function lengthOf(input: {token: string; rem: number}): number[] {
  const {token, rem} = input
  const value = Number.parseFloat(token)
  if (!Number.isFinite(value)) return []
  if (token.endsWith(PX)) return [Math.round(value)]
  return token.endsWith(EM) && rem > 0 ? [Math.round(value * rem)] : []
}

async function digest(text: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}
