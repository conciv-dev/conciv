export async function pageQueries(doc: Document): Promise<{queries: number[]; sheets: string}> {
  const rem = Number.parseFloat(getComputedStyle(doc.documentElement).fontSize) || 0
  const rules = [...doc.styleSheets, ...doc.adoptedStyleSheets].flatMap((sheet) => rulesOf(sheet))
  const queries = [...new Set(rules.flatMap((rule) => widthsOf({rule, rem})))].toSorted((a, b) => a - b)
  return {queries, sheets: await digest(rules.map((rule) => rule.cssText).join('\n'))}
}

const SEPARATORS = [':', '<', '>', '=', ',']
const WIDTH = 'width'
const PX = 'px'
const EM = 'em'

function rulesOf(sheet: CSSStyleSheet | null): CSSRule[] {
  if (sheet === null) return []
  try {
    return [...sheet.cssRules].flatMap((rule) => [rule, ...nested(rule)])
  } catch {
    return []
  }
}

function nested(rule: CSSRule): CSSRule[] {
  if (rule instanceof CSSImportRule) return rulesOf(rule.styleSheet)
  if (rule instanceof CSSGroupingRule) return [...rule.cssRules].flatMap((inner) => [inner, ...nested(inner)])
  return []
}

function widthsOf(input: {rule: CSSRule; rem: number}): number[] {
  const {rule, rem} = input
  if (!(rule instanceof CSSConditionRule)) return []
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
